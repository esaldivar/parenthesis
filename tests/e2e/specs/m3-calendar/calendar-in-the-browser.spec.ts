import { Page, expect, test } from '@playwright/test';
import { ApiSession } from '../../support/api';
import { PASSWORD, addHours, nextMonday } from '../../support/data';
import { familyWithKai } from '../../support/family';

// The v0.3.0 calendar screens, in the browser (issue #48). Every family is synthetic and made fresh per test. Dates
// are next week, so nothing is in the past and declined requests still show.

interface CalendarEvent {
  id: string;
  title: string;
  status: string;
  changeRequestId?: string | null;
}

const monday = nextMonday();
/** Next Tuesday as a date: 10:00 AM there in the family's time zone (Chicago) is 15:00 UTC. */
const tuesday = addHours(monday, 24).toISOString().slice(0, 10);
const at = (hourUtc: number) => addHours(monday, 24 + hourUtc).toISOString();
const events = (familyId: string) => `/api/families/${familyId}/calendar/events`;

/** Signs a parent in through the sign-in page of this browser (its own cookies, separate from the API sessions). */
async function signIn(page: Page, email: string) {
  await page.goto('/sign-in');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(PASSWORD);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByRole('navigation').first()).toBeVisible();
}

/** The calendar's List view for next Tuesday's week. */
async function openList(page: Page) {
  await page.goto(`/calendar?date=${tuesday}&view=list`);
  await expect(page.getByRole('heading', { level: 1, name: 'Calendar' })).toBeVisible();
}

const item = (page: Page, title: string) => page.locator('app-calendar-list button.item', { hasText: title });
const details = (page: Page) => page.getByRole('dialog');

async function proposeParentingTime(dad: ApiSession, familyId: string, kaiId: string, dadMembershipId: string) {
  return dad.json<CalendarEvent>(
    dad.post(events(familyId), {
      category: 'ParentingTime',
      title: 'Long weekend with Dad',
      startsAt: at(5),
      endsAt: at(5 + 48),
      allDay: true,
      childIds: [kaiId],
      caregiverMembershipId: dadMembershipId,
    }),
  );
}

async function membershipOf(session: ApiSession, familyId: string, name: string): Promise<string> {
  const family = await session.json<{ members: { membershipId: string; displayName: string }[] }>(
    session.get(`/api/families/${familyId}`),
  );
  return family.members.find((m) => m.displayName === name)!.membershipId;
}

