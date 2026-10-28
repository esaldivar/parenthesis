import { Browser, Page, expect, test } from '@playwright/test';
import { ApiSession } from '../../support/api';
import { FAMILY_NAME, PASSWORD, newEmail } from '../../support/data';
import { soloParent } from '../../support/family';
import { linkFromEmail } from '../../support/mailpit';
import { continuePrivatelyIfAsked } from '../../support/shared-device';

// Issue #211: an invited co-parent who registers and confirms in the same browser must join the inviter's existing
// family, never be sent to set up a new family and its children. Synthetic accounts only; each test has its own
// inviter (with their own family and child) and its own invitee.

interface Family {
  id: string;
  name: string;
}

async function signIn(page: Page, email: string) {
  await page.goto('/sign-in');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(PASSWORD);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await continuePrivatelyIfAsked(page);
}

async function signOut(page: Page) {
  await page.getByRole('button', { name: 'Account menu' }).click();
  await page.getByRole('menuitem', { name: 'Sign out' }).click();
  await expect(page).toHaveURL(/\/sign-in/);
}

async function register(page: Page, name: string, email: string) {
  await page.getByLabel('Your name').fill(name);
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password', { exact: true }).fill(PASSWORD);
  await page.getByLabel('Confirm password').fill(PASSWORD);
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(page).toHaveURL(/\/check-email/);
}

/** Opens the confirmation email's link in this same browser, then signs in from the confirmation page. */
async function confirmAndSignIn(page: Page, email: string) {
  const confirm = await linkFromEmail(email, 'Confirm your email', '/confirm-email');
  await page.goto(confirm.pathname + confirm.search);
  await expect(page.getByText('Your email is confirmed.')).toBeVisible();
  await page.getByRole('link', { name: 'Sign in' }).click();
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(PASSWORD);
  await page.getByRole('button', { name: 'Sign in' }).click();
}

/** Dad, with the Rivera Family and Kai (waiting for the co-parent), invites `email`. */
async function inviterWithFamily(inviteeEmail: string) {
  const { dad, familyId } = await soloParent('Dad');
  await dad.json(dad.post(`/api/families/${familyId}/children`, { firstName: 'Kai' }));
  expect((await dad.post(`/api/families/${familyId}/invitations`, { email: inviteeEmail })).status()).toBe(202);
  return { dad, familyId };
}

/** What the server says about the invitee's families, through a separate API session (not the browser's). */
async function familiesOf(email: string): Promise<Family[]> {
  const session = await ApiSession.start();
  try {
    await session.signIn(email);
    return await session.json<Family[]>(session.get('/api/me/families'));
  } finally {
    await session.dispose();
  }
}

async function newPage(browser: Browser) {
  const context = await browser.newContext({ ignoreHTTPSErrors: true });
  return { context, page: await context.newPage() };
}

