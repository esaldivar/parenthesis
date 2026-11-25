import { expect } from '@playwright/test';
import { activate, signIn, test } from '../../support/mobile';

test('feedback opens from the Account menu and phone More page and restores focus #738 @m5 @mobile @regression', async ({ page, family }, info) => {
  await signIn(page, family.dad.email);
  const dialog = page.getByRole('dialog', { name: 'Send feedback' });
  const account = page.getByRole('button', { name: /account menu/i });

  await activate(account, info);
  await activate(page.getByRole('menuitem', { name: 'Feedback', exact: true }), info);
  await expect(dialog).toBeVisible();
  await activate(dialog.getByRole('button', { name: 'Cancel' }), info);
  await expect(dialog).toBeHidden();
  await expect(account).toBeFocused();

  if (info.project.use.hasTouch) {
    await activate(page.getByRole('link', { name: 'More', exact: true }), info);
    const moreFeedback = page.getByRole('button', { name: 'Submit feedback', exact: true });
    await activate(moreFeedback, info);
    await expect(dialog).toBeVisible();
    await activate(dialog.getByRole('button', { name: 'Cancel' }), info);
    await expect(dialog).toBeHidden();
    await expect(moreFeedback).toBeFocused();
  }
});
