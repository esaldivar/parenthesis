import { expectDateFormat } from '../../../testing/date-format';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter, withComponentInputBinding } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { routes } from '../../app.routes';
import { axeViolations } from '../../../testing/axe';
import { CHILDREN, MEMBERS, reminder } from '../../../testing/calendar-fixtures';
import { fakeAuth } from '../../../testing/fake-auth';
import { lastReminderDay } from './reminder-form';

const F = '/api/families/family-1';
const FAMILY = { id: 'family-1', name: 'Rivera Family', timeZone: 'America/Chicago', createdAt: '2026-10-01T00:00:00Z', members: MEMBERS };

describe('Add and edit a reminder', () => {
  // These tests use October 2026 dates; new dates can't be before today (#232), so "today" is October 1, 2026 here.
  beforeEach(() => vi.setSystemTime(new Date('2026-10-01T15:00:00Z')));
  afterEach(() => vi.useRealTimers());

  let http: HttpTestingController;
  let harness: RouterTestingHarness;

  async function settle() {
    for (let i = 0; i < 3; i++) {
      await harness.fixture.whenStable();
      harness.fixture.detectChanges();
    }
  }

  function configure() {
    TestBed.configureTestingModule({
      providers: [provideRouter(routes, withComponentInputBinding()), provideHttpClient(), provideHttpClientTesting(), fakeAuth()],
    });
  }

  /** The Add page on Tuesday, October 20, 2026, with Reminder chosen. */
  async function openAdd(kind?: string) {
    configure();
    harness = await RouterTestingHarness.create(`/calendar/new?date=2026-10-20${kind ? `&kind=${kind}` : ''}`);
    http = TestBed.inject(HttpTestingController);
    await vi.waitFor(() => http.expectOne(F)).then((r) => r.flush(FAMILY));
    for (const r of await vi.waitFor(() => {
      const found = http.match(`${F}/children`);
      expect(found.length).toBeGreaterThan(0);
      return found;
    })) {
      r.flush(CHILDREN);
    }
    await settle();
  }

  const text = (el: Element | null) => (el?.textContent ?? '').replace(/\s+/g, ' ').trim();
  const page = () => document.querySelector('app-add-event-page, app-reminder-edit-page') as HTMLElement;
  const form = () => document.querySelector('app-reminder-form') as HTMLElement;
  const kindCard = (label: string) =>
    [...page().querySelectorAll<HTMLButtonElement>('.kind')].find((b) => text(b.querySelector('.kind__label')) === label)!;

  function type(selector: string, value: string) {
    const input = form().querySelector<HTMLInputElement | HTMLTextAreaElement>(selector)!;
    input.value = value;
    input.dispatchEvent(new Event('input'));
    harness.fixture.detectChanges();
  }

  async function pick(control: string, option: string) {
    form().querySelector<HTMLElement>(`mat-select[formcontrolname="${control}"] .mat-mdc-select-trigger`)!.click();
    await settle();
    [...document.querySelectorAll<HTMLElement>('mat-option')].find((o) => text(o) === option)!.click();
    await settle();
  }

  async function submit() {
    form().querySelector('form')!.dispatchEvent(new Event('submit'));
    await settle();
  }

  it('describes typed dates without a visible format hint (#236)', async () => {
    await openAdd('reminder');
    expectDateFormat(form().querySelector('input[formcontrolname="date"]')!);
    await pick('repeat', 'Every week');
    await pick('ends', 'On a date');
    expectDateFormat(form().querySelector('input[formcontrolname="repeatUntil"]')!);
  });

  it('asks Event, Task or Reminder with whole cards and no selection marks', async () => {
    await openAdd();

    expect(text(page().querySelector('h1'))).toBe('Add to calendar');
    expect([...page().querySelectorAll('.kind__label')].map(text)).toEqual(['Event', 'Task', 'Reminder']);
    expect(kindCard('Event').getAttribute('aria-pressed')).toBe('true');
    expect(page().querySelectorAll('.kinds input, .kinds [role="radio"], .kinds svg.check')).toHaveLength(0);

    kindCard('Task').click();
    await settle();
    expect(kindCard('Task').getAttribute('aria-pressed')).toBe('true');
    expect(page().querySelector('app-task-form')).not.toBeNull();
  });

  function describedText(input: HTMLElement): string {
    return (input.getAttribute('aria-describedby') ?? '').split(/\s+/).filter(Boolean)
      .map((id) => text(document.getElementById(id))).join(' ');
  }

  it('focuses Time and describes its error when a timed reminder has no time (#206)', async () => {
    await openAdd('reminder');
    type('input[formcontrolname="title"]', 'Pack lunch');
    type('input[formcontrolname="time"]', '');
    await submit();

    const time = form().querySelector<HTMLInputElement>('input[formcontrolname="time"]')!;
    expect(document.activeElement).toBe(time);
    expect(describedText(time)).toContain('Choose a time for the reminder.');
    expect(http.match((r) => r.method === 'POST')).toHaveLength(0);
  });

  it('describes an unreadable date on Date and restores format guidance after correction (#206)', async () => {
    await openAdd('reminder');
    type('input[formcontrolname="title"]', 'Pack lunch');
    type('input[formcontrolname="date"]', 'next Tuesday');
    await submit();

    const date = form().querySelector<HTMLInputElement>('input[formcontrolname="date"]')!;
    expect(document.activeElement).toBe(date);
    expect(describedText(date)).toContain('Enter a date like 10/27/2026.');
    expect(http.match((r) => r.method === 'POST')).toHaveLength(0);

    type('input[formcontrolname="date"]', '2026-10-20');
    await submit();
    expectDateFormat(date);
    expect(describedText(date)).not.toContain('Enter a date like');
    expect((await vi.waitFor(() => http.expectOne((r) => r.method === 'POST'))).request.body.startsAt).toBe('2026-10-20T13:00:00.000Z');
  });

  it('associates a server startsAt refusal with Date, retaining the entered reminder (#206)', async () => {
    await openAdd('reminder');
    type('input[formcontrolname="title"]', 'Pack lunch');
    await submit();
    const create = await vi.waitFor(() => http.expectOne((r) => r.method === 'POST'));
    create.flush({ status: 400, errors: { startsAt: ['Choose a start date from today on.'] } }, { status: 400, statusText: 'Bad Request' });
    await settle();

    const date = form().querySelector<HTMLInputElement>('input[formcontrolname="date"]')!;
    expect(document.activeElement).toBe(date);
    expect(describedText(date)).toContain('Choose a start date from today on.');
    expect(form().querySelector<HTMLInputElement>('input[formcontrolname="title"]')!.value).toBe('Pack lunch');
    expect(await axeViolations(document.body, { ignoreOverlay: true })).toEqual([]);
  });

  it('shows both missing date and time, focuses Date first, and permits an all-day correction (#206)', async () => {
    await openAdd('reminder');
    type('input[formcontrolname="title"]', 'Pack lunch');
    type('input[formcontrolname="date"]', '');
    type('input[formcontrolname="time"]', '');
    await submit();
    const date = form().querySelector<HTMLInputElement>('input[formcontrolname="date"]')!;
    const time = form().querySelector<HTMLInputElement>('input[formcontrolname="time"]')!;
    expect(document.activeElement).toBe(date);
    expect(describedText(date)).toContain('Choose a date for the reminder.');
    expect(describedText(time)).toContain('Choose a time for the reminder.');

    type('input[formcontrolname="date"]', '2026-10-20');
    form().querySelector<HTMLButtonElement>('mat-slide-toggle button')!.click();
    await settle();
    await submit();
    expect(form().querySelector('input[formcontrolname="time"]')).toBeNull();
    const create = await vi.waitFor(() => http.expectOne((r) => r.method === 'POST'));
    expect(create.request.body).toEqual(expect.objectContaining({ allDay: true, startsAt: '2026-10-20T05:00:00.000Z' }));
  });

  it('focuses Repeats and describes a server repeat refusal on its selector (#206)', async () => {
    await openAdd('reminder');
    type('input[formcontrolname="title"]', 'Library day');
    await pick('repeat', 'Every week');
    await submit();
    const create = await vi.waitFor(() => http.expectOne((r) => r.method === 'POST'));
    create.flush({ status: 400, errors: { repeat: ['Choose a supported repeat.'] } }, { status: 400, statusText: 'Bad Request' });
    await settle();
    const repeat = form().querySelector<HTMLElement>('mat-select[formcontrolname="repeat"]')!;
    expect(document.activeElement).toBe(repeat);
    expect(describedText(repeat)).toContain('Choose a supported repeat.');
  });

  it('adds a one-off reminder at once, in the family’s time zone, with no location', async () => {
    await openAdd();
    kindCard('Reminder').click();
    await settle();

    expect(form().querySelector('input[formcontrolname="location"]')).toBeNull();
    expect(text(form())).toContain('It goes on the calendar at once, with no approval.');
    type('input[formcontrolname="title"]', 'Spirit Day');
    type('textarea[formcontrolname="details"]', 'Wear a blue shirt');
    await submit();

    const create = await vi.waitFor(() => http.expectOne((r) => r.method === 'POST' && r.url === `${F}/calendar/reminders`));
    expect(create.request.body).toEqual({
      title: 'Spirit Day',
      startsAt: '2026-10-20T13:00:00.000Z',
      allDay: false,
      childId: null,
      details: 'Wear a blue shirt',
      repeat: 'None',
      repeatCount: undefined,
      repeatUntil: undefined,
    });
    create.flush(reminder());
    await vi.waitFor(() => expect(TestBed.inject(Router).url).toBe('/calendar?date=2026-10-20'));
  });

  it('repeats with an end, and checks the end before sending', async () => {
    await openAdd('reminder');
    type('input[formcontrolname="title"]', 'Library day');
    await pick('repeat', 'Every week');
    type('input[formcontrolname="repeatCount"]', '1');
    await submit();

    expect(text(form())).toContain('Repeat it 2 to 366 times.');
    expect(http.match((r) => r.method === 'POST')).toHaveLength(0);

    type('input[formcontrolname="repeatCount"]', '3');
    await pick('childId', 'Kai');
    await submit();
    const create = await vi.waitFor(() => http.expectOne((r) => r.method === 'POST'));
    expect(create.request.body).toEqual(expect.objectContaining({ repeat: 'Weekly', repeatCount: 3, repeatUntil: undefined, childId: 'kai' }));
  });

  it('lets a reminder repeat up to 2 years, counting February 29 as the server does', () => {
    expect(lastReminderDay('2026-10-20')).toBe('2028-10-20');
    expect(lastReminderDay('2028-02-29')).toBe('2030-02-28');
  });

  it('ends a repeat on a date when chosen', async () => {
    await openAdd('reminder');
    type('input[formcontrolname="title"]', 'Practice spelling');
    await pick('repeat', 'Every day');
    await pick('ends', 'On a date');
    type('input[formcontrolname="repeatUntil"]', '2026-10-20');
    await submit();
    expect(text(form())).toContain('Choose an end date after the first day and within 2 years.');

    // The server's limit is 2 years from the first day (October 20, 2026).
    type('input[formcontrolname="repeatUntil"]', '2028-10-21');
    await submit();
    expect(text(form())).toContain('Choose an end date after the first day and within 2 years.');

    type('input[formcontrolname="repeatUntil"]', 'next fall');
    await submit();
    expect(text(form())).toContain('Enter a date like 10/27/2026.');
    expect(http.match((r) => r.method === 'POST')).toHaveLength(0);

    type('input[formcontrolname="repeatUntil"]', '2026-10-23');
    await submit();
    const create = await vi.waitFor(() => http.expectOne((r) => r.method === 'POST'));
    expect(create.request.body).toEqual(expect.objectContaining({ repeat: 'Daily', repeatUntil: '2026-10-23', repeatCount: undefined }));
  });

  it('edits the whole series, prefilled, with no approval', async () => {
    configure();
    harness = await RouterTestingHarness.create('/calendar/reminders/r1/edit');
    http = TestBed.inject(HttpTestingController);
    await vi.waitFor(() => http.expectOne(`${F}/calendar/reminders/r1`)).then((r) =>
      r.flush(reminder({ repeat: 'Weekly', repeatCount: 3 })),
    );
    await settle();
    await vi.waitFor(() => http.expectOne(`${F}/children`)).then((r) => r.flush(CHILDREN));
    await settle();

    expect(text(page().querySelector('h1'))).toBe('Edit reminder');
    expect(form().querySelector<HTMLInputElement>('input[formcontrolname="title"]')!.value).toBe('Spirit Day');
    expect(form().querySelector<HTMLInputElement>('input[formcontrolname="time"]')!.value).toBe('08:00');
    expect(text(form())).toContain('Changes apply to every repeat.');
    type('input[formcontrolname="title"]', 'Spirit Day: blue');
    await submit();

    const save = await vi.waitFor(() => http.expectOne((r) => r.method === 'PUT' && r.url === `${F}/calendar/reminders/r1`));
    expect(save.request.body).toEqual(
      expect.objectContaining({ title: 'Spirit Day: blue', startsAt: '2026-10-20T13:00:00.000Z', repeat: 'Weekly', repeatCount: 3, childId: 'kai' }),
    );
    save.flush(reminder({ title: 'Spirit Day: blue' }));
    await vi.waitFor(() => expect(TestBed.inject(Router).url).toBe('/calendar?date=2026-10-20'));
  });

  it('has no axe violations', async () => {
    await openAdd('reminder');
    await pick('repeat', 'Every week');
    expect(await axeViolations(document.body, { ignoreOverlay: true })).toEqual([]);
  });
});
