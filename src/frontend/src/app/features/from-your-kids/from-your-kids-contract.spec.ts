import { describe, expect, it } from 'vitest';
import { daysUntilExpiry } from './from-your-kids-contract';

describe('From Your Kids expiration display (#531)', () => {
  const now = new Date('2026-11-08T12:00:00.000Z');

  it('does not show expiry for retained or bookmarked content', () => {
    expect(daysUntilExpiry(null, now)).toBeNull();
  });

  it('rounds up remaining days and never returns a negative number', () => {
    expect(daysUntilExpiry('2026-11-09T11:59:00.000Z', now)).toBe(1);
    expect(daysUntilExpiry('2026-11-09T12:01:00.000Z', now)).toBe(2);
    expect(daysUntilExpiry('2026-11-01T12:00:00.000Z', now)).toBe(0);
  });

  it('ignores invalid timestamps', () => {
    expect(daysUntilExpiry('invalid', now)).toBeNull();
  });
});
