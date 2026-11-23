import { CalendarItem } from '../../calendar-items';
import { cardStatus, displayTitle, startText, typeText } from './item-card.component';

/** A synthetic calendar item (#729). */
function item(over: Partial<CalendarItem> = {}): CalendarItem {
  return {
    id: 'i',
    title: 'Soccer practice',
    kind: 'activity',
    category: 'Activity',
    categoryLabel: 'Activity',
    icon: 'soccer',
    start: '2026-11-16T16:30',
    end: '2026-11-16T17:30',
    firstDate: '2026-11-16',
    lastDate: '2026-11-16',
    allDay: false,
    spansDays: false,
    status: 'confirmed',
    pendingChange: 'None',
    beforeCoParentJoined: false,
    children: [{ id: 'kai', name: 'Kai' }],
    parents: [],
    ownerName: 'Alex',
    isMine: true,
    location: null,
    notes: null,
    warnings: [],
    ...over,
  } as CalendarItem;
}

describe('Quiet Planner cards (#729)', () => {
  it('says the type, and the children for an activity, never for parenting time or a family event', () => {
    expect(typeText(item())).toBe('Activity · Kai');
    expect(typeText(item({ kind: 'parenting', categoryLabel: 'Parenting time' }))).toBe('Parenting time');
    expect(typeText(item({ kind: 'family', categoryLabel: 'Family event' }))).toBe('Family event');
  });

  it('shows the start time, all day, or the dates of a longer item', () => {
    expect(startText(item())).toBe('4:30 PM');
    expect(startText(item({ allDay: true, spansDays: true }))).toBe('All day');
    expect(startText(item({ allDay: true, spansDays: true, lastDate: '2026-11-18' }))).toBe('Nov 16 – Nov 18');
  });

  it('puts a proposal or decline in words before the title, and done for a finished task', () => {
    expect(cardStatus(item({ status: 'pending' }))).toBe('Proposed');
    expect(cardStatus(item({ status: 'declined' }))).toBe('Declined');
    expect(cardStatus(item())).toBeNull();
    expect(cardStatus(item({ kind: 'task', done: true }))).toBe('Done');
  });

  it('names whose unavailable time it is, and never a hidden one’s details', () => {
    const sam = [{ id: 'sam', name: 'Sam' }];
    expect(displayTitle(item({ kind: 'unavailable', title: 'Unavailable', parents: sam }))).toBe('Sam · Unavailable');
    expect(displayTitle(item({ kind: 'unavailable', title: 'Dentist', parents: sam }))).toBe('Dentist');
    expect(displayTitle(item({ kind: 'unavailable', title: 'Unavailable', parents: sam, concealed: true }))).toBe('Hidden: unavailable');
  });
});
