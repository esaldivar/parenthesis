import { fromFamilyLocal, lastDate, minutesOfDay, toFamilyLocal } from './time';

describe('calendar time zones', () => {
  it('shows API instants as wall-clock time in the family’s zone', () => {
    expect(toFamilyLocal('2026-10-20T13:00:00Z', 'America/Chicago')).toBe('2026-10-20T08:00');
    expect(toFamilyLocal('2026-10-20T13:00:00Z', 'Europe/London')).toBe('2026-10-20T14:00');
  });

  it('turns the family’s wall-clock time into the right instant, on both sides of a daylight-saving change', () => {
    expect(fromFamilyLocal('2026-10-20T08:00', 'America/Chicago')).toBe('2026-10-20T13:00:00.000Z');
    // US clocks go back on November 1, 2026: 8 AM is now UTC−6.
    expect(fromFamilyLocal('2026-11-02T08:00', 'America/Chicago')).toBe('2026-11-02T14:00:00.000Z');
    expect(fromFamilyLocal('2026-10-20T00:00', 'UTC')).toBe('2026-10-20T00:00:00.000Z');
  });

  it('round-trips', () => {
    const local = '2026-12-24T18:30';
    expect(toFamilyLocal(fromFamilyLocal(local, 'Asia/Tokyo'), 'Asia/Tokyo')).toBe(local);
  });

  it('treats an end at midnight as ending the day before', () => {
    expect(lastDate('2026-10-20T00:00', '2026-10-21T00:00')).toBe('2026-10-20');
    expect(lastDate('2026-10-20T00:00', '2026-10-23T00:00')).toBe('2026-10-22');
    expect(lastDate('2026-10-20T08:00', '2026-10-20T15:00')).toBe('2026-10-20');
    expect(lastDate('2026-10-20T22:00', '2026-10-21T02:00')).toBe('2026-10-21');
    expect(minutesOfDay('2026-10-20T08:30')).toBe(510);
  });
});
