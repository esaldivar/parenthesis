import { TestBed } from '@angular/core/testing';
import { DateAdapter } from '@angular/material/core';
import { fakeAuth } from '../../../testing/fake-auth';
import {
  END_BEFORE_START,
  MISSING_END,
  MISSING_START,
  PAST_END,
  PAST_START,
  TOO_LONG,
  UNREADABLE_DATE,
  choosable,
  dateIssues,
  dayFilter,
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

  it('disables only days before today, never days before or after the other date (#248)', () => {
    const days = dayFilter(today);
    expect(days('2026-10-22')).toBe(false);
    expect(days('2026-10-23')).toBe(true);
    // Far ahead, or before a chosen start: the calendar never decides the order of the dates.
    expect(days('2027-06-30')).toBe(true);
    expect(dayFilter(today, ['2026-10-20'])('2026-10-20')).toBe(true); // An edit keeps its own past day.
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
    // An event under way keeps its own end, but a new end is from today on.
    const underWay = { ...range, startDate: '2026-10-20', endDate: '2026-10-27' };
    expect(rangeProblems(underWay, today, ['2026-10-20', '2026-10-27'])).toEqual({});
    expect(
      rangeProblems({ ...underWay, endDate: '2026-10-21' }, today, ['2026-10-20', '2026-10-27']),
    ).toEqual({ endsAt: PAST_END });
    expect(rangeProblems({ ...range, startDate: 'invalid-date' }, today)).toEqual({
      startsAt: UNREADABLE_DATE,
    });
    expect(rangeProblems({ ...range, endTime: '08:00' }, today)).toEqual({ endsAt: END_BEFORE_START });
    // A start after the end, or an end before the start, is invalid (never moved for the parent, #248).
    expect(rangeProblems({ ...range, startDate: '2026-12-20', endDate: '2026-12-14' }, today)).toEqual({
      endsAt: END_BEFORE_START,
    });
    expect(
      rangeProblems({ ...range, allDay: true, startDate: '2026-12-20', endDate: '2026-12-20' }, today),
    ).toEqual({});
    expect(rangeProblems({ ...range, endDate: null }, today)).toEqual({ endsAt: MISSING_END });
    expect(rangeProblems({ ...range, startDate: null, endDate: null }, today)).toEqual({
      startsAt: MISSING_START,
      endsAt: MISSING_END,
    });
    expect(rangeProblems({ ...range, endDate: 'invalid-date' }, today)).toEqual({ endsAt: UNREADABLE_DATE });
    // Up to 31 days: an all-day event's last day counts whole.
    const allDay = { ...range, allDay: true, startDate: '2026-11-01' };
    expect(rangeProblems({ ...allDay, endDate: '2026-12-01' }, today)).toEqual({});
    expect(rangeProblems({ ...allDay, endDate: '2026-12-02' }, today)).toEqual({ endsAt: TOO_LONG });
    expect(rangeProblems({ ...range, endDate: '2026-11-24', endTime: '09:00' }, today)).toEqual({});
    expect(rangeProblems({ ...range, endDate: '2026-11-24', endTime: '09:30' }, today)).toEqual({ endsAt: TOO_LONG });
    // The length is measured in the family's zone, as the server measures it: in Chicago, clocks go back on
    // November 1, so 9:00 AM October 24 to 9:00 AM November 24 is 31 days and an hour.
    const chicago = 'America/Chicago';
    expect(rangeProblems({ ...range, endDate: '2026-11-24', endTime: '08:00' }, today, [], chicago)).toEqual({});
    expect(rangeProblems({ ...range, endDate: '2026-11-24', endTime: '09:00' }, today, [], chicago)).toEqual({
      endsAt: TOO_LONG,
    });
    expect(rangeProblems({ ...allDay, startDate: '2026-11-02', endDate: '2026-12-02' }, today, [], chicago)).toEqual({});
    expect(rangeProblems({ ...allDay, endDate: '2026-12-01' }, today, [], chicago)).toEqual({ endsAt: TOO_LONG });
    // Earlier today is fine (owner decision): only past days are refused.
    expect(
      rangeProblems(
        { ...range, startDate: today, endDate: today, startTime: '00:30', endTime: '01:00' },
        today,
      ),
    ).toEqual({});
  });

  it('marks a missing date only after a send was tried, and the server’s answer until the dates change (#248)', () => {
    expect(dateIssues({ endsAt: MISSING_END }, {}, false)).toEqual({ start: null, end: null });
    expect(dateIssues({ endsAt: MISSING_END }, {}, true)).toEqual({ start: null, end: MISSING_END });
    expect(dateIssues({ endsAt: END_BEFORE_START }, {}, false)).toEqual({ start: null, end: END_BEFORE_START });
    expect(dateIssues({}, { startsAt: PAST_START }, false)).toEqual({ start: PAST_START, end: null });
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
