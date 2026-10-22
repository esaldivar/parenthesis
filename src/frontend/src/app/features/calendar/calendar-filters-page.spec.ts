import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter, withComponentInputBinding } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { routes } from '../../app.routes';
import { axeViolations } from '../../../testing/axe';
import { CHILDREN, MEMBERS, event, reminder, task } from '../../../testing/calendar-fixtures';
import { fakeAuth } from '../../../testing/fake-auth';
import { ALL_FILTERS, filtersKey } from './calendar-filters';

const F = '/api/families/family-1';
const FAMILY = { id: 'family-1', name: 'Rivera Family', timeZone: 'America/Chicago', createdAt: '2026-10-01T00:00:00Z', members: MEMBERS };
const KEY = filtersKey('user-1', 'family-1');

const EVENTS = [
  event({ id: 'soccer', title: 'Soccer', category: 'Activity' }),
  event({ id: 'sam-time', title: 'Time with Sam', category: 'ParentingTime', caregiverMembershipId: 'm-sam', ownerMembershipId: 'm-sam' }),
  event({ id: 'play', title: 'School play', category: 'Joint', status: 'PendingApproval', childIds: [] }),
  event({ id: 'away', title: 'Unavailable', category: 'Unavailable', childIds: [], ownerMembershipId: 'm-sam', notes: 'Private reason' }),
];

