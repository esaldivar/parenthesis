import { TestBed } from '@angular/core/testing';
import { DateAdapter } from '@angular/material/core';
import { fakeAuth } from '../../../testing/fake-auth';
import {
  PAST_START,
  UNREADABLE_DATE,
  choosable,
  endAfterMove,
  endTimeAfterMove,
  rangeFilter,
  rangeProblems,
} from './date-rules';
import { PlainDateAdapter, providePlainDates } from './plain-dates';

describe('date rules (#232)', () => {
  const today = '2026-10-23';

  it('offers days from today on, and an item’s own past dates', () => {
    expect(choosable('2026-10-22', today)).toBe(false);
    expect(choosable('2026-10-23', today)).toBe(true);
    expect(choosable('2026-10-20', today, ['2026-10-20'])).toBe(true);
    expect(choosable(null, today)).toBe(false);
  });

  it('while the end is chosen, offers up to the longest an event lasts after the start', () => {
    const choosingEnd = rangeFilter(today, [], '2026-10-25', null, 31);
    expect(choosingEnd('2026-11-25')).toBe(true); // 31 days.
    expect(choosingEnd('2026-11-26')).toBe(false);
    expect(choosingEnd('2026-10-24')).toBe(true); // Before the start: starts the range again.
    expect(choosingEnd('2026-10-20')).toBe(false); // Past.
    // With both chosen, any day from today can start a new range.
    expect(rangeFilter(today, [], '2026-10-25', '2026-10-26', 31)('2026-12-31')).toBe(true);
  });

  it('moves the end with the start, keeping the length, only when it would be before the start', () => {
    expect(endAfterMove('2026-10-24', '2026-10-26', '2026-10-30')).toBe('2026-11-01');
    expect(endAfterMove('2026-10-24', '2026-10-26', '2026-10-25')).toBe('2026-10-26');
    expect(endAfterMove('2026-10-24', '2026-10-24', '2026-10-28')).toBe('2026-10-28');
  });

  it('moves a one-day event’s end time with its start time, into the next day if needed', () => {
    expect(endTimeAfterMove('2026-10-24', '09:00', '10:30', '11:00')).toEqual({
      endDate: '2026-10-24',
      endTime: '12:30',
    });
    expect(endTimeAfterMove('2026-10-24', '09:00', '10:00', '09:30')).toBeNull(); // Still after the start.
    expect(endTimeAfterMove('2026-10-24', '09:00', '10:00', '23:30')).toEqual({
      endDate: '2026-10-25',
      endTime: '00:30',
    });
  });

  it('names what’s wrong with a range, by the API’s field names', () => {
    const range = {
      allDay: false,
      startDate: '2026-10-24',
      startTime: '09:00',
      endDate: '2026-10-24',
      endTime: '10:00',
    };
    expect(rangeProblems(range, today)).toEqual({});
    expect(rangeProblems({ ...range, startDate: '2026-10-20' }, today)).toEqual({
      startsAt: PAST_START,
    });
    expect(
      rangeProblems({ ...range, startDate: '2026-10-20', endDate: '2026-10-20' }, today, [
        '2026-10-20',
      ]),
    ).toEqual({});
    expect(rangeProblems({ ...range, startDate: 'invalid-date' }, today)).toEqual({
      startsAt: UNREADABLE_DATE,
    });
    expect(rangeProblems({ ...range, endTime: '08:00' }, today)).toEqual({
      endsAt: 'Choose an end that’s after the start.',
    });
    expect(rangeProblems({ ...range, endDate: null }, today)).toEqual({
      endsAt: 'Choose when it starts and ends.',
    });
    // Earlier today is fine (owner decision): only past days are refused.
    expect(
      rangeProblems(
        { ...range, startDate: today, endDate: today, startTime: '00:30', endTime: '01:00' },
        today,
      ),
    ).toEqual({});
  });
});

describe('the date picker’s dates (#232)', () => {
  let adapter: PlainDateAdapter;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [fakeAuth(), providePlainDates()] });
    adapter = TestBed.inject(DateAdapter) as PlainDateAdapter;
  });
  afterEach(() => vi.useRealTimers());

  it('reads typed dates as 10/27/2026 or 2026-10-27, and refuses others', () => {
    expect(adapter.parse('10/27/2026')).toBe('2026-10-27');
    expect(adapter.parse('2026-10-27')).toBe('2026-10-27');
    expect(adapter.parse('')).toBeNull();
    expect(adapter.isValid(adapter.parse('2/30/2026')!)).toBe(false);
    expect(adapter.isValid(adapter.parse('next tuesday')!)).toBe(false);
  });

  it('shows dates as 10/27/2026, with weeks from Sunday', () => {
    expect(
      adapter.format('2026-10-27', { month: 'numeric', day: 'numeric', year: 'numeric' }),
    ).toBe('10/27/2026');
    expect(adapter.getDayOfWeek('2026-10-25')).toBe(0);
    expect(adapter.getFirstDayOfWeek()).toBe(0);
    expect(adapter.getNumDaysInMonth('2028-02-10')).toBe(29);
    expect(adapter.addCalendarMonths('2026-01-31', 1)).toBe('2026-02-28');
  });

  it('takes today from the family’s time zone, not the device’s', () => {
    // 1:30 AM on October 24 in UTC is still the evening of October 23 in Chicago (the fake family's zone).
    vi.setSystemTime(new Date('2026-10-24T01:30:00Z'));
    expect(adapter.today()).toBe('2026-10-23');
  });
});
