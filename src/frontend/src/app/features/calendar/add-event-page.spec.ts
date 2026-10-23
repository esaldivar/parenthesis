import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter, withComponentInputBinding } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { routes } from '../../app.routes';
import { axeViolations } from '../../../testing/axe';
import { CHILDREN, MEMBERS, event } from '../../../testing/calendar-fixtures';
import { fakeAuth } from '../../../testing/fake-auth';

const F = '/api/families/family-1';
const FAMILY = { id: 'family-1', name: 'Rivera Family', timeZone: 'America/Chicago', createdAt: '2026-10-01T00:00:00Z', members: MEMBERS };

describe('Add event', () => {
  // These tests use October 2026 dates; new dates can't be before today (#232), so "today" is October 1, 2026 here.
  beforeEach(() => vi.setSystemTime(new Date('2026-10-01T15:00:00Z')));
  afterEach(() => vi.useRealTimers());

  let http: HttpTestingController;

  async function settle(harness: RouterTestingHarness) {
    for (let i = 0; i < 3; i++) {
      await harness.fixture.whenStable();
      harness.fixture.detectChanges();
    }
  }

  async function open(children = CHILDREN, url = '/calendar/new?date=2026-10-20') {
    TestBed.configureTestingModule({
      providers: [provideRouter(routes, withComponentInputBinding()), provideHttpClient(), provideHttpClientTesting(), fakeAuth()],
    });
    const harness = await RouterTestingHarness.create(url);
    http = TestBed.inject(HttpTestingController);
    await vi.waitFor(() => http.expectOne(F)).then((r) => r.flush(FAMILY));
    await vi.waitFor(() => http.expectOne(`${F}/children`)).then((r) => r.flush(children));
    await settle(harness);
    return harness;
  }

  const page = () => document.querySelector('app-add-event-page') as HTMLElement;
  const text = (el: Element | null) => (el?.textContent ?? '').replace(/\s+/g, ' ').trim();
  const card = (label: string) =>
    [...page().querySelectorAll<HTMLButtonElement>('.type')].find((b) => text(b.querySelector('.type__label')) === label)!;

  async function choose(harness: RouterTestingHarness, label: string) {
    card(label).click();
    await settle(harness);
  }

  function type(harness: RouterTestingHarness, selector: string, value: string) {
    const input = page().querySelector<HTMLInputElement | HTMLTextAreaElement>(selector)!;
    input.value = value;
    input.dispatchEvent(new Event('input'));
    harness.fixture.detectChanges();
  }

  function check(label: string) {
    const box = [...page().querySelectorAll<HTMLLabelElement>('.kid')].find((l) => text(l) === label)!.querySelector('input')!;
    box.click();
  }

  async function submit(harness: RouterTestingHarness) {
    page().querySelector('form')!.dispatchEvent(new Event('submit'));
    await settle(harness);
  }

  it('never seems to do nothing: a refused save brings the problem into view and focuses its field', async () => {
    const harness = await open();
    await choose(harness, 'Parenting time');
    await submit(harness);

    expect(http.match((r) => r.method === 'POST')).toHaveLength(0);
    const kids = page().querySelector('fieldset.kids')!;
    expect(text(kids)).toContain('Choose which children this parenting time is for.');
    // The keyboard (and the screen) moves to the children's first checkbox.
    await vi.waitFor(() => expect(kids.contains(document.activeElement)).toBe(true));
  });

  it('shows a server error that isn’t about one field and focuses it', async () => {
    const harness = await open();
    await choose(harness, 'Parenting time');
    check('Kai');
    await submit(harness);

    (await vi.waitFor(() => http.expectOne((r) => r.method === 'POST'))).flush(
      { title: 'Something went wrong' },
      { status: 500, statusText: 'Server Error' },
    );
    await settle(harness);
    const alert = page().querySelector('form .alert') as HTMLElement;
    expect(alert).not.toBeNull();
    await vi.waitFor(() => expect(document.activeElement).toBe(alert));
  });

  it('focuses this attempt’s problem, not an error left from the last one', async () => {
    const harness = await open();
    await choose(harness, 'Parenting time');
    check('Kai');
    await submit(harness);
    (await vi.waitFor(() => http.expectOne((r) => r.method === 'POST'))).flush(
      { title: 'Something went wrong' },
      { status: 500, statusText: 'Server Error' },
    );
    await settle(harness);
    expect(page().querySelector('form .alert')).not.toBeNull();

    check('Kai'); // Now no child: a new problem.
    await submit(harness);

    expect(page().querySelector('form .alert')).toBeNull();
    const kids = page().querySelector('fieldset.kids')!;
    await vi.waitFor(() => expect(kids.contains(document.activeElement)).toBe(true));
  });

  it('says the parent with the children is unavailable then, at the time, when the server refuses it (#210)', async () => {
    const harness = await open();
    await choose(harness, 'Parenting time');
    check('Kai');
    await submit(harness);

    (await vi.waitFor(() => http.expectOne((r) => r.method === 'POST'))).flush(
      { status: 400, errors: { caregiverUnavailable: ['The parent with the children is unavailable then.'] } },
      { status: 400, statusText: 'Bad Request' },
    );
    await settle(harness);

    expect(text(page())).toContain('You marked yourself unavailable then. Choose another time, or change your unavailable time first.');
    expect(text(page())).not.toContain('The parent with the children is unavailable then.');
  });

  it('says you have parenting time then when your unavailable time is refused (#210)', async () => {
    const harness = await open();
    await choose(harness, 'I’m unavailable');
    await submit(harness);

    (await vi.waitFor(() => http.expectOne((r) => r.method === 'POST'))).flush(
      { status: 400, errors: { overlapsYourParentingTime: ['You have parenting time then.'] } },
      { status: 400, statusText: 'Bad Request' },
    );
    await settle(harness);

    expect(text(page())).toContain('You have parenting time then. Choose another time, or change that parenting time first.');
  });

  it('says why parenting time has no children to choose yet, instead of failing quietly', async () => {
    const waiting = CHILDREN.map((c) => ({ ...c, status: 'PendingApproval' as const }));
    const harness = await open(waiting);
    await choose(harness, 'Parenting time');

    expect(text(page().querySelector('fieldset.kids'))).toContain('Your children are waiting for Sam’s approval.');
    await submit(harness);
    expect(text(page().querySelector('fieldset.kids'))).toContain('Choose which children this parenting time is for.');
    expect(http.match((r) => r.method === 'POST')).toHaveLength(0);
  });

  describe('starting from a tapped time slot (#212)', () => {
    const field = (name: string) => page().querySelector<HTMLInputElement>(`input[formcontrolname="${name}"]`)!.value;

    it('starts at the half-hour tapped, for an hour, and keeps that time for every type', async () => {
      const harness = await open(CHILDREN, '/calendar/new?date=2026-10-21&time=17:00');
      await choose(harness, 'Activity');
      expect([field('startDate'), field('startTime'), field('endDate'), field('endTime')]).toEqual(['10/21/2026', '17:00', '10/21/2026', '18:00']);

      // Unavailable time is usually all day, but a tapped slot keeps its time; it all stays editable.
      await choose(harness, 'I’m unavailable');
      expect(field('startTime')).toBe('17:00');
      expect(http.match((r) => r.method === 'POST')).toHaveLength(0);
    });

    it('ends the next day when the half-hour tapped is late in the evening', async () => {
      const harness = await open(CHILDREN, '/calendar/new?date=2026-10-21&time=23:30');
      await choose(harness, 'Activity');
      expect([field('endDate'), field('endTime')]).toEqual(['10/22/2026', '00:30']);
    });

    it('gives a reminder the date and time, and a task its due date', async () => {
      const harness = await open(CHILDREN, '/calendar/new?date=2026-10-21&time=08:30');
      [...page().querySelectorAll<HTMLButtonElement>('.kind')].find((b) => text(b).startsWith('Reminder'))!.click();
      await settle(harness);
      expect([field('date'), field('time')]).toEqual(['10/21/2026', '08:30']);

      [...page().querySelectorAll<HTMLButtonElement>('.kind')].find((b) => text(b).startsWith('Task'))!.click();
      await settle(harness);
      expect(page().querySelector<HTMLInputElement>('app-task-form input[formcontrolname="dueDate"]')!.value).toBe('10/21/2026');
    });

    it('ignores a time that isn’t one', async () => {
      const harness = await open(CHILDREN, '/calendar/new?date=2026-10-21&time=25:99');
      await choose(harness, 'Activity');
      expect(field('startTime')).toBe('09:00');
    });
  });

  it('offers the four types as whole cards, highlighted when chosen, with no radio buttons or checkmarks', async () => {
    const harness = await open();

    expect([...page().querySelectorAll('.type__label')].map(text)).toEqual(['Activity', 'Parenting time', 'Family event', 'I’m unavailable']);
    expect(page().querySelectorAll('.types input, .types [role="radio"], .types svg.check')).toHaveLength(0);
    await choose(harness, 'Family event');
    expect(card('Family event').getAttribute('aria-pressed')).toBe('true');
    expect(card('Activity').getAttribute('aria-pressed')).toBe('false');
  });

  it('sends a family event for approval with both parents fixed and children optional', async () => {
    const harness = await open();
    await choose(harness, 'Family event');

    expect(text(page().querySelector('.note'))).toContain('Both parents attend. Sam needs to accept');
    expect(text(page().querySelector('button[type="submit"]'))).toBe('Send for approval');
    type(harness, 'input[formcontrolname="title"]', 'School play');
    await submit(harness);

    const create = await vi.waitFor(() => http.expectOne((r) => r.method === 'POST' && r.url === `${F}/calendar/events`));
    expect(create.request.body).toEqual(
      expect.objectContaining({
        category: 'Joint',
        title: 'School play',
        allDay: false,
        startsAt: '2026-10-20T14:00:00.000Z',
        endsAt: '2026-10-20T15:00:00.000Z',
        childIds: [],
      }),
    );
    create.flush(event({ title: 'School play', category: 'Joint', status: 'PendingApproval' }));
    await vi.waitFor(() => expect(TestBed.inject(Router).url).toBe('/calendar?date=2026-10-20'));
  });

  it('needs the children for parenting time, and fills in the title', async () => {
    const harness = await open();
    await choose(harness, 'Parenting time');

    await submit(harness);
    expect(text(page())).toContain('Choose which children this parenting time is for.');
    expect(http.match((r) => r.method === 'POST')).toHaveLength(0);

    check('Kai');
    await submit(harness);
    const create = await vi.waitFor(() => http.expectOne((r) => r.method === 'POST'));
    expect(create.request.body).toEqual(
      expect.objectContaining({
        category: 'ParentingTime',
        title: 'Time with Alex',
        allDay: true,
        caregiverMembershipId: 'm-alex',
        childIds: ['kai'],
        startsAt: '2026-10-20T05:00:00.000Z',
        endsAt: '2026-10-21T05:00:00.000Z',
      }),
    );
  });

  it('keeps unavailable time about you: no title, children or location, and the note is private', async () => {
    const harness = await open();
    await choose(harness, 'I’m unavailable');

    expect(page().querySelector('input[formcontrolname="title"]')).toBeNull();
    expect(page().querySelector('input[formcontrolname="location"]')).toBeNull();
    expect(page().querySelector('.kid')).toBeNull();
    expect(text(page())).toContain('Only you can see this.');
    type(harness, 'textarea[formcontrolname="notes"]', 'Dentist');
    await submit(harness);

    const create = await vi.waitFor(() => http.expectOne((r) => r.method === 'POST'));
    expect(create.request.body).toEqual(
      expect.objectContaining({ category: 'Unavailable', title: undefined, childIds: [], allDay: true, notes: 'Dentist' }),
    );
  });

  it('has no axe violations', async () => {
    const harness = await open();
    await choose(harness, 'Activity');
    expect(await axeViolations(document.body)).toEqual([]);
  });

  describe('date ranges (#232)', () => {
    // Thursday, October 15, 2026, 10:00 AM in Chicago.
    beforeEach(() => vi.setSystemTime(new Date('2026-10-15T15:00:00Z')));
    const value = (name: string) => page().querySelector<HTMLInputElement>(`input[formcontrolname="${name}"]`)!.value;

    it('starts on today when the day asked for has passed', async () => {
      const harness = await open(CHILDREN, '/calendar/new?date=2026-10-12&time=09:00');
      await choose(harness, 'Activity');
      expect([value('startDate'), value('endDate'), value('startTime')]).toEqual(['10/15/2026', '10/15/2026', '09:00']);
    });

    it('refuses a typed start before today, saying why, and sends nothing', async () => {
      const harness = await open(CHILDREN, '/calendar/new?date=2026-10-20');
      await choose(harness, 'Activity');
      type(harness, 'input[formcontrolname="title"]', 'Soccer practice');
      type(harness, 'input[formcontrolname="startDate"]', '10/14/2026');
      type(harness, 'input[formcontrolname="endDate"]', '10/14/2026');
      await submit(harness);

      expect(text(page())).toContain('Choose a start date from today on.');
      expect(http.match((r) => r.method === 'POST')).toHaveLength(0);
    });

    it('says how to write a date when the typed start can’t be read', async () => {
      const harness = await open(CHILDREN, '/calendar/new?date=2026-10-20');
      await choose(harness, 'Activity');
      type(harness, 'input[formcontrolname="title"]', 'Soccer practice');
      type(harness, 'input[formcontrolname="startDate"]', 'next week');
      await submit(harness);

      expect(text(page())).toContain('Enter a date like 10/27/2026.');
      expect(http.match((r) => r.method === 'POST')).toHaveLength(0);
    });

    it('moves the end with the start, keeping the length, so the range is never backwards', async () => {
      const harness = await open(CHILDREN, '/calendar/new?date=2026-10-20');
      await choose(harness, 'Parenting time');
      type(harness, 'input[formcontrolname="endDate"]', '10/22/2026');
      type(harness, 'input[formcontrolname="startDate"]', '10/25/2026');
      await settle(harness);

      expect([value('startDate'), value('endDate')]).toEqual(['10/25/2026', '10/27/2026']);
    });

    it('keeps the date format for screen readers only, not on screen (#236)', async () => {
      await open(CHILDREN, '/calendar/new?date=2026-10-20').then((harness) => choose(harness, 'Activity'));
      const hint = page().querySelector<HTMLElement>('.dates mat-hint')!;
      expect(hint.classList).toContain('visually-hidden');
      expect(text(hint)).toBe('Dates as MM/DD/YYYY');
      const described = [...page().querySelectorAll('.dates [aria-describedby]')].map((e) => e.getAttribute('aria-describedby'));
      expect(described.some((ids) => ids?.split(' ').includes(hint.id))).toBe(true);
    });

    it('greys out days before today in the range calendar', async () => {
      const harness = await open(CHILDREN, '/calendar/new?date=2026-10-20');
      await choose(harness, 'Activity');
      page().querySelector<HTMLButtonElement>('mat-datepicker-toggle button')!.click();
      await settle(harness);

      const cell = (label: string) =>
        [...document.querySelectorAll<HTMLElement>('.mat-calendar-body-cell')].find((c) => c.getAttribute('aria-label')?.includes(label))!;
      expect(cell('October 14, 2026').getAttribute('aria-disabled')).toBe('true');
      expect(cell('October 15, 2026').getAttribute('aria-disabled')).not.toBe('true');
      expect(cell('October 20, 2026').getAttribute('aria-disabled')).not.toBe('true');
    });
  });
});