test.describe('Issue #211: an invited co-parent joins the existing family', { tag: ['@regression', '@m2'] }, () => {
  test('the inviter is still signed in when the "Sign up to join" link opens in the same browser', async ({ browser }) => {
    const momEmail = newEmail('Mom');
    const { dad, familyId } = await inviterWithFamily(momEmail);
    const { context, page } = await newPage(browser);
    const visited: string[] = [];
    page.on('framenavigated', (frame) => {
      if (frame === page.mainFrame()) visited.push(new URL(frame.url()).pathname);
    });
    try {
      await test.step('Dad is signed in on this browser', async () => {
        await signIn(page, dad.email);
        await expect(page.getByRole('navigation').first()).toBeVisible();
      });

      await test.step('Mom opens her invitation here: it says it is for someone else, and keeps it', async () => {
        const invite = await linkFromEmail(momEmail, 'invited you', '/register');
        await page.goto(invite.pathname + invite.search);
        await expect(page).toHaveURL(/\/invitations\/accept$/);
        await expect(page.getByText('This invitation was sent to a different email address.')).toBeVisible();
        await page.getByRole('button', { name: 'Sign in with another account' }).click();
        await expect(page).toHaveURL(/\/sign-in/);
      });

      await test.step('Mom creates her account, confirms it in this browser and signs in', async () => {
        await page.getByRole('link', { name: 'Create an account' }).click();
        await expect(page.getByText('You’ve been invited to join your co-parent’s family.')).toBeVisible();
        await register(page, 'Mom', momEmail);
        await confirmAndSignIn(page, momEmail);
      });

      await test.step('she joins the Rivera Family, with no new-family or children setup', async () => {
        await expect(page.getByRole('heading', { name: `You've joined ${FAMILY_NAME}` })).toBeVisible();
        expect(visited).not.toContain('/welcome');
        await page.getByRole('link', { name: 'Continue' }).click();
        await page.reload();
        await expect(page).not.toHaveURL(/\/welcome/);
        // Kai waits for her approval in the family she joined.
        await page.goto('/approvals');
        await expect(page.getByText('Add Kai to the family')).toBeVisible();
      });

      expect(await familiesOf(momEmail)).toEqual([expect.objectContaining({ id: familyId, name: FAMILY_NAME })]);
    } finally {
      await context.close();
      await dad.dispose();
    }
  });

  test('a fresh browser: invitation, registration, confirmation round-trip, then joining', async ({ browser }) => {
    const momEmail = newEmail('Mom');
    const { dad, familyId } = await inviterWithFamily(momEmail);
    const { context, page } = await newPage(browser);
    try {
      const invite = await linkFromEmail(momEmail, 'invited you', '/register');
      await page.goto(invite.pathname + invite.search);
      // The one-time token leaves the address bar at once.
      await expect(page).toHaveURL(/\/register$/);
      await register(page, 'Mom', momEmail);
      await confirmAndSignIn(page, momEmail);

      await expect(page.getByRole('heading', { name: `You've joined ${FAMILY_NAME}` })).toBeVisible();
      expect(await familiesOf(momEmail)).toEqual([expect.objectContaining({ id: familyId })]);
    } finally {
      await context.close();
      await dad.dispose();
    }
  });

  for (const destination of ['/', '/welcome']) {
    test(`a signed-in invitee without a family goes to the invitation, even when heading to ${destination}`, async ({ browser }) => {
      const momEmail = newEmail('Mom');
      const { dad, familyId } = await inviterWithFamily(momEmail);
      const { context, page } = await newPage(browser);
      try {
        const invite = await linkFromEmail(momEmail, 'invited you', '/register');
        await page.goto(invite.pathname + invite.search);
        await register(page, 'Mom', momEmail);
        const confirm = await linkFromEmail(momEmail, 'Confirm your email', '/confirm-email');
        await page.goto(confirm.pathname + confirm.search);
        await expect(page.getByText('Your email is confirmed.')).toBeVisible();
        // She signs in from a bookmark instead of the confirmation page: a generic destination, or setup itself.
        await page.goto(`/sign-in?returnUrl=${encodeURIComponent(destination)}`);
        await page.getByLabel('Email').fill(momEmail);
        await page.getByLabel('Password').fill(PASSWORD);
        await page.getByRole('button', { name: 'Sign in' }).click();

        await expect(page.getByRole('heading', { name: `You've joined ${FAMILY_NAME}` })).toBeVisible();
        await expect(page).not.toHaveURL(/\/welcome/);
        expect(await familiesOf(momEmail)).toEqual([expect.objectContaining({ id: familyId })]);
      } finally {
        await context.close();
        await dad.dispose();
      }
    });

  }

  test('an existing account accepts once; opening the link again changes nothing', async ({ browser }) => {
    const mom = await ApiSession.parent('Mom');
    const { dad, familyId } = await inviterWithFamily(mom.email);
    const { context, page } = await newPage(browser);
    try {
      const invite = await linkFromEmail(mom.email, 'invited you', '/invitations/accept');
      await page.goto(invite.pathname + invite.search);
      await page.getByRole('link', { name: 'Sign in to accept' }).click();
      await page.getByLabel('Email').fill(mom.email);
      await page.getByLabel('Password').fill(PASSWORD);
      await page.getByRole('button', { name: 'Sign in' }).click();
      await expect(page.getByRole('heading', { name: `You've joined ${FAMILY_NAME}` })).toBeVisible();

      // A second click on the same email: the link is used, and she stays in one family.
      await page.goto(invite.pathname + invite.search);
      await expect(page.getByRole('heading', { name: "This link isn't valid any more" })).toBeVisible();
      expect(await familiesOf(mom.email)).toEqual([expect.objectContaining({ id: familyId })]);
    } finally {
      await context.close();
      await mom.dispose();
      await dad.dispose();
    }
  });

  test('the wrong account is told so and joins nothing', async ({ browser }) => {
    const momEmail = newEmail('Mom');
    const stranger = await ApiSession.parent('Pat');
    const { dad } = await inviterWithFamily(momEmail);
    const { context, page } = await newPage(browser);
    try {
      await signIn(page, stranger.email);
      await expect(page).toHaveURL(/\/welcome/);
      const invite = await linkFromEmail(momEmail, 'invited you', '/register');
      await page.goto(invite.pathname + invite.search);

      await expect(page.getByText('This invitation was sent to a different email address.')).toBeVisible();
      // Not now: back to their own setup, without joining or being sent round in circles.
      await page.getByRole('button', { name: 'Not now' }).click();
      await expect(page).toHaveURL(/\/welcome/);
      expect(await familiesOf(stranger.email)).toEqual([]);
    } finally {
      await context.close();
      await stranger.dispose();
      await dad.dispose();
    }
  });
});
