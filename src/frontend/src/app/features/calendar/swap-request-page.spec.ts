import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter, withComponentInputBinding } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { routes } from '../../app.routes';
import { CalendarEvent } from '../../core/api/api';
import { axeViolations } from '../../../testing/axe';
import { CHILDREN, MEMBERS, event } from '../../../testing/calendar-fixtures';
import { fakeAuth } from '../../../testing/fake-auth';

const F = '/api/families/family-1';
const FAMILY = { id: 'family-1', name: 'Rivera Family', timeZone: 'America/Chicago', createdAt: '2026-10-01T00:00:00Z', members: MEMBERS };

// Monday, October 19, 8:00 AM – 3:00 PM in Chicago.
const PARENTING = event({
  id: 'pt',
  title: 'Kai with Alex',
  category: 'ParentingTime',
  startsAt: '2026-10-19T13:00:00Z',
  endsAt: '2026-10-19T20:00:00Z',
  caregiverMembershipId: 'm-alex',
});

describe('Request swap', () => {
  let http: HttpTestingController;
  let harness: RouterTestingHarness;

  async function settle() {
    for (let i = 0; i < 3; i++) {
      await harness.fixture.whenStable();
      harness.fixture.detectChanges();
    }
  }

  async function open(shown: CalendarEvent = PARENTING) {
    TestBed.configureTestingModule({
      providers: [provideRouter(routes, withComponentInputBinding()), provideHttpClient(), provideHttpClientTesting(), fakeAuth()],
    });
    harness = await RouterTestingHarness.create(`/calendar/${shown.id}/swap`);
    http = TestBed.inject(HttpTestingController);
    await vi.waitFor(() => http.expectOne(`${F}/calendar/events/${shown.id}`)).then((r) => r.flush(shown));
    await vi.waitFor(() => http.expectOne(F)).then((r) => r.flush(FAMILY));
    await vi.waitFor(() => http.expectOne(`${F}/children`)).then((r) => r.flush(CHILDREN));
    await settle();
  }

  const page = () => document.querySelector('app-swap-request-page') as HTMLElement;
  const text = (el: Element | null) => (el?.textContent ?? '').replace(/\s+/g, ' ').trim();
  const button = (label: string) => [...page().querySelectorAll<HTMLElement>('button, a')].find((b) => text(b) === label);

  async function click(label: string) {
    const target = button(label);
    if (!target) {
      throw new Error(`No button "${label}"`);
    }
    target.click();
    await settle();
  }

  function type(selector: string, value: string) {
    const input = page().querySelector<HTMLInputElement | HTMLTextAreaElement>(selector)!;
    input.value = value;
    input.dispatchEvent(new Event('input'));
    harness.fixture.detectChanges();
  }

  async function newDates() {
    type('input[formcontrolname="startDate"]', '2026-10-24');
    type('input[formcontrolname="endDate"]', '2026-10-24');
    await click('Continue');
  }

  const conflicts = () => vi.waitFor(() => http.expectOne((r) => r.url === `${F}/calendar/events/pt/conflicts`));

  it('starts from the current parenting time and checks the new dates before anything is sent', async () => {
    await open();

    expect(text(page().querySelector('h1'))).toBe('Request parenting time swap');
    expect(text(page().querySelector('.card'))).toContain('Monday, October 19 · 8:00 AM – 3:00 PM');
    expect(page().querySelector<HTMLInputElement>('input[formcontrolname="startTime"]')!.value).toBe('08:00');
    await newDates();

    const check = await conflicts();
    expect(check.request.params.get('startsAt')).toBe('2026-10-24T13:00:00.000Z');
    expect(check.request.params.get('endsAt')).toBe('2026-10-24T20:00:00.000Z');
    expect(http.match((r) => r.method === 'PATCH')).toHaveLength(0);
  });

  it('reviews current against proposed, then sends with the reason and stays pending', async () => {
    await open();
    type('textarea[formcontrolname="reason"]', 'I have a work trip that weekend.');
    await newDates();
    (await conflicts()).flush({ warnings: [] });
    await settle();

    expect(text(page().querySelector('h1'))).toBe('Review and send request');
    expect(text(page().querySelector('[aria-labelledby="current-heading"]'))).toContain('Monday, October 19');
    expect(text(page().querySelector('[aria-labelledby="proposed-heading"]'))).toContain('Saturday, October 24 · 8:00 AM – 3:00 PM');
    expect(text(page())).toContain('Kai (a swap keeps the same children)');
    expect(text(page())).toContain('Sam, who can approve or decline it.');
    expect(text(page())).not.toContain('propose a different time');
    await click('Send request');

    const patch = await vi.waitFor(() => http.expectOne((r) => r.method === 'PATCH' && r.url === `${F}/calendar/events/pt`));
    expect(patch.request.body).toEqual({
      startsAt: '2026-10-24T13:00:00.000Z',
      endsAt: '2026-10-24T20:00:00.000Z',
      allDay: false,
      reason: 'I have a work trip that weekend.',
    });
    patch.flush({ ...PARENTING, pendingChange: 'Modify' });
    await settle();

    expect(text(page().querySelector('h1'))).toBe('Swap request sent');
    expect(text(page())).toContain('Pending approval');
    expect(button('View request details')!.getAttribute('href')).toBe('/calendar?date=2026-10-19&event=pt');
  });

  it('asks first when the co-parent is unavailable: Send anyway or Choose different dates', async () => {
    await open();
    await newDates();
    (await conflicts()).flush({ warnings: ['OverlapsCoParentUnavailable'] });
    await settle();

    const clash = page().querySelector('.clash')!;
    expect(text(clash)).toContain('Sam marked that time as unavailable');
    expect(text(clash)).toContain('They may still approve your request.');
    expect(button('Continue')).toBeUndefined();
    expect(http.match((r) => r.method === 'PATCH')).toHaveLength(0);

    await click('Choose different dates');
    expect(page().querySelector('.clash')).toBeNull();
    await vi.waitFor(() => expect(document.activeElement?.id).toBe('swap-start-date'));

    type('input[formcontrolname="startDate"]', '2026-10-25');
    type('input[formcontrolname="endDate"]', '2026-10-25');
    await click('Continue');
    (await conflicts()).flush({ warnings: ['OverlapsCoParentUnavailable'] });
    await settle();
    await click('Send anyway');
    expect(text(page().querySelector('h1'))).toBe('Review and send request');
  });

  it('needs dates that differ from the current ones', async () => {
    await open();
    await click('Continue');

    expect(text(page())).toContain('Choose dates or times that are different from the current ones.');
    expect(http.match((r) => r.url.endsWith('/conflicts'))).toHaveLength(0);
  });

  it('says plainly when a swap isn’t possible, such as while another request waits', async () => {
    await open({ ...PARENTING, pendingChange: 'Modify' });

    expect(page().querySelector('form')).toBeNull();
    expect(text(page())).toContain('This parenting time can’t be swapped right now. It already has a request waiting for an answer.');
  });

  it('has no axe violations while choosing and while reviewing', async () => {
    await open();
    expect(await axeViolations(document.body)).toEqual([]);

    await newDates();
    (await conflicts()).flush({ warnings: [] });
    await settle();
    expect(await axeViolations(document.body)).toEqual([]);
  });
});
