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
    const field = (name: string) => page().querySelector<HTMLInputElement>(`input[formcontrolname="${name}"], input[name="${name}"]`)!.value;

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
    // Always your own parenting time (#246): no choice of parent.
    expect(page().querySelector('[formcontrolname="caregiver"]')).toBeNull();
    expect(text(page())).not.toContain('Who has the children?');
    expect(text(page())).toContain('This is your parenting time.');

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
    const value = (name: string) => page().querySelector<HTMLInputElement>(`input[formcontrolname="${name}"], input[name="${name}"]`)!.value;

    it('starts on today when the day asked for has passed', async () => {
      const harness = await open(CHILDREN, '/calendar/new?date=2026-10-12&time=09:00');
      await choose(harness, 'Activity');
      expect([value('startDate'), value('endDate'), value('startTime')]).toEqual(['10/15/2026', '10/15/2026', '09:00']);
    });

    /** A date field's input: red, invalid and its reason in its name, or none of these (#248). */
    const dateField = (name: 'startDate' | 'endDate') => page().querySelector<HTMLInputElement>(`input[formcontrolname="${name}"], input[name="${name}"]`)!;
    const invalid = (name: 'startDate' | 'endDate') => {
      const input = dateField(name);
      return input.classList.contains('date-invalid') && input.getAttribute('aria-invalid') === 'true';
    };
    /** What a screen reader hears about a date field besides its name: its reason when invalid (#248). */
    const reasonOf = (name: 'startDate' | 'endDate') =>
      (dateField(name).getAttribute('aria-describedby') ?? '')
        .split(' ')
        .map((id) => text(document.getElementById(id)))
        .join(' ')
        .trim();
    /** The open calendar's day button for a day ("December 14, 2026"). */
    const day = (label: string) =>
      [...document.querySelectorAll<HTMLElement>('.mat-calendar-body-cell')].find((c) => c.getAttribute('aria-label')?.includes(label));
    /** Taps a date field anywhere, as a parent does, to open its calendar (#249). */
    async function tapDate(harness: RouterTestingHarness, name: 'startDate' | 'endDate') {
      dateField(name).closest('mat-form-field')!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await settle(harness);
    }

    it('refuses a typed start before today: red, with the reason for screen readers only, and sends nothing (#248)', async () => {
      const harness = await open(CHILDREN, '/calendar/new?date=2026-10-20');
      await choose(harness, 'Activity');
      type(harness, 'input[formcontrolname="title"]', 'Soccer practice');
      type(harness, 'input[name="startDate"]', '10/14/2026');
      type(harness, 'input[name="endDate"]', '10/14/2026');
      await settle(harness);
      expect(invalid('startDate')).toBe(true);
      expect(reasonOf('startDate')).toBe('Choose a start date from today on.');
      await submit(harness);

      // No warning text on screen (only for screen readers): the date itself is red.
      const onScreen = page().cloneNode(true) as HTMLElement;
      onScreen.querySelectorAll('.visually-hidden').forEach((e) => e.remove());
      expect(text(onScreen)).not.toContain('Choose a start date from today on.');
      expect(document.activeElement).toBe(dateField('startDate'));
      expect(http.match((r) => r.method === 'POST')).toHaveLength(0);
    });

    it('shows Start and End as separate display-only fields, each opening only its own calendar (#249)', async () => {
      const harness = await open(CHILDREN, '/calendar/new?date=2026-10-20');
      await choose(harness, 'Activity');
      for (const name of ['startDate', 'endDate'] as const) {
        // No typing and no phone keyboard: the calendar is the only way to choose.
        expect(dateField(name).readOnly).toBe(true);
        expect(dateField(name).getAttribute('inputmode')).toBe('none');
      }
      expect(text(dateField('startDate').closest('mat-form-field'))).toContain('Start date');
      expect(text(dateField('endDate').closest('mat-form-field'))).toContain('End date');
      // The calendar icon is decoration: no button, hidden from screen readers.
      expect(page().querySelector('.dates button')).toBeNull();
      expect(page().querySelector('.dates app-icon')!.getAttribute('aria-hidden')).toBe('true');

      // Tapping End opens its calendar; choosing a day changes End alone and closes it, opening nothing else.
      await tapDate(harness, 'endDate');
      expect(document.querySelectorAll('mat-calendar')).toHaveLength(1);
      day('October 23, 2026')!.click();
      await settle(harness);
      await vi.waitFor(() => expect(document.querySelector('mat-calendar')).toBeNull());
      expect([value('startDate'), value('endDate')]).toEqual(['10/20/2026', '10/23/2026']);

      // Start the same way, from the keyboard.
      dateField('startDate').focus();
      dateField('startDate').dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
      await settle(harness);
      day('October 21, 2026')!.click();
      await settle(harness);
      await vi.waitFor(() => expect(document.querySelector('mat-calendar')).toBeNull());
      expect([value('startDate'), value('endDate')]).toEqual(['10/21/2026', '10/23/2026']);
      await vi.waitFor(() => expect(document.activeElement).toBe(dateField('startDate')));

      // Closing without choosing keeps both.
      await tapDate(harness, 'startDate');
      document.querySelector('mat-calendar')!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      await settle(harness);
      expect([value('startDate'), value('endDate')]).toEqual(['10/21/2026', '10/23/2026']);
      expect(http.match((r) => r.method === 'POST')).toHaveLength(0);
    });

    it('never moves the other date: a start after the end is red and blocks sending until corrected (#248)', async () => {
      const harness = await open(CHILDREN, '/calendar/new?date=2026-10-20');
      await choose(harness, 'Parenting time');
      check('Kai');
      type(harness, 'input[name="endDate"]', '10/22/2026');
      type(harness, 'input[name="startDate"]', '10/25/2026');
      await settle(harness);

      expect([value('startDate'), value('endDate')]).toEqual(['10/25/2026', '10/22/2026']);
      expect(invalid('endDate')).toBe(true);
      expect(invalid('startDate')).toBe(false);
      await submit(harness);
      expect(http.match((r) => r.method === 'POST')).toHaveLength(0);
      expect(document.activeElement).toBe(dateField('endDate'));

      // Correcting it clears the red, keeps the children chosen, and lets it send.
      type(harness, 'input[name="endDate"]', '10/27/2026');
      await settle(harness);
      expect(invalid('endDate')).toBe(false);
      await submit(harness);
      const create = await vi.waitFor(() => http.expectOne((r) => r.method === 'POST'));
      expect(create.request.body.childIds).toEqual(['kai']);
    });

    it('keeps an unfinished range correctable: a start with no end, then an earlier start (#248)', async () => {
      const harness = await open(CHILDREN, '/calendar/new?date=2026-10-20');
      await choose(harness, 'Parenting time');
      type(harness, 'input[formcontrolname="title"]', 'Long weekend');
      type(harness, 'input[name="startDate"]', '12/20/2026');
      type(harness, 'input[name="endDate"]', '');
      await settle(harness);
      // Half done isn't marked yet; sending marks the missing end.
      expect(invalid('endDate')).toBe(false);
      await submit(harness);
      expect(invalid('endDate')).toBe(true);
      expect(http.match((r) => r.method === 'POST')).toHaveLength(0);

      // Reopened, Start's calendar still offers days before December 20: choose December 14, then End December 20.
      await tapDate(harness, 'startDate');
      expect(day('December 14, 2026')!.getAttribute('aria-disabled')).not.toBe('true');
      day('December 14, 2026')!.click();
      await settle(harness);
      await vi.waitFor(() => expect(document.querySelector('mat-calendar')).toBeNull());
      await tapDate(harness, 'endDate');
      day('December 20, 2026')!.click();
      await settle(harness);
      expect([value('startDate'), value('endDate')]).toEqual(['12/14/2026', '12/20/2026']);
      expect(invalid('startDate') || invalid('endDate')).toBe(false);
      expect(value('title')).toBe('Long weekend');
    });

    it('greys out days before today in each calendar', async () => {
      const harness = await open(CHILDREN, '/calendar/new?date=2026-10-20');
      await choose(harness, 'Activity');
      await tapDate(harness, 'startDate');

      const cell = (label: string) =>
        [...document.querySelectorAll<HTMLElement>('.mat-calendar-body-cell')].find((c) => c.getAttribute('aria-label')?.includes(label))!;
      expect(cell('October 14, 2026').getAttribute('aria-disabled')).toBe('true');
      expect(cell('October 15, 2026').getAttribute('aria-disabled')).not.toBe('true');
      expect(cell('October 20, 2026').getAttribute('aria-disabled')).not.toBe('true');
    });
  });
});
