import { expect, type Page, type TestInfo } from '@playwright/test';
import { test, activate, evidence, fitsPage, signIn } from '../../support/mobile';
import { addHours, nextMonday } from '../../support/data';
import { describedReason } from '../../support/accessibility';

const monday = nextMonday();
const date = addHours(monday, 24).toISOString().slice(0, 10);
const at = (hours: number) => addHours(monday, hours).toISOString();
const dayLabel = (offset: number) => addHours(monday, offset * 24).toLocaleDateString('en-US', {
  weekday: 'long', month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC',
});

async function chooseDay(page: Page, info: TestInfo, label: string) {
  const cell = page.locator(`.mat-calendar-body-cell[aria-label="${label}"]`);
  // Wait for the current month to render before deciding whether to advance it.
  await expect(page.locator('.mat-calendar-body-cell').first()).toBeVisible();
  // This test moves at most one week forward; the target can be in the next month.
  if (!(await cell.count())) await activate(page.getByRole('button', { name: 'Next month', exact: true }), info);
  await activate(cell, info);
  await expect(page.locator('mat-calendar')).toHaveCount(0);
}

test.describe('Mobile recovery and family time boundaries', { tag: ['@m3', '@mobile'] }, () => {
  test.setTimeout(120_000);
  test('controlled overflow regression is detected and passes after restoration (#278)', async ({ page }, info) => {
    await page.setContent('<!doctype html><html lang="en"><head><title>Reflow control</title></head><body><main><h1>Reflow control</h1><div id="control">Synthetic control</div></main></body></html>');
    await page.locator('#control').evaluate(el => { el.style.width = '200vw'; });
    await expect(fitsPage(page)).rejects.toThrow();
    await evidence(page, info, 'controlled-overflow-detected');
    await page.locator('#control').evaluate(el => { el.style.width = '100%'; });
    await fitsPage(page);
    await evidence(page, info, 'controlled-overflow-restored');
  });
  for (const theme of ['light', 'dark'] as const) {
    test(`past days stay disabled and today can correct a stale Add link, ${theme} (#232 #248 #249)`, async ({ page, family }, info) => {
      await page.emulateMedia({ colorScheme: theme });
      const year = new Date().getUTCFullYear() + 1;
      const today = `${year}-10-20`, yesterday = `${year}-10-19`;
      // Freeze the browser's date only; the isolated API and authentication remain real.
      await page.clock.setFixedTime(new Date(`${today}T17:00:00Z`));
      await signIn(page, family.dad.email);
      await page.goto(`/calendar/new?date=${yesterday}`);
      await activate(page.getByRole('button', { name: /Activity/ }), info);
      const label = (day: string) => new Date(`${day}T12:00:00Z`).toLocaleDateString('en-US', {
        weekday: 'long', month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC',
      });
      await activate(page.locator('#add-start-date'), info);
      await expect(page.locator(`.mat-calendar-body-cell[aria-label="${label(yesterday)}"]`)).toBeDisabled();
      const todayCell = page.locator(`.mat-calendar-body-cell[aria-label="${label(today)}"]`);
      await expect(todayCell).toBeEnabled();
      await activate(todayCell, info);
      await expect(page.locator('mat-calendar')).toHaveCount(0);
      await activate(page.locator('#add-end-date'), info);
      await activate(page.locator(`.mat-calendar-body-cell[aria-label="${label(today)}"]`), info);
      await expect(page.locator('mat-calendar')).toHaveCount(0);
      await expect(page.locator('#add-start-date')).toHaveAttribute('aria-invalid', 'false');
      await expect(page.locator('#add-end-date')).toHaveAttribute('aria-invalid', 'false');
      await expect(page).toHaveURL(/\/calendar\/new/);
      await evidence(page, info, `${theme}-past-today-recovery`);
    });
    test(`touch Edit and Swap preserve invalid dates until correction, ${theme} (#248 #249)`, async ({ page, family }, info) => {
      await page.emulateMedia({ colorScheme: theme, reducedMotion: 'reduce' });
      const path = `/api/families/${family.familyId}/calendar/events`;
      const activity = await family.dad.json<{ id: string }>(family.dad.post(path, {
        category: 'Activity', title: 'Touch recovery practice', childIds: [family.kaiId], startsAt: at(40), endsAt: at(41),
      }));
      const members = await family.mom.json<{ members: { membershipId: string; displayName: string }[] }>(family.mom.get(`/api/families/${family.familyId}`));
      const parenting = await family.mom.json<{ id: string; changeRequestId: string }>(family.mom.post(path, {
        category: 'ParentingTime', title: 'Touch swap source', childIds: [family.kaiId],
        caregiverMembershipId: members.members.find(m => m.displayName === 'Mom')!.membershipId,
        startsAt: at(88), endsAt: at(89),
      }));
      await family.dad.json(family.dad.post(`/api/families/${family.familyId}/approvals/${parenting.changeRequestId}/approve`, {}));
      await signIn(page, family.dad.email);
      const writes: string[] = [];
      page.on('request', request => {
        if (request.url().includes(path) && ['POST', 'PATCH', 'PUT', 'DELETE'].includes(request.method())) writes.push(request.url());
      });
      for (const [kind, id] of [['edit', activity.id], ['swap', parenting.id]] as const) {
        await page.goto(`/calendar/${id}/${kind}`);
        const start = page.locator(`#${kind}-start-date`), end = page.locator(`#${kind}-end-date`);
        await expect(end).toHaveValue(/\d{1,2}\/\d{1,2}\/\d{4}/);
        const originalEnd = await end.inputValue();
        await activate(start, info);
        await expect(page.locator('mat-calendar')).toBeVisible();
        await chooseDay(page, info, dayLabel(5));
        await expect(start).toBeFocused();
        await expect(end).toHaveValue(originalEnd);
        await describedReason(page, `#${kind}-end-date`, /end|start|before|after/i);
        if (kind === 'swap') {
          await page.evaluate(() => {
            const events: { type: string; target: string; active: string; time: number; detail?: string }[] = [];
            (window as unknown as { focusDiagnostic: typeof events }).focusDiagnostic = events;
            const describe = (element: Element | null) => element ? `${element.tagName.toLowerCase()}#${element.id}` : 'none';
            const originalFocus = HTMLElement.prototype.focus;
            HTMLElement.prototype.focus = function(options?: FocusOptions) {
              if (events.length < 150) events.push({ type: 'focus-call', target: describe(this), active: describe(document.activeElement), time: Math.round(performance.now()), detail: new Error().stack?.slice(0, 2500) });
              return originalFocus.call(this, options);
            };
            for (const type of ['pointerdown', 'pointerup', 'click', 'submit', 'invalid', 'focusin', 'focusout', 'scroll']) {
              document.addEventListener(type, event => {
                const element = event.target instanceof Element ? event.target : null;
                if (events.length < 150) events.push({ type, target: describe(element), active: describe(document.activeElement), time: Math.round(performance.now()), detail: JSON.stringify({ scrollY: window.scrollY, overlays: document.querySelectorAll('.cdk-overlay-pane, .cdk-overlay-backdrop').length, elementClass: element?.className }) });
              }, true);
            }
          });
        }
        const submit = page.getByRole('button', { name: kind === 'edit' ? 'Save changes' : 'Continue', exact: true });
        // Leave room around the button on mobile: WebKit can move the page during a tap near the viewport edge.
        await submit.evaluate(el => el.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'instant' }));
        await activate(submit, info);
        try {
          if (kind === 'swap') {
            await expect.poll(() => page.evaluate(() => (window as unknown as { focusDiagnostic: { type: string }[] }).focusDiagnostic.some(event => event.type === 'submit')), { message: 'Continue tap submits the swap form' }).toBe(true);
          }
          await expect(end).toBeFocused();
        } finally {
          if (kind === 'swap') {
            const diagnostic = await page.evaluate(() => ({ events: (window as unknown as { focusDiagnostic: unknown }).focusDiagnostic, active: document.activeElement?.outerHTML?.slice(0, 500) }));
            await info.attach('swap-focus-diagnostic', { body: JSON.stringify(diagnostic, null, 2), contentType: 'application/json' });
            console.log('Swap focus diagnostic:', JSON.stringify(diagnostic));
          }
        }
        await expect(page).toHaveURL(new RegExp(`/calendar/${id}/${kind}$`));
        await activate(end, info);
        // Keep a positive timed interval on the corrected day.
        await chooseDay(page, info, dayLabel(5));
        await expect(end).toHaveAttribute('aria-invalid', 'false');
        await expect(end).toBeFocused();
        await fitsPage(page);
        await evidence(page, info, `${theme}-touch-${kind}-corrected`);
        await activate(page.getByRole('link', { name: 'Cancel', exact: true }), info);
        await expect(page).toHaveURL(/\/calendar(?:\?date=[^&]+)?$/);
      }
      expect(writes, 'invalid submit and Cancel must not modify either event or submit a swap').toEqual([]);
      for (const [id, startsAt, endsAt] of [[activity.id, at(40), at(41)], [parenting.id, at(88), at(89)]]) {
        const saved = await family.dad.json<{ startsAt: string; endsAt: string; pendingChange: string }>(family.dad.get(`${path}/${id}`));
        expect(new Date(saved.startsAt).toISOString()).toBe(startsAt);
        expect(new Date(saved.endsAt).toISOString()).toBe(endsAt);
        expect(saved.pendingChange).toBe('None');
      }
    });

    test(`moving and clearing a slot never creates an event, ${theme} (#237)`, async ({ page, family }, info) => {
      await page.emulateMedia({ colorScheme: theme });
      const path = `/api/families/${family.familyId}/calendar/events`;
      // A completely empty calendar shows an empty state, not the interactive week grid.
      const existing = await family.dad.json<{ id: string }>(family.dad.post(path, {
        category: 'Activity', title: 'Slot fixture', childIds: [family.kaiId], startsAt: at(40), endsAt: at(41),
      }));
      await signIn(page, family.dad.email);
      for (const url of [`/calendar?view=week&date=${date}`, `/?week=${date}`]) {
        await page.goto(url);
        await expect(page.locator('.slot-add__button:visible, .tap-add__button:visible').first()).toBeVisible();
        for (const day of ['Tuesday', 'Wednesday']) {
          // Layout follows available container width, not whether the device supports touch.
          const agendaDay = page.locator('.agenda__day').filter({ hasText: new RegExp(`^\\s*${day.slice(0, 3)}`) });
          const agendaTarget = agendaDay.locator('.tap-add__button');
          if (await agendaTarget.isVisible()) {
            if (info.project.use.hasTouch) await agendaTarget.tap({ position: { x: 5, y: 5 } });
            else await agendaTarget.click({ position: { x: 5, y: 5 } });
          } else {
            const target = page.getByRole('button', { name: new RegExp(`^Add on ${day}`) }).first();
            if (info.project.use.hasTouch) await target.tap({ position: { x: 5, y: 5 } });
            else await target.click({ position: { x: 5, y: 5 } });
          }
          await expect(page.locator('.slot-pick__button:visible')).toHaveCount(1);
          await expect(page.locator('.slot-pick__button:visible')).toHaveAttribute('aria-label', new RegExp(`^Add on ${day}`));
        }
        await page.keyboard.press('Escape');
        await expect(page.locator('.slot-pick__button:visible')).toHaveCount(0);
        await expect(page).not.toHaveURL(/\/calendar\/new/);
        await evidence(page, info, `${theme}-${url.startsWith('/calendar') ? 'calendar' : 'home'}-slot-cleared`);
      }
      const events = await family.dad.json<unknown[]>(family.dad.get(`/api/families/${family.familyId}/calendar/events`, { from: at(0), to: at(168) }));
      expect(events).toHaveLength(1);
      expect(events[0]).toMatchObject({ id: existing.id, title: 'Slot fixture' });
    });
  }

  // Use next year's transitions so the tests never depend on editing a date in the past.
  const year = new Date().getUTCFullYear() + 1;
  const sunday = (month: number, nth: number) => 1 + ((7 - new Date(Date.UTC(year, month, 1)).getUTCDay()) % 7) + (nth - 1) * 7;
  const transitions = [
    { name: 'spring forward', month: 2, day: sunday(2, 2), before: '-06:00', after: '-05:00', elapsed: 1 },
    { name: 'fall back', month: 10, day: sunday(10, 1), before: '-05:00', after: '-06:00', elapsed: 3 },
  ];
  for (const transition of transitions) {
    test(`editing across Chicago ${transition.name} preserves local dates and UTC duration (#278)`, async ({ page, family }, info) => {
      const day = `${year}-${String(transition.month + 1).padStart(2, '0')}-${String(transition.day).padStart(2, '0')}`;
      // Avoid ambiguous/nonexistent wall-clock times themselves: 00:30 and 02:30/03:30 bracket the transition.
      const startTime = transition.name === 'spring forward' ? '01:30' : '00:30';
      const endTime = transition.name === 'spring forward' ? '03:30' : '02:30';
      const startsAt = new Date(`${day}T${startTime}:00${transition.before}`).toISOString();
      const endsAt = new Date(`${day}T${endTime}:00${transition.after}`).toISOString();
      const path = `/api/families/${family.familyId}/calendar/events`;
      const event = await family.dad.json<{ id: string }>(family.dad.post(path, {
        category: 'Activity', title: `DST ${transition.name}`, childIds: [family.kaiId], startsAt, endsAt,
      }));
      await signIn(page, family.dad.email);
      await page.goto(`/calendar/${event.id}/edit`);
      await expect(page.getByLabel('Start time', { exact: true })).toHaveValue(startTime);
      await expect(page.getByLabel('End time', { exact: true })).toHaveValue(endTime);
      const expectedDay = `${transition.month + 1}/${transition.day}/${year}`;
      await expect(page.locator('#edit-start-date')).toHaveValue(expectedDay);
      await expect(page.locator('#edit-end-date')).toHaveValue(expectedDay);
      await page.getByLabel('Title', { exact: true }).fill(`Verified DST ${transition.name}`);
      const response = page.waitForResponse(r => r.url().endsWith(`${path}/${event.id}`) && r.request().method() === 'PATCH');
      await activate(page.getByRole('button', { name: 'Save changes', exact: true }), info);
      expect((await response).status()).toBe(200);
      const saved = await family.dad.json<{ startsAt: string; endsAt: string }>(family.dad.get(`${path}/${event.id}`));
      expect(new Date(saved.startsAt).toISOString()).toBe(startsAt);
      expect(new Date(saved.endsAt).toISOString()).toBe(endsAt);
      expect(Date.parse(saved.endsAt) - Date.parse(saved.startsAt)).toBe(transition.elapsed * 3_600_000);
      await evidence(page, info, `dst-${transition.name.replace(' ', '-')}`);
    });
  }

  // The times the transitions above step around. The app's rule (time.ts fromFamilyLocal): a time that happens twice
  // is the first one; a time that doesn't exist moves forward by the gap. Typed on the touch Edit form, then reopened.
  const wallTimes = [
    { name: 'spring forward', month: 2, day: sunday(2, 2), before: '-06:00', kind: 'nonexistent',
      typed: ['02:30', '04:00'], shown: ['03:30', '04:00'], utc: ['T08:30', 'T09:00'] },
    { name: 'fall back', month: 10, day: sunday(10, 1), before: '-05:00', kind: 'ambiguous',
      typed: ['01:30', '02:30'], shown: ['01:30', '02:30'], utc: ['T06:30', 'T08:30'] },
  ] as const;
  for (const wall of wallTimes) {
    test(`typing a ${wall.kind} Chicago ${wall.name} time saves the documented instant (#278)`, async ({ page, family }, info) => {
      const day = `${year}-${String(wall.month + 1).padStart(2, '0')}-${String(wall.day).padStart(2, '0')}`;
      // Starts well before the change, so the fixture itself never uses a moved or repeated time.
      const path = `/api/families/${family.familyId}/calendar/events`;
      const event = await family.dad.json<{ id: string }>(family.dad.post(path, {
        category: 'Activity', title: `DST ${wall.kind}`, childIds: [family.kaiId],
        startsAt: new Date(`${day}T00:00:00${wall.before}`).toISOString(),
        endsAt: new Date(`${day}T00:30:00${wall.before}`).toISOString(),
      }));
      await signIn(page, family.dad.email);
      await page.goto(`/calendar/${event.id}/edit`);
      await expect(page.getByLabel('Start time', { exact: true })).toHaveValue('00:00');
      await page.getByLabel('End time', { exact: true }).fill(wall.typed[1]);
      await page.getByLabel('Start time', { exact: true }).fill(wall.typed[0]);
      const response = page.waitForResponse(r => r.url().endsWith(`${path}/${event.id}`) && r.request().method() === 'PATCH');
      await activate(page.getByRole('button', { name: 'Save changes', exact: true }), info);
      expect((await response).status()).toBe(200);

      const saved = await family.dad.json<{ startsAt: string; endsAt: string }>(family.dad.get(`${path}/${event.id}`));
      expect(new Date(saved.startsAt).toISOString()).toBe(`${day}${wall.utc[0]}:00.000Z`);
      expect(new Date(saved.endsAt).toISOString()).toBe(`${day}${wall.utc[1]}:00.000Z`);
      await page.goto(`/calendar/${event.id}/edit`);
      await expect(page.getByLabel('Start time', { exact: true })).toHaveValue(wall.shown[0]);
      await expect(page.getByLabel('End time', { exact: true })).toHaveValue(wall.shown[1]);
      await evidence(page, info, `dst-${wall.kind}-time`);
    });
  }
});
