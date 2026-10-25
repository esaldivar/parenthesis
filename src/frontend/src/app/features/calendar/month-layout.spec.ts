import { CalendarItem } from './calendar-items';
import { MONTH_LANES, layOutWeek, weekOf } from './month-layout';

/** A synthetic calendar item over `firstDate`–`lastDate` (all day unless times are given). */
function item(id: string, firstDate: string, lastDate = firstDate, over: Partial<CalendarItem> = {}): CalendarItem {
  return {
    id,
    title: `Item ${id}`,
    kind: 'activity',
    category: 'Activity',
    categoryLabel: 'Activity',
    icon: 'event',
    start: `${firstDate}T00:00`,
    end: `${lastDate}T23:59`,
    firstDate,
    lastDate,
    allDay: true,
    spansDays: lastDate > firstDate,
    status: 'confirmed',
    pendingChange: 'None',
    parents: [],
    children: [],
    ownerName: 'Alex',
    concealed: false,
    ...over,
  } as unknown as CalendarItem;
}

describe('Month view bars (#250)', () => {
  // Sunday, October 18 to Saturday, October 24, 2026.
  const week = weekOf('2026-10-18');

  it('spans an item across its own days, once per week row, marking where it goes on', () => {
    // Parenting time Friday, October 23 through the next Thursday.
    const weekend = item('pt', '2026-10-23', '2026-10-29', { kind: 'parenting', title: 'Time with Alex' });
    const first = layOutWeek(week, [weekend]).bars;
    const next = layOutWeek(weekOf('2026-10-25'), [weekend]).bars;

    expect(first).toHaveLength(1);
    expect([first[0].start, first[0].end, first[0].continuesBefore, first[0].continuesAfter]).toEqual([6, 8, false, true]);
    expect(first[0].label).toContain('Continues into next week.');
    // The same event on the next row, Sunday to Thursday.
    expect([next[0].start, next[0].end, next[0].continuesBefore, next[0].continuesAfter]).toEqual([1, 6, true, false]);
    expect(next[0].item).toBe(weekend);
  });

  it('keeps a single day in its own day, and crosses a month boundary without an extra day', () => {
    const halloween = item('h', '2026-10-31', '2026-11-01');
    const bars = layOutWeek(weekOf('2026-10-25'), [item('one', '2026-10-27'), halloween]).bars;
    const one = bars.find((b) => b.item.id === 'one')!;
    const crossing = bars.find((b) => b.item.id === 'h')!;
    expect([one.start, one.end]).toEqual([3, 4]);
    expect([crossing.start, crossing.end, crossing.continuesAfter]).toEqual([7, 8, true]);
    expect(layOutWeek(weekOf('2026-11-01'), [halloween]).bars.map((b) => [b.start, b.end])).toEqual([[1, 2]]);
  });

  it('stacks overlapping items in lanes, longer first, and never two in one lane on the same day', () => {
    const long = item('long', '2026-10-19', '2026-10-22');
    const short = item('short', '2026-10-20');
    const later = item('later', '2026-10-23');
    const bars = layOutWeek(week, [short, later, long]).bars;
    const lane = (id: string) => bars.find((b) => b.item.id === id)!.lane;
    expect([lane('long'), lane('short'), lane('later')]).toEqual([0, 1, 0]);
  });

  it('keeps a pending proposal ahead of a longer confirmed item starting the same day', () => {
    const items = [
      ...Array.from({ length: MONTH_LANES }, (_, i) => item(`long${i}`, '2026-10-20', '2026-10-23')),
      item('proposal', '2026-10-20', '2026-10-20', { status: 'pending' }),
    ];
    const { bars, more } = layOutWeek(week, items);
    expect(bars.find((b) => b.item.id === 'proposal')?.lane).toBe(0);
    expect(more.every((m) => m.pending === 0)).toBe(true);
  });

  it('puts what doesn’t fit behind "+N more" on each day it covers, saying how many are pending', () => {
    const busy = Array.from({ length: MONTH_LANES + 2 }, (_, i) =>
      item(`b${i}`, '2026-10-21', '2026-10-21', i === 0 ? { status: 'pending' } : {}),
    );
    const { bars, more } = layOutWeek(week, busy);
    expect(bars).toHaveLength(MONTH_LANES);
    // A pending item comes first, so it's shown rather than hidden.
    expect(bars.some((b) => b.item.status === 'pending')).toBe(true);
    expect(more).toEqual([
      expect.objectContaining({ date: '2026-10-21', column: 4, count: 2, pending: 0 }),
    ]);

    const allPending = Array.from({ length: MONTH_LANES + 1 }, (_, i) => item(`p${i}`, '2026-10-21', '2026-10-21', { status: 'pending' }));
    const hidden = layOutWeek(week, allPending).more[0];
    expect(hidden.pending).toBe(1);
    expect(hidden.label).toBe('1 more on Wednesday, October 21, 1 pending approval. Open this week.');
  });

  it('distinguishes identical single-day occurrences by their full date', () => {
    const occurrence = (date: string) => item('pt', date, date, { title: 'Time with Alex', status: 'pending' });
    const first = layOutWeek(weekOf('2026-11-01'), [occurrence('2026-11-07')]).bars[0].label;
    const next = layOutWeek(weekOf('2026-11-08'), [occurrence('2026-11-14')]).bars[0].label;
    expect(first).toContain('Saturday, November 7, 2026');
    expect(next).toContain('Saturday, November 14, 2026');
    expect(first).toContain('Pending approval');
    expect(first).not.toBe(next);
  });

  it('keeps both full dates on every continuation, including a year boundary', () => {
    const crossing = item('trip', '2026-12-31', '2027-01-04');
    for (const first of ['2026-12-27', '2027-01-03']) {
      const label = layOutWeek(weekOf(first), [crossing]).bars[0].label;
      expect(label).toContain('Thursday, December 31, 2026 through Monday, January 4, 2027');
    }
  });

  it('labels status in words for screen readers and on the bar', () => {
    const [proposed] = layOutWeek(week, [item('p', '2026-10-20', '2026-10-20', { status: 'pending', title: 'Weekend with Sam' })]).bars;
    expect(proposed.status).toBe('Proposed');
    expect(proposed.label).toContain('Weekend with Sam');
    expect(proposed.label).toContain('Pending approval');
    const [declined] = layOutWeek(week, [item('d', '2026-10-20', '2026-10-20', { status: 'declined' })]).bars;
    expect(declined.status).toBe('Declined');
  });
});
