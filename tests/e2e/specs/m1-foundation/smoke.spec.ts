import { expect, test } from '@playwright/test';

test.describe('Application smoke', { tag: '@m1' }, () => {
  test('the API reports live and ready (database reachable)', async ({ request }) => {
    expect((await request.get('/health/live')).status()).toBe(200);
    expect((await request.get('/health/ready')).status()).toBe(200);
  });

  test('a signed-out visitor lands on the sign-in page', async ({ page }) => {
    await page.goto('/');

    await expect(page).toHaveURL(/\/sign-in/);
    await expect(page.getByRole('heading', { level: 1, name: 'Sign in' })).toBeVisible();
    await expect(page).toHaveTitle(/Sign in/);
  });

  test('API routes need a signed-in user', async ({ request }) => {
    expect((await request.get('/api/me')).status()).toBe(401);
    expect((await request.get('/api/me/families')).status()).toBe(401);
  });

  test('unsafe requests without an antiforgery token are rejected', async ({ request }) => {
    const response = await request.post('/api/auth/login', {
      data: { email: 'nobody@example.test', password: 'correct horse battery staple' },
    });

    expect(response.status()).toBe(400);
  });
});
