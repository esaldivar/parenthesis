import { addDays, dateTimeLabel, greetingFor, hourIn, startOfWeek, timeLabel, todayIn, weekDays, weekLabel } from './week';

describe('week dates', () => {
  it('runs weeks Sunday to Saturday', () => {
    expect(startOfWeek('2026-10-16')).toBe('2026-10-11'); // Friday → the Sunday before
    expect(startOfWeek('2026-10-11')).toBe('2026-10-11'); // Sunday starts its own week
    expect(startOfWeek('2026-10-17')).toBe('2026-10-11'); // Saturday ends it
    expect(startOfWeek('2026-10-18')).toBe('2026-10-18'); // The next Sunday starts a new week
  });

  it('lists seven days and steps across month and year boundaries', () => {
    expect(weekDays('2026-12-27')).toEqual([
      '2026-12-27', '2026-12-28', '2026-12-29', '2026-12-30', '2026-12-31', '2027-01-01', '2027-01-02',
    ]);
    expect(addDays('2026-10-12', -7)).toBe('2026-10-05');
  });

  it('is unaffected by daylight-saving changes', () => {
    // US clocks change on 2026-11-01; days still advance one at a time.
    expect(weekDays('2026-10-25').at(-1)).toBe('2026-10-31');
    expect(weekDays('2026-11-01')[0]).toBe('2026-11-01');
    expect(addDays('2026-11-01', 1)).toBe('2026-11-02');
  });

  it('labels weeks compactly', () => {
    expect(weekLabel('2026-10-11')).toBe('Oct 11 – 17, 2026');
    expect(weekLabel('2026-09-27')).toBe('Sep 27 – Oct 3, 2026');
    expect(weekLabel('2026-12-27')).toBe('Dec 27, 2026 – Jan 2, 2027');
  });

  it('finds today and the hour in the family’s time zone, not the viewer’s', () => {
    const instant = new Date('2026-10-17T02:30:00Z'); // Friday evening in Chicago, Saturday in London

    expect(todayIn('America/Chicago', instant)).toBe('2026-10-16');
    expect(todayIn('Europe/London', instant)).toBe('2026-10-17');
    expect(hourIn('America/Chicago', instant)).toBe(21);
    expect(todayIn('Not/A_Zone', instant)).toBe('2026-10-17'); // Falls back to UTC.
  });

  it('greets by time of day', () => {
    expect(greetingFor(8)).toBe('Good morning');
    expect(greetingFor(14)).toBe('Good afternoon');
    expect(greetingFor(21)).toBe('Good evening');
  });

  it('formats times without the viewer’s time zone shifting them', () => {
    expect(timeLabel('15:00')).toBe('3:00 PM');
    expect(dateTimeLabel('2026-10-16T15:00')).toBe('Fri, Oct 16, 3:00 PM');
  });
});
