import { expect } from '@playwright/test';
import { test, signIn } from '../../support/mobile';
import { analyze, scan, describedReason } from '../../support/accessibility';
import { addHours, nextMonday } from '../../support/data';
import type { Page } from '@playwright/test';

const monday = nextMonday();
const date = addHours(monday, 24).toISOString().slice(0, 10);
const label = (offset: number) => addHours(monday, offset * 24).toLocaleDateString('en-US', {
  weekday: 'long', month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC',
});

/** Follow Material's roving active date, rather than programmatically focusing an otherwise untabbable cell. */
async function chooseWithKeyboard(page: Page, target: string) {
  const active = page.locator('mat-calendar .mat-calendar-body-active');
  await expect(active).toBeFocused();
  for (let step = 0; step < 40; step++) {
    await expect(active).toBeFocused();
    const current = await active.getAttribute('aria-label');
    if (current === target) {
      await page.keyboard.press('Enter');
      return;
    }
    await page.keyboard.press(Date.parse(current!) < Date.parse(target) ? 'ArrowRight' : 'ArrowLeft');
    await expect(active).not.toHaveAttribute('aria-label', current!);
  }
  throw new Error(`Could not navigate the date picker to ${target}`);
}

test.describe('Calendar accessibility acceptance', { tag: ['@m3', '@a11y'] }, () => {
  test.setTimeout(120_000);
  test('controlled scanner regression detects an unlabeled control and passes after restoration', async ({ page }, info) => {
    await page.setContent('<!doctype html><html lang="en"><head><title>Scanner control</title></head><body><main><h1>Scanner control</h1><input id="control"></main></body></html>');
    const broken = await analyze(page);
    expect(broken.violations.map(v => v.id)).toContain('label');
    await info.attach('controlled-label-failure', { body: JSON.stringify({ ruleIds: broken.violations.map(v => v.id), profile: info.project.name }), contentType: 'application/json' });
    await page.locator('#control').evaluate(el => el.setAttribute('aria-label', 'Synthetic control'));
    expect((await analyze(page)).violations).toEqual([]);
  });
  for (const theme of ['light', 'dark'] as const) {
    test(`save failure recovery preserves input and success toast never takes focus, ${theme}`, async ({ page, family }, info) => {
      await page.emulateMedia({ colorScheme: theme, reducedMotion: 'reduce' });
      const path = `/api/families/${family.familyId}/calendar/events`;
      const activity = await family.dad.json<{ id: string }>(family.dad.post(path, {
        category: 'Activity', title: 'Recoverable practice', childIds: [family.kaiId],
        startsAt: addHours(monday, 40).toISOString(), endsAt: addHours(monday, 41).toISOString(),
      }));
      await signIn(page, family.dad.email);
      await page.goto(`/calendar/${activity.id}/edit`);
      await page.getByLabel('Title', { exact: true }).fill('Recovered practice');
      await page.getByLabel('Notes (optional)', { exact: true }).fill('Synthetic recovery note');
      // Fail the browser's first save without mutating the isolated API fixture.
      const endpoint = `**${path}/${activity.id}`;
      await page.route(endpoint, route => route.request().method() === 'PATCH'
        ? route.fulfill({ status: 503, contentType: 'application/problem+json', body: JSON.stringify({ status: 503, title: 'Synthetic service interruption', detail: 'Synthetic retry is safe.' }) })
        : route.continue());
      await page.getByRole('button', { name: 'Save changes', exact: true }).press('Enter');
      const error = page.getByRole('alert').filter({ hasText: 'Synthetic service interruption' });
      await expect(error).toBeFocused();
      await expect(page.getByLabel('Title', { exact: true })).toHaveValue('Recovered practice');
      await expect(page.getByLabel('Notes (optional)', { exact: true })).toHaveValue('Synthetic recovery note');
      const unchanged = await family.dad.json<{ title: string }>(family.dad.get(`${path}/${activity.id}`));
      expect(unchanged.title).toBe('Recoverable practice');
      await scan(page, info, `${theme}-save-error`);
      await page.unroute(endpoint);
      await page.getByRole('button', { name: 'Save changes', exact: true }).press('Enter');
      await expect(page).toHaveURL(/\/calendar\?date=/);
      const host = page.locator('app-toast-host');
      const message = host.locator('.toast', { hasText: 'Recovered practice' });
      await expect(message).toHaveCount(1);
      await expect(host.locator('[role="status"][aria-live="polite"]')).toHaveCount(1);
      expect(await host.evaluate(el => el.contains(document.activeElement))).toBe(false);
      // The notification must not replay merely because the calendar reloads.
      await scan(page, info, `${theme}-save-recovered-toast`);
      await page.reload();
      await expect(page.getByRole('heading', { name: 'Calendar', exact: true, level: 1 })).toBeVisible();
      await expect(host.locator('.toast')).toHaveCount(0);
    });

    test(`repeated Month occurrences have distinct full dates and return focus, ${theme}`, async ({ page, family }, info) => {
      await page.emulateMedia({ colorScheme: theme });
      const path = `/api/families/${family.familyId}/calendar/events`;
      const repeatStart = new Date(Date.UTC(new Date().getUTCFullYear() + 1, 11, 28, 16));
      await family.dad.json(family.dad.post(path, {
        category: 'Activity', title: 'Weekly accessible practice', childIds: [family.kaiId],
        startsAt: repeatStart.toISOString(), endsAt: addHours(repeatStart, 1).toISOString(),
        repeat: { frequency: 'Weekly', interval: 1, days: [repeatStart.toLocaleDateString('en-US', { weekday: 'long', timeZone: 'America/Chicago' })], count: 2 },
      }));
      await signIn(page, family.dad.email);
      const occurrences = await family.dad.json<{ id: string; startsAt: string; title: string }[]>(family.dad.get(path, {
        from: repeatStart.toISOString(), to: addHours(repeatStart, 14 * 24).toISOString(),
      }));
      expect(occurrences).toHaveLength(2);
      for (const occurrence of occurrences) {
        const localDate = new Date(occurrence.startsAt).toLocaleDateString('en-CA', { timeZone: 'America/Chicago' });
        const fullDate = new Date(occurrence.startsAt).toLocaleDateString('en-US', {
          weekday: 'long', month: 'long', day: 'numeric', year: 'numeric', timeZone: 'America/Chicago',
        });
        // Navigate separately so the test also works when the two dates straddle a month boundary.
        await page.goto(`/calendar?date=${localDate}&view=month`);
        const bar = page.getByRole('button', { name: new RegExp(fullDate) }).filter({ hasText: 'Weekly accessible practice' });
        await expect(bar).toHaveCount(1);
        await bar.press('Enter');
        const dialog = page.getByRole('dialog');
        await expect(dialog.getByRole('heading', { name: 'Weekly accessible practice', exact: true })).toBeFocused();
        await expect(dialog).toContainText(new RegExp(fullDate.replace(/, \d{4}$/, '')));
        await dialog.getByRole('button', { name: 'Close details' }).press('Enter');
        await expect(bar).toBeFocused();
      }
      await scan(page, info, `${theme}-repeated-month`);
    });

    test(`continued Month segments name the full range and restore focus, ${theme}`, async ({ page, family }, info) => {
      await page.emulateMedia({ colorScheme: theme });
      const year = new Date().getUTCFullYear() + 1;
      const firstFriday = 1 + ((5 - new Date(Date.UTC(year, 4, 1)).getUTCDay() + 7) % 7);
      const start = new Date(Date.UTC(year, 4, firstFriday, 5)); // Chicago midnight in May.
      const end = addHours(start, 5 * 24); // Friday through Tuesday, across two week rows.
      await family.dad.json(family.dad.post(`/api/families/${family.familyId}/calendar/events`, {
        category: 'Activity', title: 'Accessible continued camp', childIds: [family.kaiId],
        allDay: true, startsAt: start.toISOString(), endsAt: end.toISOString(),
      }));
      await signIn(page, family.dad.email);
      await page.goto(`/calendar?date=${start.toISOString().slice(0, 10)}&view=month`);
      const bars = page.locator('app-calendar-month .bar', { hasText: 'Accessible continued camp' });
      await expect(bars).toHaveCount(2);
      for (let segment = 0; segment < 2; segment++) {
        const bar = bars.nth(segment);
        for (const instant of [start, addHours(end, -24)]) {
          await expect(bar).toHaveAccessibleName(new RegExp(instant.toLocaleDateString('en-US', {
            weekday: 'long', month: 'long', day: 'numeric', year: 'numeric', timeZone: 'America/Chicago',
          })));
        }
        await bar.press('Enter');
        const dialog = page.getByRole('dialog');
        await expect(dialog.getByRole('heading', { name: 'Accessible continued camp', exact: true })).toBeFocused();
        await dialog.getByRole('button', { name: 'Close details' }).press('Enter');
        await expect(bar).toBeFocused();
      }
      await scan(page, info, `${theme}-continued-month`);
    });

    test(`rendered calendar, details and approvals, ${theme}`, async ({ page, family }, info) => {
      await page.emulateMedia({ colorScheme: theme });
      const path = `/api/families/${family.familyId}/calendar/events`;
      const at = (hours: number) => addHours(monday, hours).toISOString();
      const activity = await family.dad.json<{ id: string }>(family.dad.post(path, {
        category: 'Activity', title: 'Accessibility practice', startsAt: at(40), endsAt: at(41), childIds: [family.kaiId],
      }));
      await family.mom.json(family.mom.post(path, { category: 'Unavailable', startsAt: at(42), endsAt: at(43), notes: 'PRIVATE_A11Y_SENTINEL' }));
      const proposal = await family.mom.json<{ changeRequestId: string }>(family.mom.post(path, {
        category: 'Joint', title: 'Pending school meeting', startsAt: at(44), endsAt: at(45), childIds: [family.kaiId],
      }));
      const declined = await family.mom.json<{ changeRequestId: string }>(family.mom.post(path, {
        category: 'Joint', title: 'Declined school meeting', startsAt: at(46), endsAt: at(47), childIds: [family.kaiId],
      }));
      await family.dad.json(family.dad.post(`/api/families/${family.familyId}/approvals/${declined.changeRequestId}/reject`, { comment: 'Synthetic conflict' }));
      expect(proposal.changeRequestId).toBeTruthy();
      const members = await family.mom.json<{ members: { membershipId: string; displayName: string }[] }>(family.mom.get(`/api/families/${family.familyId}`));
      const parenting = await family.mom.json<{ id: string; changeRequestId: string }>(family.mom.post(path, {
        category: 'ParentingTime', title: 'Swap source', childIds: [family.kaiId],
        caregiverMembershipId: members.members.find(m => m.displayName === 'Mom')!.membershipId,
        startsAt: at(88), endsAt: at(89),
      }));
      await family.dad.json(family.dad.post(`/api/families/${family.familyId}/approvals/${parenting.changeRequestId}/approve`, {}));
      await signIn(page, family.dad.email);
      await page.goto('/');
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
      await scan(page, info, `${theme}-home`);
      for (const view of ['week', 'month', 'list']) {
        await page.goto(`/calendar?date=${date}&view=${view}`);
        await expect(page.getByRole('button', { name: /Accessibility practice/ }).first()).toBeVisible();
        await expect(page.locator('body')).not.toContainText('PRIVATE_A11Y_SENTINEL');
        await scan(page, info, `${theme}-${view}`);
        // A pending or declined proposal must never be announced as a confirmed calendar change. Month shares this
        // Tuesday with three other items and may fold them into "+N more", so its "Proposed" name is unit-tested.
        if (view !== 'month') {
          for (const [title, status] of [['Pending school meeting', /Pending approval/], ['Declined school meeting', /Declined/]] as const) {
            const item = page.getByRole('button', { name: new RegExp(title) }).first();
            await expect(item).toHaveAccessibleName(status);
            await expect(item).not.toHaveAccessibleName(/Confirmed/);
          }
        }
        const trigger = page.getByRole('button', { name: /Accessibility practice/ }).first();
        if (view === 'month') await expect(trigger).toHaveAccessibleName(new RegExp(`${label(1)}`));
        await trigger.focus();
        await page.keyboard.press('Enter');
        const dialog = page.getByRole('dialog');
        await expect(dialog.getByRole('heading', { name: 'Accessibility practice', exact: true })).toBeFocused();
        await scan(page, info, `${theme}-${view}-details`);
        await dialog.getByRole('button', { name: 'Close details' }).press('Enter');
        await expect(trigger).toBeFocused();
      }
      await page.goto(`/calendar/${activity.id}/edit`);
      await expect(page.getByRole('heading', { name: 'Edit event', exact: true })).toBeVisible();
      await scan(page, info, `${theme}-edit`);
      for (const form of ['edit', 'swap']) {
        if (form === 'swap') {
          await page.goto(`/calendar/${parenting.id}/swap`);
          await expect(page.locator('#swap-start-date')).toBeVisible();
          await scan(page, info, `${theme}-swap`);
        }
        const start = page.locator(`#${form}-start-date`), end = page.locator(`#${form}-end-date`);
        await start.press('Enter');
        await expect(page.locator('mat-calendar')).toBeVisible();
        await scan(page, info, `${theme}-${form}-picker`);
        await chooseWithKeyboard(page, label(5));
        await expect(page.locator('mat-calendar')).toHaveCount(0);
        await expect(start).toBeFocused();
        await describedReason(page, `#${form}-end-date`, /end|start|before|after/i);
        await page.getByRole('button', { name: form === 'edit' ? 'Save changes' : 'Continue', exact: true }).press('Enter');
        await expect(end).toBeFocused();
        await scan(page, info, `${theme}-${form}-invalid`);
        await end.press('Enter');
        await chooseWithKeyboard(page, label(5));
        await expect(page.locator('mat-calendar')).toHaveCount(0);
        await expect(end).toHaveAttribute('aria-invalid', 'false');
        await scan(page, info, `${theme}-${form}-corrected`);
      }
      await page.goto('/approvals');
      const waiting = page.locator('section[aria-labelledby="waiting-heading"] li', { hasText: 'Pending school meeting' });
      await expect(waiting).toContainText('Waiting for you');
      await expect(page.locator('section[aria-labelledby="history-heading"] li', { hasText: 'Declined school meeting' })).toContainText('Declined');
      await expect(page.getByRole('button', { name: 'Approve', exact: true }).first()).toBeVisible();
      await scan(page, info, `${theme}-approvals`);
      // Open decline form: scanned, then cancelled by keyboard without deciding the synthetic proposal.
      await waiting.getByRole('button', { name: 'Decline', exact: true }).press('Enter');
      const reason = waiting.getByRole('textbox', { name: 'Tell your co-parent why (optional)' });
      await expect(reason).toBeVisible();
      await reason.fill('Synthetic draft reason');
      await scan(page, info, `${theme}-approvals-decline`);
      await waiting.getByRole('button', { name: 'Cancel', exact: true }).press('Enter');
      await expect(reason).toHaveCount(0);
      // Closing the form returns focus to the Decline button that opened it, never to the page body.
      await expect(waiting.getByRole('button', { name: 'Decline', exact: true })).toBeFocused();
      await expect(waiting.getByRole('button', { name: 'Approve', exact: true })).toBeVisible();
      const stillPending = await family.dad.json<{ id: string }[]>(family.dad.get(`/api/families/${family.familyId}/approvals`));
      expect(stillPending.map(r => r.id)).toContain(proposal.changeRequestId);
    });

    test(`forms, picker, invalid recovery and deletion focus, ${theme}`, async ({ page, family }, info) => {
      await page.emulateMedia({ colorScheme: theme, reducedMotion: 'reduce' });
      await signIn(page, family.dad.email);
      await page.goto(`/calendar/new?date=${date}`);
      await page.getByRole('button', { name: /Parenting time/ }).press('Enter');
      await scan(page, info, `${theme}-add`);
      const start = page.locator('#add-start-date'), end = page.locator('#add-end-date');
      await start.press('Enter');
      await expect(page.locator('mat-calendar')).toBeVisible();
      await scan(page, info, `${theme}-picker`);
      await chooseWithKeyboard(page, label(4));
      await expect(page.locator('mat-calendar')).toHaveCount(0);
      await expect(start).toBeFocused();
      await describedReason(page, '#add-end-date', /end|start|before|after/i);
      await page.getByLabel('Kai').check();
      await page.getByRole('button', { name: 'Send for approval', exact: true }).press('Enter');
      await expect(end).toBeFocused();
      await scan(page, info, `${theme}-invalid`);
      await end.press('Space');
      await chooseWithKeyboard(page, label(4));
      await expect(page.locator('mat-calendar')).toHaveCount(0);
      await expect(end).toBeFocused();
      await expect(end).toHaveAttribute('aria-invalid', 'false');
      await scan(page, info, `${theme}-corrected`);
      for (const kind of ['Reminder', 'Task']) {
        await page.getByRole('button', { name: new RegExp(kind) }).press('Enter');
        await expect(page.getByRole('button', { name: new RegExp(kind) })).toHaveAttribute('aria-pressed', 'true');
        await scan(page, info, `${theme}-${kind.toLowerCase()}-form`);
      }
      await page.getByRole('button', { name: /Reminder/ }).press('Enter');
      await expect(page.getByRole('button', { name: /Reminder/ })).toHaveAttribute('aria-pressed', 'true');
      await expect(page.getByRole('form', { name: 'Reminder details' })).toBeVisible();
      await page.getByLabel('Title', { exact: true }).fill('Accessible reminder');
      const dateField = page.getByLabel('Date', { exact: true });
      await expect(dateField).toHaveAccessibleDescription(/Date format: MM\/DD\/YYYY or YYYY-MM-DD/);
      await page.getByRole('button', { name: 'Add to calendar', exact: true }).press('Enter');
      await expect(page.locator('app-toast-host .toast')).toContainText('Accessible reminder');
      await expect(page.locator('app-toast-host [role="status"]')).toHaveAttribute('aria-live', 'polite');
      expect(await page.locator('app-toast-host').evaluate(el => el.contains(document.activeElement))).toBe(false);
      await scan(page, info, `${theme}-toast`);
      await page.goto(`/calendar?date=${date}&view=list`);
      await page.getByRole('button', { name: /Accessible reminder/ }).press('Enter');
      const dialog = page.getByRole('dialog');
      await expect(dialog.getByRole('heading', { name: 'Accessible reminder', exact: true })).toBeFocused();
      await dialog.getByRole('button', { name: 'Delete reminder…', exact: true }).press('Enter');
      await expect(dialog.getByRole('button', { name: 'Keep it', exact: true })).toBeFocused();
      await scan(page, info, `${theme}-delete-confirmation`);
      await dialog.getByRole('button', { name: 'Keep it', exact: true }).press('Enter');
      await expect(dialog.getByRole('button', { name: 'Delete reminder…', exact: true })).toBeFocused();
      await dialog.getByRole('button', { name: 'Delete reminder…', exact: true }).press('Enter');
      await dialog.getByRole('button', { name: 'Yes, delete', exact: true }).press('Enter');
      await expect(dialog).toHaveCount(0);
      await expect(page.getByRole('heading', { level: 1, name: 'Calendar', exact: true })).toBeFocused();
      await scan(page, info, `${theme}-deleted`);
      await family.dad.json(family.dad.post(`/api/families/${family.familyId}/calendar/tasks`, { title: 'Accessible task', dueDate: date }));
      await page.reload();
      await page.getByRole('button', { name: /Accessible task/ }).press('Enter');
      await expect(dialog.getByRole('heading', { name: 'Accessible task', exact: true })).toBeFocused();
      await dialog.getByRole('button', { name: 'Delete task…', exact: true }).press('Enter');
      await expect(dialog.getByRole('button', { name: 'Keep it', exact: true })).toBeFocused();
      await scan(page, info, `${theme}-task-delete-confirmation`);
      await dialog.getByRole('button', { name: 'Yes, delete', exact: true }).press('Enter');
      await expect(dialog).toHaveCount(0);
      await expect(page.getByRole('heading', { level: 1, name: 'Calendar', exact: true })).toBeFocused();
      await scan(page, info, `${theme}-task-deleted`);
    });
  }
});
