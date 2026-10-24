import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter, withComponentInputBinding } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { routes } from '../../app.routes';
import { axeViolations } from '../../../testing/axe';
import { CHILDREN, MEMBERS, event } from '../../../testing/calendar-fixtures';
import { fakeAuth } from '../../../testing/fake-auth';
import { ALL_FILTERS, CalendarFilters, filtersKey } from './calendar-filters';

const F = '/api/families/family-1';
const FAMILY = { id: 'family-1', name: 'Rivera Family', timeZone: 'America/Chicago', createdAt: '2026-10-01T00:00:00Z', members: MEMBERS };

// Synthetic week of October 18, 2026 (Chicago). Sam is unavailable Monday 9:00 AM – 1:00 PM, during Sam's parenting
// time, and again Wednesday morning, when nobody has parenting time.
const EVENTS = [
  event({ id: 'soccer', title: 'Soccer', category: 'Activity' }),
  event({
    id: 'sam-time',
    title: 'Kai with Sam',
    category: 'ParentingTime',
    caregiverMembershipId: 'm-sam',
    ownerMembershipId: 'm-sam',
    startsAt: '2026-10-19T13:00:00Z',
    endsAt: '2026-10-19T22:00:00Z',
  }),
  event({
    id: 'away-mon',
    title: 'Unavailable',
    category: 'Unavailable',
    childIds: [],
    ownerMembershipId: 'm-sam',
    notes: null,
    startsAt: '2026-10-19T14:00:00Z',
    endsAt: '2026-10-19T18:00:00Z',
  }),
  event({
    id: 'away-wed',
    title: 'Unavailable',
    category: 'Unavailable',
    childIds: [],
    ownerMembershipId: 'm-sam',
    notes: null,
    startsAt: '2026-10-21T14:00:00Z',
    endsAt: '2026-10-21T16:00:00Z',
  }),
];

describe('hidden unavailable time', () => {
  let http: HttpTestingController;
  let harness: RouterTestingHarness;

  async function settle() {
    for (let i = 0; i < 3; i++) {
      await harness.fixture.whenStable();
      harness.fixture.detectChanges();
    }
  }

  async function open(filters: CalendarFilters, url = '/calendar?date=2026-10-20') {
    localStorage.clear();
    localStorage.setItem(filtersKey('user-1', 'family-1'), JSON.stringify(filters));
    TestBed.configureTestingModule({
      providers: [provideRouter(routes, withComponentInputBinding()), provideHttpClient(), provideHttpClientTesting(), fakeAuth()],
    });
    harness = await RouterTestingHarness.create(url);
    http = TestBed.inject(HttpTestingController);
    const request = await vi.waitFor(() => {
      const found = http.match((r) => r.url === `${F}/calendar/events`);
      expect(found.length).toBeGreaterThan(0);
      return found[found.length - 1];
    });
    for (const r of http.match((r) => r.url === `${F}/calendar/reminders` || r.url === `${F}/calendar/tasks`)) r.flush([]);
    for (const r of http.match(F)) r.flush(FAMILY);
    for (const r of http.match(`${F}/children`)) r.flush(CHILDREN);
    request.flush(EVENTS);
    await settle();
  }

  const text = (el: Element | null) => (el?.textContent ?? '').replace(/\s+/g, ' ').trim();
  const main = () => document.querySelector('app-calendar-page') as HTMLElement;
  const hideUnavailable = { ...ALL_FILTERS, types: ALL_FILTERS.types.filter((t) => t !== 'unavailable') };
  const gridMarkers = () => [...main().querySelectorAll<HTMLButtonElement>('app-calendar-week .daycol li.marker button')];

  afterEach(() => localStorage.clear());

  it('marks hidden unavailable time subtly in the week grid, without taking a lane, and names only who and when', async () => {
    await open(hideUnavailable);

    const markers = gridMarkers();
    expect(markers.map((m) => m.getAttribute('aria-label'))).toEqual([
      'Hidden unavailable time, Sam, 9:00 AM – 1:00 PM. Opens its details.',
      'Hidden unavailable time, Sam, 9:00 AM – 11:00 AM. Opens its details.',
    ]);
    expect(markers[0].getAttribute('data-concealed')).toBe('true');
    // Monday's parenting time keeps the whole day: the marker isn't a second lane.
    const monday = main().querySelectorAll<HTMLElement>('app-calendar-week .daycol')[1];
    expect(monday.style.getPropertyValue('--lanes')).toBe('1');
    // The phone list and the key words show it as hidden, not as ordinary unavailable time.
    const rows = [...main().querySelectorAll('app-calendar-week .agenda button.item[data-concealed="true"]')];
    expect(rows.map((r) => text(r.querySelector('.title')))).toEqual(['Hidden: unavailable', 'Hidden: unavailable']);
  });

  it('opens the details, and offers a swap only when it overlaps that parent’s parenting time', async () => {
    await open(hideUnavailable);

    gridMarkers()[0].click();
    await settle();
    let dialog = document.querySelector('app-event-details [role="dialog"]')!;
    expect(text(dialog)).toContain('Private details aren’t shared.');
    expect(text(dialog)).toContain('Sam has parenting time then');
    const swap = [...dialog.querySelectorAll('a')].find((a) => text(a) === 'Request parenting time swap')!;
    expect(swap.getAttribute('href')).toBe('/calendar/sam-time/swap');
    // Opening the details never sends anything.
    expect(http.match((r) => r.method !== 'GET')).toHaveLength(0);

    (dialog.querySelector('button[aria-label="Close details"]') as HTMLElement).click();
    await settle();
    gridMarkers()[1].click();
    await settle();
    dialog = document.querySelector('app-event-details [role="dialog"]')!;
    expect([...dialog.querySelectorAll('a')].some((a) => text(a) === 'Request parenting time swap')).toBe(false);
  });

  it('shows no marker when other filters exclude the time anyway, and none when Unavailable is shown', async () => {
    await open({ ...hideUnavailable, parents: ['created-by-me'] });
    expect(gridMarkers()).toHaveLength(0);

    TestBed.resetTestingModule();
    await open(ALL_FILTERS);
    expect(gridMarkers()).toHaveLength(0);
    expect(main().querySelectorAll('app-calendar-week .daycol button.item[data-kind="unavailable"]')).toHaveLength(2);
  });

  it('keeps hidden time as a hollow marker in Month too', async () => {
    await open(hideUnavailable, '/calendar?date=2026-10-20&view=month');
    const concealed = main().querySelectorAll('app-calendar-month button.item[data-concealed="true"]');
    expect(concealed).toHaveLength(2);
    expect(text(concealed[0])).toContain('Hidden: unavailable');
  });

  it('has no axe violations with markers and their details', async () => {
    await open(hideUnavailable);
    expect(await axeViolations(document.body)).toEqual([]);
    gridMarkers()[0].click();
    await settle();
    expect(await axeViolations(document.body)).toEqual([]);
  });
});