test.describe('The calendar in the browser', { tag: '@m3' }, () => {
  test('a parent adds an activity, sees it on the calendar and edits it', async ({ page }) => {
    const family = await familyWithKai();
    try {
      await signIn(page, family.dad.email);

      await test.step('add it from the Add page', async () => {
        await page.goto(`/calendar/new?date=${tuesday}`);
        await page.getByRole('button', { name: /Activity/ }).click();
        await page.getByLabel('Title').fill('Soccer practice');
        await page.getByLabel('Kai').check();
        await page.getByRole('button', { name: 'Add to calendar' }).click();
        await expect(page.getByText('“Soccer practice” is on the calendar.')).toBeVisible();
      });

      await test.step('open it and change its title', async () => {
        await openList(page);
        await item(page, 'Soccer practice').click();
        await expect(details(page).getByText('Confirmed', { exact: true })).toBeVisible();
        await details(page).getByRole('link', { name: 'Edit event' }).click();
        await expect(page.getByRole('heading', { level: 1, name: 'Edit event' })).toBeVisible();
        await page.getByLabel('Title').fill('Soccer game');
        await page.getByRole('button', { name: 'Save changes' }).click();
        // Saving goes back to the calendar.
        await expect(page.getByRole('heading', { level: 1, name: 'Calendar' })).toBeVisible();
        await openList(page);
        await expect(item(page, 'Soccer game')).toBeVisible();
      });
    } finally {
      await family.dispose();
    }
  });

  test('parenting time waits as pending until the co-parent approves it in the inbox', async ({ page, browser }) => {
    const family = await familyWithKai();
    const momContext = await browser.newContext({ ignoreHTTPSErrors: true });
    try {
      await signIn(page, family.dad.email);

      await test.step('Dad proposes it', async () => {
        await page.goto(`/calendar/new?date=${tuesday}`);
        await page.getByRole('button', { name: /Parenting time/ }).click();
        // Always his own parenting time (#246): no choice of parent.
        await expect(page.getByText('This is your parenting time.')).toBeVisible();
        await expect(page.getByLabel('Who has the children?')).toHaveCount(0);
        await page.getByLabel('Kai').check();
        await page.getByRole('button', { name: 'Send for approval' }).click();
        await expect(page.getByText(/Sent to Mom for approval/)).toBeVisible();
        await openList(page);
        // A pending proposal must never look confirmed.
        await expect(page.locator('app-calendar-list button.item[data-status="pending"]')).toContainText('Pending approval');
      });

      await test.step('Mom approves it in her Approvals inbox', async () => {
        const mom = await momContext.newPage();
        await signIn(mom, family.mom.email);
        await mom.goto('/approvals');
        await mom.getByRole('button', { name: 'Approve' }).first().click();
        await expect(mom.getByRole('heading', { name: 'Decided' })).toBeVisible();
      });

      await test.step('Dad sees it confirmed', async () => {
        await openList(page);
        await expect(page.locator('app-calendar-list button.item[data-status="confirmed"]')).toHaveCount(1);
        await expect(page.locator('app-calendar-list button.item[data-status="pending"]')).toHaveCount(0);
      });
    } finally {
      await momContext.close();
      await family.dispose();
    }
  });

  test('repeating parenting time is one request: every date waits, then one approval confirms them all (#239)', async ({ page, browser }) => {
    const family = await familyWithKai();
    const momContext = await browser.newContext({ ignoreHTTPSErrors: true });
    try {
      await signIn(page, family.dad.email);

      await test.step('Dad proposes every day for 3 days', async () => {
        await page.goto(`/calendar/new?date=${tuesday}`);
        await page.getByRole('button', { name: /Parenting time/ }).click();
        await page.getByLabel('Kai').check();
        await page.getByLabel('How often').click();
        await page.getByRole('option', { name: 'Every day' }).click();
        await page.getByLabel('Ends').click();
        await page.getByRole('option', { name: /times/i }).click();
        await page.getByLabel('Times in all').fill('3');
        await expect(page.locator('.repeat')).toContainText('Mom approves or declines every date at once.');
        await page.getByRole('button', { name: 'Send for approval' }).click();
        await expect(page.getByText(/Sent to Mom for approval: .* on 3 dates/)).toBeVisible();
        await openList(page);
        // Pending dates never look confirmed.
        await expect(page.locator('app-calendar-list button.item[data-status="pending"]')).toHaveCount(3);
        await expect(page.locator('app-calendar-list button.item[data-status="confirmed"]')).toHaveCount(0);
      });

      await test.step('Mom sees one request and approves it', async () => {
        const mom = await momContext.newPage();
        await signIn(mom, family.mom.email);
        await mom.goto('/approvals');
        await expect(mom.getByText(/3 dates from/)).toHaveCount(1);
        await expect(mom.getByText('Approving or declining answers them all.', { exact: false })).toBeVisible();
        await mom.getByRole('button', { name: 'Approve' }).first().click();
        await expect(mom.getByRole('heading', { name: 'Decided' })).toBeVisible();
      });

      await test.step('Dad sees every date confirmed', async () => {
        await openList(page);
        await expect(page.locator('app-calendar-list button.item[data-status="confirmed"]')).toHaveCount(3);
        await expect(page.locator('app-calendar-list button.item[data-status="pending"]')).toHaveCount(0);
      });
    } finally {
      await momContext.close();
      await family.dispose();
    }
  });

  test('the co-parent approves parenting time from its details on the calendar (#218)', async ({ page, browser }) => {
    const family = await familyWithKai();
    const { dad, familyId, kaiId } = family;
    const momContext = await browser.newContext({ ignoreHTTPSErrors: true });
    try {
      await proposeParentingTime(dad, familyId, kaiId, await membershipOf(dad, familyId, 'Dad'));

      await test.step('Mom opens it on her calendar and approves it there', async () => {
        const mom = await momContext.newPage();
        await signIn(mom, family.mom.email);
        await openList(mom);
        // It spans two days, so it's listed on each: open the first.
        await item(mom, 'Long weekend with Dad').first().click();
        await expect(details(mom)).toContainText('Waiting for your approval.');
        await details(mom).getByRole('button', { name: 'Approve' }).click();
        await expect(mom.getByText('You approved “Long weekend with Dad”. It’s on the calendar.')).toBeVisible();
        await expect(mom.locator('app-calendar-list button.item[data-status="pending"]')).toHaveCount(0);
        await expect(item(mom, 'Long weekend with Dad').first()).toHaveAttribute('data-status', 'confirmed');
      });

      await test.step('Dad sees it confirmed', async () => {
        await signIn(page, dad.email);
        await openList(page);
        await expect(item(page, 'Long weekend with Dad').first()).toHaveAttribute('data-status', 'confirmed');
        await expect(page.locator('app-calendar-list button.item[data-status="pending"]')).toHaveCount(0);
      });
    } finally {
      await momContext.close();
      await family.dispose();
    }
  });

  test('a declined request shows as declined, with the decision, until the parent removes it', async ({ page }) => {
    const family = await familyWithKai();
    const { dad, mom, familyId, kaiId } = family;
    try {
      const proposed = await proposeParentingTime(dad, familyId, kaiId, await membershipOf(dad, familyId, 'Dad'));
      await mom.json(
        mom.post(`/api/families/${familyId}/approvals/${proposed.changeRequestId}/reject`, { comment: 'That’s the school trip.' }),
      );

      await signIn(page, dad.email);
      await openList(page);
      const declined = page.locator('app-calendar-list button.item[data-status="declined"]').first();
      await expect(declined).toContainText('Declined');

      await declined.click();
      await expect(details(page)).toContainText('Mom declined this request on');
      await expect(details(page)).toContainText('That’s the school trip.');
      await expect(details(page).getByRole('link', { name: 'Edit event' })).toHaveCount(0);

      await details(page).getByRole('button', { name: 'Remove from my calendar' }).click();
      await expect(page.getByText('“Long weekend with Dad” was removed from your calendar.')).toBeVisible();
      await expect(page.locator('app-calendar-list button.item[data-status="declined"]')).toHaveCount(0);

      // Only Dad's calendar changed.
      const momsWeek = await mom.json<CalendarEvent[]>(mom.get(events(familyId), { from: monday.toISOString(), to: addHours(monday, 24 * 7).toISOString() }));
      expect(momsWeek.map((e) => e.status)).toEqual(['Rejected']);
    } finally {
      await family.dispose();
    }
  });

  test('unavailable time repeats on chosen days, with a preview of the dates', async ({ page }) => {
    const family = await familyWithKai();
    try {
      await signIn(page, family.dad.email);
      await page.goto(`/calendar/new?date=${tuesday}`);
      await page.getByRole('button', { name: /I’m unavailable/ }).click();
      // Custom (#238): every 1 week, on Tuesday (the start) and Thursday.
      await page.getByLabel('How often').click();
      await page.getByRole('option', { name: 'Custom…' }).click();
      await page.getByRole('checkbox', { name: 'Thursday' }).check();
      await page.getByLabel('Ends').click();
      await page.getByRole('option', { name: /times/i }).click();
      await page.getByLabel('Times in all').fill('4');

      await expect(page.locator('.preview')).toContainText('4 dates');
      await page.getByRole('button', { name: 'Add to calendar' }).click();
      await expect(page.getByText(/is on the calendar on 4 dates/)).toBeVisible();

      await openList(page);
      // Tuesday and Thursday of that week.
      await expect(page.locator('app-calendar-list button.item[data-kind="unavailable"]')).toHaveCount(2);
    } finally {
      await family.dispose();
    }
  });

  test('an activity repeats every 2 days from the Repeat menu’s Custom lists (#238)', async ({ page }) => {
    const family = await familyWithKai();
    try {
      await signIn(page, family.dad.email);
      for (const size of [
        { name: 'desktop', width: 1280, height: 800 },
        { name: 'phone', width: 390, height: 844 },
      ] as const) {
        await test.step(size.name, async () => {
          await page.setViewportSize({ width: size.width, height: size.height });
          await page.goto(`/calendar/new?date=${tuesday}`);
          await page.getByRole('button', { name: /Activity/ }).click();
          await page.getByLabel('Title').fill(`Reading club (${size.name})`);
          await page.getByLabel('How often').click();
          await expect(page.getByRole('option')).toHaveText(['Does not repeat', 'Every day', /^Every week on /, /^Every month on the /, 'Custom…']);
          await page.getByRole('option', { name: 'Custom…' }).click();
          await page.getByLabel('Every', { exact: true }).selectOption('2');
          await page.getByLabel('Unit').selectOption('Daily');
          await page.getByLabel('Ends').click();
          await page.getByRole('option', { name: /times/i }).click();
          await page.getByLabel('Times in all').fill('3');
          await expect(page.locator('.preview')).toContainText('3 dates');
          await page.getByRole('button', { name: 'Add to calendar' }).click();
          await expect(page.getByText(/is on the calendar on 3 dates/)).toBeVisible();
        });
      }
    } finally {
      await family.dispose();
    }
  });

  test('a parent’s filters apply at once, are remembered after a reload, and reset', async ({ page }) => {
    const family = await familyWithKai();
    const { dad, familyId, kaiId } = family;
    try {
      await dad.json(dad.post(events(familyId), { category: 'Activity', title: 'Piano lesson', childIds: [kaiId], startsAt: at(15), endsAt: at(16) }));
      await dad.json(dad.post(events(familyId), { category: 'Unavailable', startsAt: at(14), endsAt: at(17) }));

      await signIn(page, dad.email);
      await openList(page);
      await expect(item(page, 'Piano lesson')).toBeVisible();

      await page.getByRole('button', { name: /^Filters/ }).click();
      await page.getByRole('dialog').getByLabel('Activity', { exact: true }).uncheck();
      await page.getByRole('dialog').getByRole('button', { name: 'Done' }).click();
      await expect(item(page, 'Piano lesson')).toHaveCount(0);

      await page.reload();
      await expect(page.getByRole('button', { name: 'Filters, 1 active' })).toBeVisible();
      await expect(item(page, 'Piano lesson')).toHaveCount(0);

      await page.getByRole('button', { name: /^Filters/ }).click();
      await page.getByRole('dialog').getByRole('button', { name: 'Reset filters' }).click();
      await page.getByRole('dialog').getByRole('button', { name: 'Done' }).click();
      await expect(item(page, 'Piano lesson')).toBeVisible();
    } finally {
      await family.dispose();
    }
  });

  test('the home page shows the real week, with reminders and tasks in Upcoming', async ({ page }) => {
    const family = await familyWithKai();
    const { dad, familyId, kaiId } = family;
    try {
      await dad.json(dad.post(events(familyId), { category: 'Activity', title: 'Swim lesson', childIds: [kaiId], startsAt: at(20), endsAt: at(21) }));
      await dad.json(dad.post(`/api/families/${familyId}/calendar/reminders`, { title: 'Spirit Day', startsAt: at(13), allDay: false, childId: kaiId }));
      await dad.json(dad.post(`/api/families/${familyId}/calendar/tasks`, { title: 'Sign the field trip form', dueDate: tuesday, childId: kaiId }));

      await signIn(page, dad.email);
      await page.goto(`/?week=${tuesday}`);
      const upcoming = page.locator('section.area-upcoming');
      await expect(upcoming).toContainText('Swim lesson');
      await expect(upcoming).toContainText('Spirit Day');
      await expect(upcoming).toContainText('Sign the field trip form');
      await expect(page.getByText('Sample data')).toHaveCount(0);

      // Quick Add: Note opens the Add page as a reminder.
      await page.locator('section.area-quick').getByRole('link', { name: /Note/ }).click();
      await expect(page).toHaveURL(/\/calendar\/new\?.*kind=reminder/);
      await expect(page.getByRole('button', { name: /Reminder/, pressed: true })).toBeVisible();
    } finally {
      await family.dispose();
    }
  });

  test('an event’s block on the home page opens its details, and Escape returns to it (#213)', async ({ page }) => {
    const family = await familyWithKai();
    const { dad, familyId, kaiId } = family;
    try {
      await dad.json(dad.post(events(familyId), { category: 'Activity', title: 'Swim lesson', childIds: [kaiId], startsAt: at(20), endsAt: at(21) }));

      await signIn(page, dad.email);
      await page.goto(`/?week=${tuesday}`);
      const block = page.getByRole('button', { name: 'Open details: Swim lesson' }).first();
      await block.click();

      await expect(details(page).getByRole('heading', { name: 'Swim lesson' })).toBeVisible();
      await expect(details(page)).toContainText('Confirmed');
      await page.keyboard.press('Escape');
      await expect(details(page)).toHaveCount(0);
      await expect(block).toBeFocused();
      // Still on the home page: nothing was changed or saved by opening it.
      await expect(page).toHaveURL(/\/\?week=/);
    } finally {
      await family.dispose();
    }
  });

  test('tapping empty time on the Calendar and home weeks opens Add at that day and half-hour (#212)', async ({ page }) => {
    const family = await familyWithKai();
    const { dad, familyId, kaiId } = family;
    try {
      await dad.json(dad.post(events(familyId), { category: 'Activity', title: 'Piano lesson', childIds: [kaiId], startsAt: at(15), endsAt: at(16) }));
      await signIn(page, dad.email);

      /** Taps 5:00 PM in Tuesday's column of a week grid (the column covers the whole day). */
      async function tapFivePm(column: ReturnType<Page['locator']>) {
        await column.evaluate((el, fraction) => {
          const scroller = el.closest('.grid__body') as HTMLElement;
          scroller.scrollTop = el.getBoundingClientRect().height * fraction - 100;
        }, 17 / 24);
        const box = (await column.boundingBox())!;
        await page.mouse.click(box.x + box.width / 2, box.y + (box.height * 17) / 24 + 4);
      }

      for (const [where, url] of [
        ['Calendar', `/calendar?date=${tuesday}`],
        ['home', `/?week=${tuesday}`],
      ] as const) {
        await test.step(where, async () => {
          await page.goto(url);
          await tapFivePm(page.getByRole('button', { name: /^Add on Tuesday/ }));
          // The first tap highlights the hour (#237); tapping the highlight opens Add there.
          const highlight = page.getByRole('button', { name: /^Add on Tuesday, .* at 5:00 PM$/ });
          await expect(highlight).toBeVisible();
          await highlight.click();
          await expect(page).toHaveURL(new RegExp(`/calendar/new\\?date=${tuesday}&time=17:00$`));
          await page.getByRole('button', { name: /Activity/ }).click();
          await expect(page.locator('input[formcontrolname="startTime"]')).toHaveValue('17:00');
          await expect(page.locator('input[formcontrolname="endTime"]')).toHaveValue('18:00');
        });
      }

      // Nothing was added by tapping: only the piano lesson is there.
      const week = await dad.json<CalendarEvent[]>(dad.get(events(familyId), { from: monday.toISOString(), to: addHours(monday, 24 * 7).toISOString() }));
      expect(week.map((e) => e.title)).toEqual(['Piano lesson']);
    } finally {
      await family.dispose();
    }
  });

  test('saving shows a toast that leaves by itself: bottom right on desktop, above the navigation on a phone (#226)', async ({ page }) => {
    const family = await familyWithKai();
    try {
      await signIn(page, family.dad.email);
      for (const size of [
        { name: 'desktop', width: 1280, height: 800 },
        { name: 'phone', width: 390, height: 844 },
      ] as const) {
        await test.step(size.name, async () => {
          await page.setViewportSize({ width: size.width, height: size.height });
          await page.goto(`/calendar/new?date=${tuesday}`);
          await page.getByRole('button', { name: /Activity/ }).click();
          await page.getByLabel('Title').fill(`Swim lesson (${size.name})`);
          await page.getByRole('button', { name: 'Add to calendar' }).click();

          const toast = page.locator('app-toast-host .toast', { hasText: `“Swim lesson (${size.name})” is on the calendar.` });
          await expect(toast).toBeVisible();
          // Announced politely, from the one live region, without taking focus.
          await expect(page.locator('app-toast-host [role="status"][aria-live="polite"] .toast')).toHaveCount(1);
          const box = (await toast.boundingBox())!;
          if (size.name === 'desktop') {
            expect(box.x + box.width).toBeGreaterThan(size.width - 60);
            expect(box.y + box.height).toBeGreaterThan(size.height - 60);
          } else {
            const nav = (await page.locator('nav.bottomnav').boundingBox())!;
            expect(box.y + box.height).toBeLessThanOrEqual(nav.y);
            expect(box.x).toBeGreaterThanOrEqual(0);
            expect(box.x + box.width).toBeLessThanOrEqual(size.width);
          }
          // It leaves by itself (6 seconds for a short message).
          await expect(toast).toHaveCount(0, { timeout: 9000 });
        });
      }
    } finally {
      await family.dispose();
    }
  });

  test('dates are picked as a range from today on, on desktop and phone (#232)', async ({ page }) => {
    const family = await familyWithKai();
    // The calendar's labels and the field's text for a date.
    const label = (date: string) =>
      new Date(`${date}T12:00:00Z`).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
    const shown = (date: string) => new Date(`${date}T12:00:00Z`).toLocaleDateString('en-US', { timeZone: 'UTC' });
    const thursday = addHours(monday, 24 * 3).toISOString().slice(0, 10);
    try {
      await signIn(page, family.dad.email);
      for (const size of [
        { name: 'desktop', width: 1280, height: 800 },
        { name: 'phone', width: 390, height: 844 },
      ] as const) {
        await test.step(size.name, async () => {
          await page.setViewportSize({ width: size.width, height: size.height });
          await page.goto(`/calendar/new?date=${tuesday}`);
          await page.getByRole('button', { name: /Parenting time/ }).click();

          // One calendar for the range: Tuesday, then Thursday.
          await page.getByRole('button', { name: 'Choose dates' }).click();
          await page.locator(`.mat-calendar-body-cell[aria-label="${label(tuesday)}"]`).click();
          await page.locator(`.mat-calendar-body-cell[aria-label="${label(thursday)}"]`).click();
          await expect(page.getByLabel('Start date')).toHaveValue(shown(tuesday));
          await expect(page.getByLabel('End date')).toHaveValue(shown(thursday));

          // Moving the start past the end moves the end, keeping the length.
          const saturday = addHours(monday, 24 * 5).toISOString().slice(0, 10);
          await page.getByLabel('Start date').fill(shown(saturday));
          await page.getByLabel('Start date').blur();
          await expect(page.getByLabel('End date')).toHaveValue(shown(addHours(monday, 24 * 7).toISOString().slice(0, 10)));

          // A typed date before today is refused, saying why.
          await page.getByLabel('Start date').fill('1/5/2026');
          await page.getByLabel('End date').fill('1/6/2026');
          await page.getByLabel('Kai').check();
          await page.getByRole('button', { name: 'Send for approval' }).click();
          await expect(page.getByText('Choose a start date from today on.')).toBeVisible();
        });
      }
    } finally {
      await family.dispose();
    }
  });
});
