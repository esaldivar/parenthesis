import { expectDateFormat } from '../../../testing/date-format';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter, withComponentInputBinding } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { routes } from '../../app.routes';
import { axeViolations } from '../../../testing/axe';
import { CHILDREN, MEMBERS, checklistItem, task } from '../../../testing/calendar-fixtures';
import { fakeAuth } from '../../../testing/fake-auth';

const F = '/api/families/family-1';
const FAMILY = { id: 'family-1', name: 'Rivera Family', timeZone: 'America/Chicago', createdAt: '2026-10-01T00:00:00Z', members: MEMBERS };

describe('Add and edit a task', () => {
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

  const flushChildren = async () => {
    for (const r of await vi.waitFor(() => {
      const found = http.match(`${F}/children`);
      expect(found.length).toBeGreaterThan(0);
      return found;
    })) {
      r.flush(CHILDREN);
    }
    await settle();
  };

  /** The Add page on Tuesday, October 20, 2026, with Task chosen. */
  async function openAdd() {
    configure();
    harness = await RouterTestingHarness.create('/calendar/new?date=2026-10-20&kind=task');
    http = TestBed.inject(HttpTestingController);
    await vi.waitFor(() => http.expectOne(F)).then((r) => r.flush(FAMILY));
    await flushChildren();
  }

  async function openEdit(current = task()) {
    configure();
    harness = await RouterTestingHarness.create('/calendar/tasks/t1/edit');
    http = TestBed.inject(HttpTestingController);
    (await vi.waitFor(() => http.expectOne(`${F}/calendar/tasks/t1`))).flush(current);
    await settle();
    await flushChildren();
  }

  const text = (el: Element | null) => (el?.textContent ?? '').replace(/\s+/g, ' ').trim();
  const form = () => document.querySelector('app-task-form') as HTMLElement;
  const button = (label: string) =>
    [...form().querySelectorAll<HTMLButtonElement>('button')].find((b) => text(b) === label || b.getAttribute('aria-label') === label)!;
  const itemInputs = () => [...form().querySelectorAll<HTMLInputElement>('.item input[type="text"]')];
  const itemTexts = () => itemInputs().map((i) => i.value);

  function type(input: HTMLInputElement | HTMLTextAreaElement, value: string) {
    input.value = value;
    input.dispatchEvent(new Event('input'));
    harness.fixture.detectChanges();
  }
  const field = (name: string) => form().querySelector<HTMLInputElement>(`[formcontrolname="${name}"], input[name="${name}"]`)!;

  async function addItem(value: string) {
    button('Add item').click();
    await settle();
    const inputs = itemInputs();
    expect(document.activeElement).toBe(inputs[inputs.length - 1]); // Focus moves to the new item.
    type(inputs[inputs.length - 1], value);
  }

  async function submit() {
    form().querySelector('form')!.dispatchEvent(new Event('submit'));
    await settle();
  }

  it('describes the typed due date without a visible format hint (#236)', async () => {
    await openAdd();
    expectDateFormat(field('dueDate'));
  });

  it('adds a task with a checklist that can be reordered, with required and optional items, at once', async () => {
    await openAdd();
    // Shared, with no assignee, attachments or a "complete" control.
    expect(text(form())).toContain('A shared to-do for both of you, with no assignee.');
    expect(text(form())).not.toMatch(/Assign|Attach|Mark as complete/);
    expect(field('dueDate').value).toBe('10/20/2026');

    type(field('title'), 'Prepare for soccer tournament');
    await addItem('Pack uniforms');
    await addItem('Snacks');
    await addItem('Bring cleats');
    (form().querySelectorAll<HTMLElement>('.item mat-checkbox input')[1]).click(); // Snacks: optional.
    await settle();
    button('Move Bring cleats up').click();
    await settle();
    expect(itemTexts()).toEqual(['Pack uniforms', 'Bring cleats', 'Snacks']);
    expect(document.activeElement).toBe(button('Move Bring cleats up')); // The keyboard stays on the moved item.
    expect(button('Move Pack uniforms up').disabled).toBe(true);
    expect(button('Move Snacks down').disabled).toBe(true);
    await addItem('Water');
    button('Remove Water').click();
    await settle();
    expect(itemTexts()).toEqual(['Pack uniforms', 'Bring cleats', 'Snacks']);
    await submit();

    const create = await vi.waitFor(() => http.expectOne((r) => r.method === 'POST' && r.url === `${F}/calendar/tasks`));
    expect(create.request.body).toEqual({
      title: 'Prepare for soccer tournament',
      dueDate: '2026-10-20',
      childId: null,
      details: undefined,
      items: [
        { text: 'Pack uniforms', required: true },
        { text: 'Bring cleats', required: true },
        { text: 'Snacks', required: false },
      ],
    });
    create.flush(task({ title: 'Prepare for soccer tournament', dueDate: '2026-10-20' }));
    await vi.waitFor(() => expect(TestBed.inject(Router).url).toBe('/calendar?date=2026-10-20'));
  });

  it('checks the title, due date and items before sending', async () => {
    await openAdd();
    type(field('dueDate'), '');
    await addItem(' ');
    await submit();

    expect(text(form())).toContain('Enter a title.');
    expect(text(form())).toContain('Choose the day it’s due.');
    expect(text(form())).toContain('Give each checklist item 1 to 120 characters, or remove it.');
    expect(http.match((r) => r.method === 'POST')).toHaveLength(0);
  });

  it('edits the task and its checklist, keeping ticks by id, from the version it was loaded at', async () => {
    await openEdit(
      task({
        items: [
          checklistItem({ id: 'board', text: 'Poster board', completedBy: 'm-sam', completedAt: '2026-10-20T20:15:00Z' }),
          checklistItem({ id: 'glue', text: 'Glue sticks', required: false }),
        ],
      }),
    );

    expect(text(document.querySelector('h1'))).toBe('Edit task');
    expect(field('title').value).toBe('Science fair poster');
    expect(field('dueDate').value).toBe('10/22/2026');
    expect(itemTexts()).toEqual(['Poster board', 'Glue sticks']);
    type(itemInputs()[1], 'Glue sticks and tape');
    await addItem('Markers');
    await submit();

    const save = await vi.waitFor(() => http.expectOne((r) => r.method === 'PUT' && r.url === `${F}/calendar/tasks/t1`));
    expect(save.request.body).toEqual(
      expect.objectContaining({
        title: 'Science fair poster',
        dueDate: '2026-10-22',
        childId: 'kai',
        details: 'Glue and markers',
        version: 7,
        items: [
          { id: 'board', text: 'Poster board', required: true },
          { id: 'glue', text: 'Glue sticks and tape', required: false },
          { text: 'Markers', required: true },
        ],
      }),
    );
    save.flush(task());
    await vi.waitFor(() => expect(TestBed.inject(Router).url).toBe('/calendar?date=2026-10-22'));
  });

  it('when the other parent changed it first, saves nothing and offers their latest version', async () => {
    await openEdit();
    type(field('title'), 'Science fair poster and stand');
    await submit();
    (await vi.waitFor(() => http.expectOne((r) => r.method === 'PUT'))).flush(
      { title: 'The other parent just changed this task.' },
      { status: 409, statusText: 'Conflict' },
    );
    await settle();

    expect(text(form().querySelector('[role="alert"]'))).toContain(
      'The other parent changed this task while you were editing it, so nothing was saved.',
    );
    button('Load their latest version').click();
    (await vi.waitFor(() => http.expectOne((r) => r.method === 'GET' && r.url === `${F}/calendar/tasks/t1`))).flush(
      task({ title: 'Science fair project', version: 9, items: [checklistItem({ id: 'board', text: 'Poster board' })] }),
    );
    await settle();
    expect(field('title').value).toBe('Science fair project');
    expect(itemTexts()).toEqual(['Poster board']);
    expect(form().querySelector('[role="alert"]')).toBeNull();

    await submit();
    const retry = await vi.waitFor(() => http.expectOne((r) => r.method === 'PUT'));
    expect(retry.request.body.version).toBe(9);
  });

  it('has no axe violations with a checklist', async () => {
    await openAdd();
    await addItem('Pack uniforms');
    await addItem('Snacks');
    expect(await axeViolations(document.body, { ignoreOverlay: true })).toEqual([]);
  });

  it('refuses a typed due date before today (#232)', async () => {
    vi.setSystemTime(new Date('2026-10-23T15:00:00Z')); // Friday, October 23 in Chicago.
    await openAdd();
    type(field('title'), 'Sign the field trip form');
    type(field('dueDate'), '10/21/2026');
    await submit();
    expect(text(form())).toContain('Choose a date from today on.');
    expect(http.match((r) => r.method === 'POST')).toHaveLength(0);
  });
});
