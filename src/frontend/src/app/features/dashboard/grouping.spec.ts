import { childNames, groupParentingTime, placeInWeek } from './grouping';
import { ParentingTime } from './model';

const kai = { id: 'c-kai', name: 'Kai' };
const aurora = { id: 'c-aurora', name: 'Aurora' };
const jordan = { membershipId: 'm-jordan', displayName: 'Jordan' };
const alex = { membershipId: 'm-alex', displayName: 'Alex' };

function time(
  id: string,
  child: typeof kai,
  caregiver: typeof jordan,
  start: string,
  end: string,
  extra: Partial<ParentingTime> = {},
): ParentingTime {
  return Object.freeze({ id, child, caregiver, start, end, status: 'confirmed', ...extra }) as ParentingTime;
}

describe('parenting-time grouping', () => {
  const sameSchedule = [
    time('p1', kai, jordan, '2026-10-12T08:00', '2026-10-14T18:00'),
    time('p2', aurora, jordan, '2026-10-12T08:00', '2026-10-14T18:00'),
  ];

  it('shows children with the same caregiver and times as one block', () => {
    const blocks = groupParentingTime(sameSchedule, { split: false });

    expect(blocks).toHaveLength(1);
    expect(childNames(blocks[0].children)).toBe('Aurora & Kai');
    expect(blocks[0].caregiver.displayName).toBe('Jordan');
    expect(blocks[0].items.map((i) => i.id)).toEqual(['p1', 'p2']);
  });

  it.each([
    ['a different caregiver', time('p2', aurora, alex, '2026-10-12T08:00', '2026-10-14T18:00')],
    ['different times', time('p2', aurora, jordan, '2026-10-12T08:00', '2026-10-14T12:00')],
    ['a different status', time('p2', aurora, jordan, '2026-10-12T08:00', '2026-10-14T18:00', { status: 'proposed' })],
    ['a pending change on one child', time('p2', aurora, jordan, '2026-10-12T08:00', '2026-10-14T18:00', { changePending: true })],
  ])('keeps children apart when they have %s', (_, other) => {
    const blocks = groupParentingTime([sameSchedule[0], other], { split: false });

    expect(blocks).toHaveLength(2);
  });

  it('can split matching schedules into one block per child, as a view only', () => {
    const blocks = groupParentingTime(sameSchedule, { split: true });

    expect(blocks.map((b) => childNames(b.children))).toEqual(['Aurora', 'Kai']);
  });

  it('never changes the underlying records, whether grouped or split', () => {
    const before = JSON.stringify(sameSchedule);

    groupParentingTime(sameSchedule, { split: false });
    groupParentingTime(sameSchedule, { split: true });

    expect(JSON.stringify(sameSchedule)).toBe(before); // Records are also frozen, so a write would throw.
  });

  it('names larger groups compactly', () => {
    const children = ['Aurora', 'Kai', 'Mia', 'Noor', 'Ren'].map((name) => ({ id: name, name }));

    expect(childNames(children.slice(0, 3))).toBe('Aurora, Kai & Mia');
    expect(childNames(children)).toBe('Aurora, Kai & 3 more');
  });
});

describe('placing blocks in the week', () => {
  it('spans the days a block covers and clips to the week', () => {
    const blocks = groupParentingTime(
      [
        time('p1', kai, jordan, '2026-10-12T08:00', '2026-10-14T18:00'),
        time('p2', kai, alex, '2026-10-16T15:00', '2026-10-19T08:00'), // continues into next week
        time('p3', kai, jordan, '2026-10-09T15:00', '2026-10-12T08:00'), // started last week
      ],
      { split: false },
    );
    const placed = placeInWeek(blocks, '2026-10-12');

    expect(placed.get(blocks[1].key)).toMatchObject({ startColumn: 1, endColumn: 4, continuesBefore: false });
    expect(placed.get(blocks[2].key)).toMatchObject({ startColumn: 5, endColumn: 8, continuesAfter: true });
    expect(placed.get(blocks[0].key)).toMatchObject({ startColumn: 1, endColumn: 2, continuesBefore: true });
  });

  it('puts overlapping blocks on separate rows', () => {
    const blocks = groupParentingTime(
      [
        time('p1', kai, jordan, '2026-10-12T08:00', '2026-10-14T18:00'),
        time('p2', kai, alex, '2026-10-14T18:00', '2026-10-16T15:00'), // handoff on Wednesday
        time('p3', kai, jordan, '2026-10-17T09:00', '2026-10-18T18:00'),
      ],
      { split: false },
    );
    const lanes = blocks.map((b) => placeInWeek(blocks, '2026-10-12').get(b.key)!.lane);

    expect(lanes).toEqual([0, 1, 0]);
  });

  it('treats an arrangement ending at midnight as ending the day before', () => {
    const blocks = groupParentingTime([time('p1', kai, jordan, '2026-10-12T08:00', '2026-10-14T00:00')], { split: false });

    expect(placeInWeek(blocks, '2026-10-12').get(blocks[0].key)).toMatchObject({ startColumn: 1, endColumn: 3 });
  });
});
