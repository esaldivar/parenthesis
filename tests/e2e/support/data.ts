import { randomUUID } from 'node:crypto';

// Synthetic data only (CLAUDE.md). Names are fixed so screenshots and reports read the same every run; emails get a
// unique suffix because accounts are unique and tests run in parallel against one database.

export const PASSWORD = 'correct horse battery staple';

export const FAMILY_NAME = 'Rivera Family';

export const TIME_ZONE = 'America/Chicago';

/** A unique address on the reserved .test domain, so nothing can ever be delivered for real. */
export function newEmail(label: string): string {
  const slug = label.toLowerCase().replace(/[^a-z0-9]+/g, '-');
  return `${slug}-${randomUUID().slice(0, 8)}@example.test`;
}

/** Next Monday at midnight UTC: far enough ahead that nothing in a test is in the past. */
export function nextMonday(): Date {
  const date = new Date();
  date.setUTCHours(0, 0, 0, 0);
  date.setUTCDate(date.getUTCDate() + (((8 - date.getUTCDay()) % 7) || 7));
  return date;
}

export function addHours(date: Date, hours: number): Date {
  return new Date(date.getTime() + hours * 3_600_000);
}
