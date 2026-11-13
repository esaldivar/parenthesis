import { expect, type BrowserContext } from '@playwright/test';
import { familyWithKai, type Family } from '../support/family';

const LOOPBACK = ['localhost', '127.0.0.1', '[::1]'];

/**
 * A synthetic family signed in to this browser, for any real-reader journey. The guard runs BEFORE accounts are
 * created: these fixtures must never target shared or production data.
 */
export async function withLocalFamily(context: BrowserContext, baseURL: string | undefined, use: (family: Family) => Promise<void>) {
  const app = new URL(baseURL!);
  expect(LOOPBACK).toContain(app.hostname);
  expect(app.protocol).toBe('https:');
  const mail = new URL(process.env['MAILPIT_URL'] ?? 'http://localhost:8025');
  expect(LOOPBACK).toContain(mail.hostname);
  const family = await familyWithKai();
  try {
    await context.addCookies((await family.dad.http.storageState()).cookies);
    await use(family);
  } finally {
    // The fixture disposes HTTP sessions; rows remain in the isolated disposable database.
    await family.dispose();
  }
}