describe('calendar filters on the page', () => {
  let http: HttpTestingController;
  let harness: RouterTestingHarness;

  async function settle() {
    for (let i = 0; i < 3; i++) {
      await harness.fixture.whenStable();
      harness.fixture.detectChanges();
    }
  }

  /** Answers the latest calendar load with the synthetic family's items. */
  async function answerLoad() {
    const request = await vi.waitFor(() => {
      const found = http.match((r) => r.url === `${F}/calendar/events`);
      expect(found.length).toBeGreaterThan(0);
      return found[found.length - 1];
    });
    for (const r of http.match((r) => r.url === `${F}/calendar/reminders`)) r.flush([reminder()]);
    for (const r of http.match((r) => r.url === `${F}/calendar/tasks`)) r.flush([task()]);
    for (const r of http.match(F)) r.flush(FAMILY);
    for (const r of http.match(`${F}/children`)) r.flush(CHILDREN);
    request.flush(EVENTS);
    await settle();
  }

  async function open(url = '/calendar?date=2026-10-20&view=list') {
    TestBed.configureTestingModule({
      providers: [provideRouter(routes, withComponentInputBinding()), provideHttpClient(), provideHttpClientTesting(), fakeAuth()],
    });
    harness = await RouterTestingHarness.create(url);
    http = TestBed.inject(HttpTestingController);
    await answerLoad();
  }

  const text = (el: Element | null) => (el?.textContent ?? '').replace(/\s+/g, ' ').trim();
  const main = () => document.querySelector('app-calendar-page') as HTMLElement;
  const panel = () => document.querySelector('app-calendar-filter-panel [role="dialog"]') as HTMLElement | null;
  const filtersButton = () => main().querySelector<HTMLButtonElement>('.filters-button')!;
  /** The titles shown in List, sorted so the checks don't depend on time order. */
  const shownTitles = () => [...main().querySelectorAll('app-calendar-list button.item .title')].map(text).sort();
  const button = (label: string, within: Element) =>
    [...within.querySelectorAll<HTMLButtonElement>('button')].find((b) => text(b) === label || b.getAttribute('aria-label') === label)!;
  const box = (label: string) =>
    [...panel()!.querySelectorAll('label')].find((l) => text(l) === label)!.querySelector('input') as HTMLInputElement;

  async function untick(...labels: string[]) {
    for (const label of labels) {
      box(label).click();
      await settle();
    }
  }

  beforeEach(() => localStorage.clear());

  it('opens Filters as a dialog, hides a type at once, and returns focus to the button on Done', async () => {
    await open();
    expect(shownTitles()).toEqual(['School play', 'Science fair poster', 'Soccer', 'Spirit Day', 'Time with Sam', 'Unavailable']);
    expect(filtersButton().getAttribute('aria-expanded')).toBe('false');

    filtersButton().click();
    await settle();
    expect(panel()!.getAttribute('aria-modal')).toBe('true');
    expect(text(panel())).toContain('Only your view changes.');
    await untick('Unavailable');

    expect(shownTitles()).not.toContain('Unavailable');
    expect(filtersButton().getAttribute('aria-label')).toBe('Filters, 1 active');
    expect(text(main().querySelector('.active-filters'))).toContain('Type: hiding Unavailable');
    // Hiding a block never reveals or counts its private details anywhere.
    expect(document.body.textContent).not.toContain('Private reason');

    button('Done', panel()!).click();
    await settle();
    expect(panel()).toBeNull();
    expect(document.activeElement).toBe(filtersButton());
  });

  it('combines dimensions (AND) and options within one (OR), and keeps them when switching views', async () => {
    await open();
    filtersButton().click();
    await settle();
    await untick('Activity', 'Unavailable', 'Task', 'Reminder', 'Created by me', 'Created by co-parent', 'Involving co-parent');
    button('Done', panel()!).click();
    await settle();

    // Parenting time or family events, involving me: only the family event (Sam's time doesn't involve me).
    expect(shownTitles()).toEqual(['School play']);
    button('Week', main().querySelector('.segmented')!).click();
    await settle();
    await answerLoad();
    expect([...main().querySelectorAll('app-calendar-week .agenda button.item .title')].map(text)).toEqual(['School play']);
  });

  it('says plainly when nothing matches, and Reset filters shows everything again and forgets the choice', async () => {
    await open();
    filtersButton().click();
    await settle();
    await untick('Parenting time', 'Activity', 'Family event', 'Unavailable', 'Task', 'Reminder');
    button('Done', panel()!).click();
    await settle();

    expect(text(main().querySelector('.filtered-out'))).toContain('No items match your filters.');
    expect(text(main().querySelector('.active-filters'))).toContain('Type: None');
    expect(localStorage.getItem(KEY)).not.toBeNull();
    button('Reset filters', main().querySelector('.filtered-out')!).click();
    await settle();

    expect(shownTitles()).toHaveLength(6);
    expect(main().querySelector('.active-filters')).toBeNull();
    expect(localStorage.getItem(KEY)).toBeNull();
  });

  it('removes one filter from its chip, and filters by approval without labelling tasks or reminders', async () => {
    await open();
    filtersButton().click();
    await settle();
    await untick('Confirmed', 'Change pending', 'Created by co-parent');
    button('Done', panel()!).click();
    await settle();
    expect(shownTitles()).toEqual(['School play']);

    button('Remove Approval filter: Pending approval', main()).click();
    await settle();
    // Still filtered by parents: created by me, or involving either of us (Sam's time and Sam's unavailable time).
    expect(shownTitles()).toEqual(['School play', 'Soccer', 'Time with Sam', 'Unavailable']);
  });

  it('remembers this parent’s filters for this family only', async () => {
    localStorage.setItem(KEY, JSON.stringify({ ...ALL_FILTERS, types: ['task'] }));
    localStorage.setItem(filtersKey('user-2', 'family-1'), JSON.stringify({ ...ALL_FILTERS, types: [] }));
    await open();

    // Unavailable time hidden by the type filter stays findable as a marker.
    expect(shownTitles()).toEqual(['Hidden: unavailable', 'Science fair poster']);
    expect(filtersButton().getAttribute('aria-label')).toBe('Filters, 1 active');
  });

  it('has no axe violations with filters active and the panel open', async () => {
    localStorage.setItem(KEY, JSON.stringify({ ...ALL_FILTERS, types: ['task', 'reminder'] }));
    await open();
    expect(await axeViolations(document.body)).toEqual([]);
    filtersButton().click();
    await settle();
    expect(await axeViolations(document.body)).toEqual([]);
  });
});
