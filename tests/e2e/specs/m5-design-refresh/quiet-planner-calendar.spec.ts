import { expect, Page } from '@playwright/test';
import { activate, evidence, fitsPage, signIn, test } from '../../support/mobile';
import { scan } from '../../support/accessibility';
import { addHours, nextMonday } from '../../support/data';
import type { Family } from '../../support/family';

// #729: the approved Quiet Planner Month, Week and List (Figma 2139:2). Synthetic family: Dad and Mom with Kai and
// Aurora; Mom's parenting time Sunday to Tuesday and Dad's on the weekend; two activities at the same time, a
// proposed and a declined family event, and Mom's unavailable time.
const monday = nextMonday();
const tuesday = addHours(monday, 24).toISOString().slice(0, 10);
const local = (day: number, hour: number) => addHours(monday, day * 24 + hour + 6).toISOString();

async function seed({ dad, mom, familyId, kaiId }: Family) {
  const path = `/api/families/${familyId}/calendar/events`;
  const aurora = await dad.json<{ changeRequestId: string; id: string }>(dad.post(`/api/families/${familyId}/children`, { firstName: 'Aurora' }));
  await mom.json(mom.post(`/api/families/${familyId}/approvals/${aurora.changeRequestId}/approve`, {}));
  const { members } = await dad.json<{ members: { membershipId: string; displayName: string }[] }>(dad.get(`/api/families/${familyId}`));
  const id = (name: string) => members.find(m => m.displayName === name)!.membershipId;
  const both = [kaiId, aurora.id];
  const approved = async (by: typeof dad, other: typeof dad, body: object) => {
    const made = await by.json<{ changeRequestId?: string | null }>(by.post(path, body));
    if (made.changeRequestId) await other.json(other.post(`/api/families/${familyId}/approvals/${made.changeRequestId}/approve`, {}));
  };
  await approved(mom, dad, { category: 'ParentingTime', title: 'With Mom', childIds: both, caregiverMembershipId: id('Mom'), allDay: true, startsAt: local(-1, 0), endsAt: local(2, 0) });
  await approved(dad, mom, { category: 'ParentingTime', title: 'With Dad', childIds: both, caregiverMembershipId: id('Dad'), allDay: true, startsAt: local(5, 0), endsAt: local(7, 0) });
  await approved(dad, mom, { category: 'Activity', title: 'Soccer practice', childIds: [kaiId], startsAt: local(1, 16.5), endsAt: local(1, 17.5) });
  await approved(dad, mom, { category: 'Activity', title: 'School rehearsal', childIds: [aurora.id], startsAt: local(1, 16.5), endsAt: local(1, 17.5) });
  await approved(dad, mom, { category: 'Activity', title: 'Piano lesson', childIds: [aurora.id], startsAt: local(6, 10), endsAt: local(6, 11) });
  await mom.json(mom.post(path, { category: 'Joint', title: 'Dinner', childIds: both, startsAt: local(1, 18), endsAt: local(1, 19) }));
  const picnic = await mom.json<{ changeRequestId: string }>(mom.post(path, { category: 'Joint', title: 'Picnic', childIds: both, startsAt: local(3, 12), endsAt: local(3, 13) }));
  await dad.json(dad.post(`/api/families/${familyId}/approvals/${picnic.changeRequestId}/reject`, { comment: 'Synthetic conflict' }));
  await mom.json(mom.post(path, { category: 'Unavailable', startsAt: local(4, 15), endsAt: local(4, 16) }));
}

const open = async (page: Page, view: 'week' | 'month' | 'list') => {
  await page.goto(`/calendar?date=${tuesday}&view=${view}`);
  await expect(page.locator(`app-calendar-${view}`)).toBeVisible();
};

