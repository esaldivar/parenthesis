import { expect } from '@playwright/test';
import { activate, evidence, fitsPage, signIn, test } from '../../support/mobile';
import { scan } from '../../support/accessibility';

// #717: the approved Family Memories album timeline (Figma 2008:*). A new family has no photos, so the empty state is
// the real one. Photos can only be added to events that have started, so a memory in its final week can't be made
// on a fresh release candidate: the timeline is checked with the memories list answered by synthetic data instead.
const DAY = 86_400_000;

function memory(eventId: string, title: string, startsDaysAgo: number, deletedInDays: number, cover: string) {
  const startsAt = new Date(Date.now() - startsDaysAgo * DAY);
  return {
    eventId, title, startsAt: startsAt.toISOString(), endsAt: new Date(startsAt.getTime() + 2 * 3_600_000).toISOString(),
    allDay: false, cancelled: false, photoCount: 3, yourPhotoCount: 3, sharedWithYouCount: 0,
    expiresAt: new Date(Date.now() + deletedInDays * DAY + 3_600_000).toISOString(),
    coverThumbnailUrl: `/art/from-your-kids/photos/${cover}.webp`,
  };
}

for (const theme of ['light', 'dark'] as const) {
  test(`Family Memories shows the album empty state, then the timeline (${theme}) #717 @m5 @mobile @regression`, async ({ page, family }, info) => {
    await page.emulateMedia({ colorScheme: theme });
    await signIn(page, family.dad.email);
    await page.goto('/memories');
    await expect(page.getByRole('heading', { level: 1, name: 'Family Memories' })).toBeVisible();

    // The real empty state: blank album sheets, honest copy and the way to add photos.
    await expect(page.getByRole('heading', { level: 2, name: 'No memories yet' })).toBeVisible();
    await expect(page.locator('.empty__sheets')).toBeVisible();
    await expect(page.getByRole('link', { name: 'Open calendar' })).toHaveAttribute('href', '/calendar');
    await fitsPage(page);
    await evidence(page, info, `memories-empty-${theme}`);
    await scan(page, info, `memories-empty-${theme}`);

    // The timeline with synthetic memories: two months (yesterday's and one 45 days back), newest first, and one
    // memory in its final week (its day count depends on the family's midnight, so either 2 or 3).
    await page.route(/\/api\/families\/[^/]+\/memories$/, route => route.fulfill({ json: [
      memory('beach', 'Beach day', 1, 27, 'sample-beach'),
      memory('kite', 'Kite festival', 1, 26, 'sample-kite'),
      memory('chalk', 'Chalk art afternoon', 45, 2, 'sample-chalk'),
    ] }));
    await page.reload();
    const months = page.locator('.month');
    await expect(months).toHaveCount(2);
    await expect(months.nth(0).getByRole('heading', { level: 2 })).toHaveText(/^\p{Lu}\p{Ll}+ \d{4}$/u);
    const soon = page.getByRole('link', { name: /Chalk art afternoon.*Deleted in [23] days.*(Open to save|Save) photos/ });
    await expect(soon).toBeVisible();
    await expect(soon.locator('app-time-left')).toBeVisible();
    await expect(page.getByRole('link', { name: /^Beach day\b/ }).locator('app-time-left')).toHaveCount(0);
    await expect(page.locator('.entry__dot[data-soonest="true"]')).toHaveCount(1);
    await expect(page.locator('app-memory-cover img').first()).toHaveJSProperty('complete', true);

    await fitsPage(page);
    await evidence(page, info, `memories-timeline-${theme}`);
    await scan(page, info, `memories-timeline-${theme}`);
    await activate(page.getByRole('link', { name: /^Beach day\b/ }), info);
    await expect(page).toHaveURL(/\/memories\/beach$/);
  });
}
