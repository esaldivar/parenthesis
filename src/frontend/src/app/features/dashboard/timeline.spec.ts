import { FamilyEvent } from './model';
import { MIN_SLOTS, placeDay, visibleHours } from './timeline';

const event = (id: string, time: string | undefined, durationMinutes?: number): FamilyEvent =>
  Object.freeze({ id, title: id, date: '2026-10-14', time, durationMinutes, category: 'other', children: [], status: 'confirmed' });

describe('activity time grid', () => {
  it('shows 8 AM to 8 PM by default and widens for early or late activities', () => {
    expect(visibleHours([event('a', '10:00')])).toEqual({ startHour: 8, endHour: 21 });
    expect(visibleHours([event('early', '06:30'), event('late', '21:00', 90)])).toEqual({ startHour: 6, endHour: 23 });
  });

  it('places an activity by its start time in 30-minute rows, with a minimum legible height', () => {
    const { placements } = placeDay([event('dentist', '10:00'), event('long', '13:00', 240)], 8);

    expect(placements.get('dentist')).toEqual({ row: 5, span: MIN_SLOTS, lane: 1 });
    expect(placements.get('long')).toEqual({ row: 11, span: 8, lane: 1 });
  });

  it('puts overlapping activities side by side', () => {
    const { placements, lanes } = placeDay([event('a', '16:00'), event('b', '16:30'), event('c', '19:00')], 8);

    expect([placements.get('a')!.lane, placements.get('b')!.lane, placements.get('c')!.lane]).toEqual([1, 2, 1]);
    expect(lanes).toBe(2);
  });

  it('ignores all-day items, which belong to the all-day row', () => {
    expect(placeDay([event('all-day', undefined)], 8).placements.size).toBe(0);
  });
});