for (const theme of ['light', 'dark'] as const) {
  test(`Quiet Planner Month, Week and List keep their approved structure (${theme}) #729 @m5 @mobile @regression`, async ({ page, family }, info) => {
    test.setTimeout(120_000);
    await seed(family);
    await page.emulateMedia({ colorScheme: theme });
    await signIn(page, family.dad.email);
    const phone = page.viewportSize()!.width < 1024;
    const art = page.locator('img.topbar__art');
    const key = page.getByRole('list', { name: 'Calendar key' });

    // Month: a parenting-time row per week, continuous; proposals labelled; a busy day counts what doesn't fit.
    await open(page, 'month');
    const momBar = page.locator('app-calendar-month').getByRole('button', { name: /^(Mom, )?With Mom/ }).and(page.locator('.bar--parenting'));
    await expect(momBar.first()).toBeVisible();
    expect(await momBar.first().evaluate(el => getComputedStyle(el).gridRowStart)).toBe('2');
    if (phone) {
      // Phones: names only on the bars, and the chosen day's agenda lists everyone with their photos.
      await expect(momBar.first().locator('.bar__title')).toHaveText('Mom');
      // The bar's name starts with what it shows (WCAG 2.5.3, #733).
      await expect(page.locator('app-calendar-month .bar--parenting').first()).toHaveAccessibleName(/^Mom, /);
      await expect(key).toHaveCount(0);
      await expect(art).toBeHidden();
      const agenda = page.locator('app-calendar-month .agenda');
      await expect(agenda.getByRole('heading', { level: 3 })).toContainText('Tuesday');
      await expect(agenda.getByText(/1 proposed/)).toBeVisible();
      await expect(agenda.getByRole('button', { name: /^Dinner/ }).locator('app-avatar')).toHaveCount(4);
      const grid = page.locator('app-calendar-month .month');
      const bottomNav = page.locator('[data-bottom-nav]');
      const firstDay = grid.locator('.day__number').first();
      await activate(firstDay, info);
      await expect(firstDay).toHaveAttribute('aria-pressed', 'true');
      await expect(agenda.getByRole('heading', { level: 3 })).toBeInViewport();
      await expect.poll(async () => {
        const gridBox = await grid.boundingBox();
        const agendaBox = await agenda.boundingBox();
        return !!gridBox && !!agendaBox && agendaBox.y >= gridBox.y + gridBox.height - 1;
      }).toBe(true);
      await expect.poll(async () => {
        const agendaBox = await agenda.boundingBox();
        const navBox = await bottomNav.boundingBox();
        return !!agendaBox && !!navBox && agendaBox.y + agendaBox.height <= navBox.y + 1;
      }).toBe(true);
      // A neighbouring month's day in the grid can be chosen too (#733).
      const outside = page.locator('app-calendar-month .day--outside .day__number').last();
      await outside.evaluate(el => el.scrollIntoView({ block: 'start' }));
      const outsideName = /^[^.,]+, [^.,]+/.exec((await outside.getAttribute('aria-label')) ?? '')?.[0] ?? '';
      await activate(outside, info);
      await expect(outside).toHaveAttribute('aria-pressed', 'true');
      await expect(agenda.getByRole('heading', { level: 3 })).toHaveText(outsideName);
      await expect(agenda.getByRole('heading', { level: 3 })).toBeInViewport();

      // On a short phone, the last week must still be selectable without the agenda covering it.
      const viewport = page.viewportSize()!;
      await page.setViewportSize({ width: viewport.width, height: 568 });
      await grid.evaluate(el => el.scrollIntoView({ block: 'start' }));
      await expect(agenda.getByRole('heading', { level: 3 })).toBeInViewport();
      const finalWeekDay = grid.locator('.week').last().locator('.day__number').first();
      await activate(finalWeekDay, info);
      await expect(finalWeekDay).toHaveAttribute('aria-pressed', 'true');
      await expect(agenda.getByRole('heading', { level: 3 })).toBeInViewport();
      await page.setViewportSize(viewport);
      await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
      await expect.poll(async () => {
        const agendaBox = await agenda.boundingBox();
        const gridBox = await grid.boundingBox();
        return !!agendaBox && !!gridBox && agendaBox.y >= gridBox.y + gridBox.height - 1;
      }).toBe(true);
    } else {
      await expect(momBar.first().locator('app-avatar')).not.toHaveCount(0);
      await expect(page.locator('app-calendar-month .bar[data-status="pending"]', { hasText: 'Proposed · Dinner' })).toBeVisible();
      await expect(page.locator('app-calendar-month .more').first()).toHaveText(/^\s*\+\d+ more$/);
      await expect(page.locator('app-calendar-month .bar[data-status="declined"] .bar__title--declined')).toHaveText('Picnic');
      // The approved artwork: decorative, above the calendar panel, never over it.
      await expect(art).toBeVisible();
      await expect(art).toHaveAttribute('alt', '');
      const panel = (await page.locator('app-calendar-page .panel').boundingBox())!;
      const artBox = (await art.boundingBox())!;
      expect(artBox.y + artBox.height).toBeLessThanOrEqual(panel.y + 1);
      expect(artBox.width).toBeGreaterThan(300);
    }
    await fitsPage(page);
    await evidence(page, info, `quiet-month-${theme}`);
    await scan(page, info, `quiet-month-${theme}`);

    // Week.
    await open(page, 'week');
    if (phone) {
      const strip = page.locator('app-calendar-week .strip');
      const days = strip.getByRole('button');
      const agenda = page.locator('app-calendar-week .agenda');
      await expect(days.nth(2)).toHaveAttribute('aria-pressed', 'true');
      await expect(agenda.getByText(/4:30\sPM · 2 events at the same time/)).toBeVisible();
      // Sunday then Friday slides the agenda in from the right; Friday then Sunday from the left. The strip stays put.
      const stripBox = (await strip.boundingBox())!;
      await activate(days.nth(0), info);
      await activate(days.nth(5), info);
      await expect(agenda.locator('.agenda__day')).toHaveCount(1);
      await expect(agenda.locator('.agenda__day')).toHaveAttribute('data-slide', 'next');
      await expect(agenda.getByRole('heading', { level: 3 })).toContainText('Friday');
      const slide = await agenda.locator('.agenda__day').evaluate(el => {
        const style = getComputedStyle(el);
        return { name: style.animationName, duration: style.animationDuration, easing: style.animationTimingFunction };
      });
      expect(slide).toEqual({ name: expect.stringMatching(/agenda-from-right$/), duration: '0.3s', easing: 'ease-out' });
      await activate(days.nth(0), info);
      await expect(agenda.locator('.agenda__day')).toHaveAttribute('data-slide', 'previous');
      expect(await agenda.locator('.agenda__day').evaluate(el => getComputedStyle(el).animationName)).toMatch(/agenda-from-left$/);
      await expect(agenda.getByRole('heading', { level: 3 })).toContainText('Sunday');
      await expect(agenda.getByRole('button', { name: /Picnic/ })).toHaveCount(0);
      expect(await strip.boundingBox()).toEqual(stripBox);
      await expect(days.nth(0)).toHaveAttribute('aria-pressed', 'true');
      // Reduced motion: the day changes at once.
      await page.emulateMedia({ colorScheme: theme, reducedMotion: 'reduce' });
      await activate(days.nth(5), info);
      await expect(agenda.getByRole('heading', { level: 3 })).toContainText('Friday');
      await expect.poll(() => agenda.locator('.agenda__day').evaluate(el => getComputedStyle(el).animationName)).toBe('none');
      await page.emulateMedia({ colorScheme: theme, reducedMotion: 'no-preference' });
      await activate(days.nth(2), info);
    } else {
      const group = page.locator('app-calendar-week li.group');
      await expect(group.locator('.group__head')).toHaveText(/^4:30\sPM · 2 events$/);
      await expect(group.getByRole('button')).toHaveCount(2);
      // The all-day parenting row, and the grid opening on a complete hour row.
      await expect(page.locator('app-calendar-week .allday').getByRole('button', { name: /^With Mom/ })).toBeVisible();
      const opening = await page.locator('app-calendar-week .grid__body').evaluate(el => el.scrollTop % 44);
      expect(opening).toBe(0);
      // The key is pinned under the grid while the hours scroll.
      const pinned = (await key.boundingBox())!;
      await page.locator('app-calendar-week .grid__body').evaluate(el => el.scrollTo(0, el.scrollHeight));
      expect((await key.boundingBox())!.y).toBeCloseTo(pinned.y, 0);
      await expect(key.getByRole('listitem').filter({ hasText: 'Mom’s parenting time' })).toHaveCount(1);
      await expect(key.getByRole('listitem').filter({ hasText: /^Proposed$/ })).toHaveCount(1);
    }
    await fitsPage(page);
    await evidence(page, info, `quiet-week-${theme}`);
    await scan(page, info, `quiet-week-${theme}`);

    // List: grouped by date, each card tinted by its type; proposals and declines say so in words.
    await open(page, 'list');
    const list = page.locator('app-calendar-list');
    await expect(list.getByRole('heading', { level: 3 }).first()).toBeVisible();
    const dinner = list.getByRole('button', { name: /^Dinner/ });
    const picnic = list.getByRole('button', { name: /^Picnic/ });
    await expect(dinner.locator('.status')).toHaveText(/^Proposed · $/);
    await expect(picnic.locator('.status')).toHaveText(/^Declined · $/);
    await expect(picnic.locator('.title')).toHaveCSS('text-decoration-line', 'line-through');
    const fill = (name: RegExp) => list.getByRole('button', { name }).first().evaluate(el => getComputedStyle(el).backgroundColor);
    expect(await fill(/^Dinner/)).toBe(await fill(/^Picnic/));
    expect(await fill(/^Soccer practice/)).not.toBe(await fill(/^Dinner/));
    await expect(dinner.locator('app-avatar')).toHaveCount(4);
    if (!phone) await expect(key).toBeVisible();
    await fitsPage(page);
    await evidence(page, info, `quiet-list-${theme}`);
    await scan(page, info, `quiet-list-${theme}`);
  });
}
