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

  it('moves a time that doesn’t exist forward, and takes the first of a time that happens twice', () => {
    // US clocks go forward on March 8, 2026 at 2:00 AM: 2:30 AM doesn't exist, so it's 3:30 AM CDT.
    expect(fromFamilyLocal('2026-03-08T02:30', 'America/Chicago')).toBe('2026-03-08T08:30:00.000Z');
    expect(toFamilyLocal(fromFamilyLocal('2026-03-08T02:30', 'America/Chicago'), 'America/Chicago')).toBe('2026-03-08T03:30');
    // Just before and after the jump stay as entered.
    expect(fromFamilyLocal('2026-03-08T01:59', 'America/Chicago')).toBe('2026-03-08T07:59:00.000Z');
    expect(fromFamilyLocal('2026-03-08T03:00', 'America/Chicago')).toBe('2026-03-08T08:00:00.000Z');
    // Clocks go back on November 1, 2026: 1:30 AM happens twice; the first (CDT, UTC−5) is used.
    expect(fromFamilyLocal('2026-11-01T01:30', 'America/Chicago')).toBe('2026-11-01T06:30:00.000Z');
    // The same in a zone east of UTC (Europe goes forward at 2:00 AM on March 29, 2026).
    expect(fromFamilyLocal('2026-03-29T02:30', 'Europe/Berlin')).toBe('2026-03-29T01:30:00.000Z');
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
