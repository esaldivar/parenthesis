import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter, withComponentInputBinding } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { routes } from '../../app.routes';
import { CalendarEvent } from '../../core/api/api';
import { axeViolations } from '../../../testing/axe';
import { MEMBERS, event } from '../../../testing/calendar-fixtures';
import { fakeAuth } from '../../../testing/fake-auth';

const F = '/api/families/family-1';
const FAMILY = { id: 'family-1', name: 'Rivera Family', timeZone: 'America/Chicago', createdAt: '2026-10-01T00:00:00Z', members: MEMBERS };

/** Parenting time with Alex, all day Friday to Sunday, October 23–25, 2026 (Chicago). */
const weekend = (over: Partial<CalendarEvent> = {}) =>
  event({
    id: 'pt',
    title: 'Time with Alex',
    category: 'ParentingTime',
    caregiverMembershipId: 'm-alex',
    allDay: true,
    startsAt: '2026-10-23T05:00:00Z',
    endsAt: '2026-10-26T05:00:00Z',
    ...over,
  });

describe('Edit an event', () => {
  let http: HttpTestingController;
  let harness: RouterTestingHarness;

  async function settle() {
    for (let i = 0; i < 3; i++) {
      await harness.fixture.whenStable();
      harness.fixture.detectChanges();
    }
  }

  async function open(current: CalendarEvent) {
    TestBed.configureTestingModule({
      providers: [provideRouter(routes, withComponentInputBinding()), provideHttpClient(), provideHttpClientTesting(), fakeAuth()],
    });
    harness = await RouterTestingHarness.create(`/calendar/${current.id}/edit`);
    http = TestBed.inject(HttpTestingController);
    (await vi.waitFor(() => http.expectOne(`${F}/calendar/events/${current.id}`))).flush(current);
    for (const r of await vi.waitFor(() => {
      const found = http.match(F);
      expect(found.length).toBeGreaterThan(0);
      return found;
    })) {
      r.flush(FAMILY);
    }
    await settle();
  }

  const text = (el: Element | null) => (el?.textContent ?? '').replace(/\s+/g, ' ').trim();
  const page = () => document.querySelector('app-event-edit-page') as HTMLElement;
  const field = (name: string) => page().querySelector<HTMLInputElement>(`[formcontrolname="${name}"]`);
  const submitButton = () => page().querySelector<HTMLButtonElement>('button[type="submit"]')!;

  function type(name: string, value: string) {
    const input = field(name)!;
    input.value = value;
    input.dispatchEvent(new Event('input'));
    harness.fixture.detectChanges();
  }

  async function submit() {
    page().querySelector('form')!.dispatchEvent(new Event('submit'));
    await settle();
  }

  it('changes an activity at once, prefilled in the family’s time zone', async () => {
    await open(event({ location: 'North Field', notes: 'Bring water' }));

    expect(text(page().querySelector('h1'))).toBe('Edit event');
    expect(field('title')!.value).toBe('Soccer practice');
    expect(field('startDate')!.value).toBe('2026-10-20');
    expect(field('startTime')!.value).toBe('10:00');
    expect(field('endTime')!.value).toBe('11:30');
    expect(field('location')!.value).toBe('North Field');
    expect(text(page().querySelector('.note'))).toBe('Changes apply at once, for both of you.');
    type('title', 'Soccer game');
    type('location', '');
    type('endTime', '12:00');
    expect(text(submitButton())).toBe('Save changes');
    await submit();

    const patch = await vi.waitFor(() => http.expectOne((r) => r.method === 'PATCH' && r.url === `${F}/calendar/events/e1`));
    expect(patch.request.body).toEqual({
      title: 'Soccer game',
      allDay: false,
      startsAt: '2026-10-20T15:00:00.000Z',
      endsAt: '2026-10-20T17:00:00.000Z',
      location: '', // Cleared.
      notes: 'Bring water',
      caregiverMembershipId: undefined,
    });
    patch.flush(event({ title: 'Soccer game' }));
    await vi.waitFor(() => expect(TestBed.inject(Router).url).toBe('/calendar?date=2026-10-20'));
  });

  it('sends a change to parenting time for approval, and says the event stays as it is until then', async () => {
    await open(weekend());

    expect(text(page().querySelector('.note'))).toBe(
      'Changes to the title, date, time, place or who has the children go to Sam for approval. Until they answer, the event stays as it is and shows “Change pending”. Notes change at once.',
    );
    // The last day shows as the last day, not the midnight after it.
    expect(field('endDate')!.value).toBe('2026-10-25');
    type('notes', 'Pick up at school');
    expect(text(submitButton())).toBe('Save changes'); // Notes alone don't need approval.
    type('endDate', '2026-10-26');
    expect(text(submitButton())).toBe('Send for approval');
    await submit();

    const patch = await vi.waitFor(() => http.expectOne((r) => r.method === 'PATCH'));
    expect(patch.request.body).toEqual(
      expect.objectContaining({
        allDay: true,
        startsAt: '2026-10-23T05:00:00.000Z',
        endsAt: '2026-10-27T05:00:00.000Z',
        caregiverMembershipId: 'm-alex',
        notes: 'Pick up at school',
      }),
    );
    expect(patch.request.body.title).toBe('Time with Alex');
    patch.flush(weekend({ pendingChange: 'Modify' }), { status: 202, statusText: 'Accepted' });
    await vi.waitFor(() => expect(TestBed.inject(Router).url).toBe('/calendar?date=2026-10-23'));
  });

  it('keeps unavailable time private: no title or place, and a private note', async () => {
    await open(event({ id: 'u', title: 'Unavailable', category: 'Unavailable', childIds: [], notes: 'Dentist', allDay: true, startsAt: '2026-10-21T05:00:00Z', endsAt: '2026-10-22T05:00:00Z' }));

    expect(field('title')).toBeNull();
    expect(field('location')).toBeNull();
    expect(text(page())).toContain('Only you can see this. Your co-parent sees “Unavailable”.');
    expect(text(page().querySelector('.note'))).toBe('Changes apply at once. Sam sees only “Unavailable”; your note stays private to you.');
    await submit();

    const patch = await vi.waitFor(() => http.expectOne((r) => r.method === 'PATCH'));
    expect(patch.request.body).toEqual(
      expect.objectContaining({ title: undefined, location: undefined, notes: 'Dentist', endsAt: '2026-10-22T05:00:00.000Z' }),
    );
  });

  it('checks the times before sending', async () => {
    await open(event());
    type('endTime', '09:00');
    await submit();

    expect(text(page())).toContain('Choose an end that’s after the start.');
    expect(http.match((r) => r.method === 'PATCH')).toHaveLength(0);
  });

  it('doesn’t offer a form while a request on the event is waiting', async () => {
    await open(weekend({ pendingChange: 'Modify' }));

    expect(text(page().querySelector('[role="alert"]'))).toBe(
      'This event has a request waiting for an answer. Wait for it, or withdraw it, before changing the event again.',
    );
    expect(page().querySelector('form')).toBeNull();
  });

  it('has no axe violations', async () => {
    await open(weekend());
    expect(await axeViolations(document.body, { ignoreOverlay: true })).toEqual([]);
  });
});
