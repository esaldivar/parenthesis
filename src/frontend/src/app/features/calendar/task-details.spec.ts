import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter, withComponentInputBinding } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { routes } from '../../app.routes';
import { SharedTask } from '../../core/api/api';
import { axeViolations } from '../../../testing/axe';
import { CHILDREN, MEMBERS, checklistItem, task } from '../../../testing/calendar-fixtures';
import { fakeAuth } from '../../../testing/fake-auth';
import { toastText } from '../../../testing/toasts';

const F = '/api/families/family-1';
const FAMILY = { id: 'family-1', name: 'Rivera Family', timeZone: 'America/Chicago', createdAt: '2026-10-01T00:00:00Z', members: MEMBERS };

/** A checklist: board ticked by Sam on Oct 20 at 3:15 PM (Chicago), glue to do, markers optional. */
const withChecklist = (over: Partial<SharedTask> = {}) =>
  task({
    items: [
      checklistItem({ id: 'board', text: 'Poster board', completedBy: 'm-sam', completedAt: '2026-10-20T20:15:00Z' }),
      checklistItem({ id: 'glue', text: 'Glue sticks' }),
      checklistItem({ id: 'markers', text: 'Extra markers', required: false }),
    ],
    progressDone: 1,
    progressTotal: 2,
    ...over,
  });

describe('tasks on the calendar', () => {
  let http: HttpTestingController;
  let harness: RouterTestingHarness;

  async function settle() {
    for (let i = 0; i < 3; i++) {
      await harness.fixture.whenStable();
      harness.fixture.detectChanges();
    }
  }

  /** Answers the latest calendar load: no events or reminders, these tasks. */
  async function answerLoad(tasks: SharedTask[]) {
    const tasksRequest = await vi.waitFor(() => {
      const found = http.match((r) => r.url === `${F}/calendar/tasks`);
      expect(found.length).toBeGreaterThan(0);
      return found[found.length - 1];
    });
    for (const r of http.match((r) => r.url === `${F}/calendar/events` || r.url === `${F}/calendar/reminders`)) r.flush([]);
    for (const r of http.match(F)) r.flush(FAMILY);
    for (const r of http.match(`${F}/children`)) r.flush(CHILDREN);
    tasksRequest.flush(tasks);
    await settle();
    return tasksRequest;
  }

  async function open(tasks: SharedTask[], url = '/calendar?date=2026-10-20') {
    TestBed.configureTestingModule({
      providers: [provideRouter(routes, withComponentInputBinding()), provideHttpClient(), provideHttpClientTesting(), fakeAuth()],
    });
    harness = await RouterTestingHarness.create(url);
    http = TestBed.inject(HttpTestingController);
    return answerLoad(tasks);
  }

  const text = (el: Element | null) => (el?.textContent ?? '').replace(/\s+/g, ' ').trim();
  const main = () => document.querySelector('app-calendar-page') as HTMLElement;
  const dialog = () => document.querySelector('app-task-details [role="dialog"]') as HTMLElement;
  const button = (label: string, within: Element) =>
    [...within.querySelectorAll<HTMLElement>('button, a')].find((b) => text(b) === label)!;
  const checkbox = (label: string) =>
    [...dialog().querySelectorAll('label')].find((l) => text(l).startsWith(label))!.querySelector('input') as HTMLInputElement;

  async function openDetails() {
    (main().querySelector('app-calendar-week .agenda button.item[data-kind="task"]') as HTMLElement).click();
    await settle();
    (await vi.waitFor(() => http.expectOne((r) => r.method === 'POST' && r.url === `${F}/calendar/tasks/t1/seen`))).flush(null);
    await settle();
  }

  afterEach(() => vi.unstubAllGlobals());

  it('asks for tasks by due date and shows them with their own label, done in words, filtered by child', async () => {
    const request = await open([task(), task({ id: 't2', title: 'Return library books', childId: null, completedBy: 'm-sam', completedAt: '2026-10-21T15:00:00Z' })]);

    expect(request.request.params.get('from')).toBe('2026-10-18');
    expect(request.request.params.get('to')).toBe('2026-10-25');
    const items = [...main().querySelectorAll<HTMLElement>('app-calendar-week .agenda button.item[data-kind="task"]')];
    // Both are due Thursday, so they sort by title.
    expect(items.map((i) => text(i.querySelector('.title')))).toEqual(['Return library books', 'Science fair poster']);
    expect(text(items[0])).toContain('Return library books, Task, Due, Done');
    expect(text(items[1])).toContain('Science fair poster, Task, Due, Kai');
    expect(text(main().querySelector('.key'))).toContain('Task');
    // Opening the calendar never marks anything seen.
    expect(http.match((r) => r.url.endsWith('/seen'))).toHaveLength(0);

    (button('Aurora', main().querySelector('.filters')!) as HTMLElement).click();
    await settle();
    await answerLoad([task(), task({ id: 't2', title: 'Return library books', childId: null })]).catch(() => null);
    await settle();
    expect([...main().querySelectorAll('app-calendar-week .agenda button.item[data-kind="task"] .title')].map(text)).toEqual([
      'Return library books',
    ]);
  });

  it('shows the details, the checklist with quiet attribution and progress, and marks Seen only on opening', async () => {
    await open([withChecklist({ editedBy: 'm-sam', seenBy: [{ membershipId: 'm-sam', seenAt: '2026-10-21T00:00:00Z' }] })]);
    await openDetails();

    expect(text(dialog().querySelector('h2'))).toBe('Science fair poster');
    expect(text(dialog())).toContain('DueThursday, October 22');
    expect(text(dialog())).toContain('AboutKai');
    expect(text(dialog())).toContain('DetailsGlue and markers');
    expect(text(dialog())).toContain('Added by Sam Edited by Sam Seen by Sam');
    expect(text(dialog().querySelector('.checklist h3'))).toBe('Checklist');
    expect(text(dialog().querySelector('#task-progress'))).toBe('1 of 2 required done');
    expect(dialog().querySelector('progress')!.getAttribute('aria-labelledby')).toBe('task-checklist-title task-progress');
    expect(text(checkbox('Poster board').closest('label'))).toBe('Poster board Required Ticked by Sam · Oct 20, 3:15 PM');
    expect(text(checkbox('Extra markers').closest('label'))).toBe('Extra markers Optional');
    expect(checkbox('Poster board').checked).toBe(true);
    expect(button('Edit task', dialog()).getAttribute('href')).toBe('/calendar/tasks/t1/edit');
    // The checklist decides: no Mark done, assignee, attachments or scores.
    expect(text(dialog())).not.toMatch(/Mark done|Assign|Attach|points|score/i);
  });

  it('celebrates only when the server says this tick completed the task, and keeps a calm done state', async () => {
    await open([withChecklist()]);
    await openDetails();
    expect(dialog().querySelector('.confetti')).toBeNull();

    checkbox('Glue sticks').click();
    const tick = await vi.waitFor(() =>
      http.expectOne((r) => r.method === 'POST' && r.url === `${F}/calendar/tasks/t1/items/glue/done`),
    );
    tick.flush(
      withChecklist({
        items: [
          checklistItem({ id: 'board', text: 'Poster board', completedBy: 'm-sam', completedAt: '2026-10-20T20:15:00Z' }),
          checklistItem({ id: 'glue', text: 'Glue sticks', completedBy: 'm-alex', completedAt: '2026-10-21T14:00:00Z' }),
          checklistItem({ id: 'markers', text: 'Extra markers', required: false }),
        ],
        progressDone: 2,
        completedBy: 'm-alex',
        completedAt: '2026-10-21T14:00:00Z',
        justCompleted: true,
      }),
    );
    await settle();

    expect(text(dialog().querySelector('[role="status"]'))).toBe('Great teamwork! This task is done.');
    const confetti = dialog().querySelector('.confetti')!;
    expect(confetti.getAttribute('aria-hidden')).toBe('true');
    expect(text(dialog().querySelector('.status'))).toBe('Done');
    expect(text(dialog())).toContain('Ticked by you · Oct 21, 9:00 AM');
    expect(text(dialog())).toContain('Done by you · Oct 21, 9:00 AM');
    // The calendar shows it done too, without closing the details.
    expect(text(main().querySelector('app-calendar-week .agenda button.item[data-kind="task"]'))).toContain('Done');
  });

  it('never celebrates on opening a task that is already done', async () => {
    await open([withChecklist({ progressDone: 2, completedBy: 'm-sam', completedAt: '2026-10-21T15:00:00Z' })]);
    await openDetails();

    expect(dialog().querySelector('.confetti')).toBeNull();
    expect(text(dialog().querySelector('[role="status"]'))).toBe('');
    expect(text(dialog().querySelector('.status'))).toBe('Done');
  });

  it('keeps the operated checkbox focusable while saving and blocks duplicate ticks (#73)', async () => {
    await open([withChecklist()]);
    await openDetails();
    const box = checkbox('Glue sticks');
    box.focus();
    box.click();
    const tick = await vi.waitFor(() => http.expectOne((r) => r.url.endsWith('/items/glue/done')));
    await settle();
    expect(box.disabled).toBe(false); // Native disabled makes Chrome drop focus to BODY.
    expect(box.getAttribute('aria-disabled')).toBe('true');
    expect(document.activeElement).toBe(box);
    box.click();
    expect(http.match((r) => r.url.endsWith('/items/glue/done'))).toHaveLength(0);
    expect(box.checked).toBe(true);

    tick.flush(withChecklist({ items: [
      checklistItem({ id: 'board', text: 'Poster board', completedBy: 'm-sam', completedAt: '2026-10-20T20:15:00Z' }),
      checklistItem({ id: 'glue', text: 'Glue sticks', completedBy: 'm-alex', completedAt: '2026-10-21T14:00:00Z' }),
      checklistItem({ id: 'markers', text: 'Extra markers', required: false }),
    ], progressDone: 2, completedBy: 'm-alex', completedAt: '2026-10-21T14:00:00Z', justCompleted: true }));
    await settle();
    expect(checkbox('Glue sticks')).toBe(box);
    expect(document.activeElement).toBe(box);
    expect(box.checked).toBe(true);
    expect(box.getAttribute('aria-disabled')).toBe('false');
  });

  it('keeps checklist focus and restores the saved checkbox value after an error (#73)', async () => {
    await open([withChecklist()]);
    await openDetails();
    const box = checkbox('Glue sticks');
    box.focus();
    box.click();
    (await vi.waitFor(() => http.expectOne((r) => r.url.endsWith('/items/glue/done')))).flush(
      { title: 'Please try again.' }, { status: 500, statusText: 'Server Error' },
    );
    await settle();
    expect(document.activeElement).toBe(box);
    expect(box.checked).toBe(false);
    expect(box.getAttribute('aria-disabled')).toBe('false');
    expect(dialog().querySelector('[role="alert"]')).not.toBeNull();
  });

  it('retains one focused completion button through saving, Done and Undo (#73)', async () => {
    await open([task()]);
    await openDetails();
    const action = button('Mark done', dialog()) as HTMLButtonElement;
    action.focus();
    action.click();
    const done = await vi.waitFor(() => http.expectOne((r) => r.method === 'POST' && r.url.endsWith('/t1/done')));
    await settle();
    expect(action.disabled).toBe(false);
    expect(action.getAttribute('aria-disabled')).toBe('true');
    action.click();
    expect(http.match((r) => r.url.endsWith('/t1/done'))).toHaveLength(0);
    done.flush(task({ completedBy: 'm-alex', completedAt: '2026-10-21T14:00:00Z' }));
    await settle();
    expect(button('Undo done', dialog())).toBe(action);
    expect(document.activeElement).toBe(action);
    action.click();
    (await vi.waitFor(() => http.expectOne((r) => r.method === 'DELETE' && r.url.endsWith('/t1/done')))).flush(task());
    await settle();
    expect(button('Mark done', dialog())).toBe(action);
    expect(document.activeElement).toBe(action);
  });

  it('with reduced motion, says the message without any animation', async () => {
    const noop = () => undefined;
    vi.stubGlobal('matchMedia', (query: string) => ({
      matches: query.includes('reduce'),
      addEventListener: noop,
      removeEventListener: noop,
      addListener: noop,
      removeListener: noop,
    }));
    await open([withChecklist()]);
    await openDetails();

    checkbox('Glue sticks').click();
    (await vi.waitFor(() => http.expectOne((r) => r.url.endsWith('/items/glue/done')))).flush(
      withChecklist({ progressDone: 2, completedBy: 'm-alex', completedAt: '2026-10-21T14:00:00Z', justCompleted: true }),
    );
    await settle();

    expect(text(dialog().querySelector('[role="status"]'))).toBe('Great teamwork! This task is done.');
    expect(dialog().querySelector('.confetti')).toBeNull();
  });

  it.each(['done', 'undo', 'checklist', 'delete'])('offers focused session recovery after a token refusal on %s without replaying it', async (action) => {
    const shown = action === 'checklist' ? withChecklist() : action === 'undo'
      ? task({ completedBy: 'm-alex', completedAt: '2026-10-21T14:00:00Z' }) : task();
    await open([shown]);
    await openDetails();
    if (action === 'checklist') {
      checkbox('Glue sticks').click();
    } else if (action === 'delete') {
      button('Delete task…', dialog()).click();
      await settle();
      button('Yes, delete', dialog()).click();
    } else {
      button(action === 'done' ? 'Mark done' : 'Undo done', dialog()).click();
    }
    (await vi.waitFor(() => http.expectOne((r) => r.method !== 'GET'))).flush(
      { title: 'Invalid or missing antiforgery token.' }, { status: 400, statusText: 'Bad Request' },
    );
    await settle();
    const error = dialog().querySelector<HTMLElement>('[role="alert"]')!;
    expect(text(error)).toContain('Reload the calendar');
    expect(text(error)).toContain('This action wasn’t saved.');
    await vi.waitFor(() => expect(document.activeElement).toBe(error));
    const reload = button('Reload calendar', dialog());
    expect(reload.tagName).toBe('A');
    expect(reload.getAttribute('href')).toBe('/calendar?date=2026-10-20');
    expect(dialog().querySelector('.confetti')).toBeNull();
    expect([...dialog().querySelectorAll('button')].some((b) => /Mark done|Undo done|Delete task|Yes, delete/.test(text(b)))).toBe(false);
    if (action === 'checklist') {
      const box = checkbox('Glue sticks');
      expect(box.checked).toBe(false);
      expect(box.getAttribute('aria-disabled')).toBe('true');
      box.click();
      await settle();
      expect(box.checked).toBe(false);
    }
    expect(http.match(() => true)).toHaveLength(0);
    expect(await axeViolations(document.body)).toEqual([]);
  });

  it('when the other parent changed it first, refreshes and says so plainly', async () => {
    await open([withChecklist()]);
    await openDetails();

    checkbox('Glue sticks').click();
    (await vi.waitFor(() => http.expectOne((r) => r.url.endsWith('/items/glue/done')))).flush(
      { title: 'The other parent just changed this task.' },
      { status: 409, statusText: 'Conflict' },
    );
    const refresh = await vi.waitFor(() => http.expectOne((r) => r.method === 'GET' && r.url === `${F}/calendar/tasks/t1`));
    refresh.flush(withChecklist({ title: 'Science fair poster and stand', version: 9 }));
    await settle();

    expect(text(dialog().querySelector('[role="status"]'))).toBe(
      'The other parent just changed this task. It’s up to date now, so check it and try again.',
    );
    expect(text(dialog().querySelector('h2'))).toBe('Science fair poster and stand');
    expect(checkbox('Glue sticks').checked).toBe(false);
    expect(dialog().querySelector('[role="alert"]')).toBeNull();
  });

  it('offers Mark done and Undo for a task without a checklist, with who did it', async () => {
    await open([task()]);
    await openDetails();
    expect(text(dialog().querySelector('.status'))).toBe('To do');

    button('Mark done', dialog()).click();
    (await vi.waitFor(() => http.expectOne((r) => r.method === 'POST' && r.url === `${F}/calendar/tasks/t1/done`))).flush(
      task({ completedBy: 'm-alex', completedAt: '2026-10-21T14:00:00Z', justCompleted: true }),
    );
    await settle();
    expect(text(dialog())).toContain('Done by you · Oct 21, 9:00 AM');
    expect(text(dialog().querySelector('[role="status"]'))).toBe('Great teamwork! This task is done.');

    button('Undo done', dialog()).click();
    (await vi.waitFor(() => http.expectOne((r) => r.method === 'DELETE' && r.url === `${F}/calendar/tasks/t1/done`))).flush(task());
    await settle();
    expect(text(dialog().querySelector('.status'))).toBe('To do');
    expect(button('Mark done', dialog())).toBeTruthy();
  });

  it('deletes a task for both parents after confirming', async () => {
    await open([task()]);
    await openDetails();

    button('Delete task…', dialog()).click();
    await settle();
    expect(text(dialog())).toContain('This deletes the task, and its checklist, for both of you.');
    button('Yes, delete', dialog()).click();
    (await vi.waitFor(() => http.expectOne((r) => r.method === 'DELETE' && r.url === `${F}/calendar/tasks/t1`))).flush(null);
    await answerLoad([]);

    expect(document.querySelector('app-task-details')).toBeNull();
    expect(toastText()).toContain('“Science fair poster” was deleted.');
  });

  it('focuses safe task confirmation and restores its initiating action on cancel (#176)', async () => {
    await open([task()]);
    await openDetails();
    button('Delete task…', dialog()).focus();
    button('Delete task…', dialog()).click();
    await settle();
    expect(document.activeElement).toBe(button('Keep it', dialog()));
    expect(button('Keep it', dialog()).getAttribute('aria-describedby')).toBe('task-delete-explanation');
    button('Keep it', dialog()).click();
    await settle();
    expect(document.activeElement).toBe(button('Delete task…', dialog()));
    expect(http.match((r) => r.method === 'DELETE')).toHaveLength(0);
  });

  it('retains task delete focus on failure and prevents duplicate deletions (#176)', async () => {
    await open([task()]);
    await openDetails();
    button('Delete task…', dialog()).click();
    await settle();
    const yes = button('Yes, delete', dialog()) as HTMLButtonElement;
    yes.focus();
    yes.click();
    const request = await vi.waitFor(() => http.expectOne((r) => r.method === 'DELETE' && r.url.endsWith('/tasks/t1')));
    await settle();
    expect(yes.disabled).toBe(false);
    expect(yes.getAttribute('aria-disabled')).toBe('true');
    yes.click();
    expect(http.match((r) => r.method === 'DELETE')).toHaveLength(0);
    request.flush({ title: 'Try again.' }, { status: 500, statusText: 'Server Error' });
    await settle();
    expect(document.activeElement).toBe(yes);
    expect(dialog().querySelector('[role="alert"]')).not.toBeNull();
    expect(await axeViolations(document.body)).toEqual([]);
  });

  it('has no axe violations with a task and its checklist open', async () => {
    await open([withChecklist()]);
    expect(await axeViolations(document.body)).toEqual([]);

    await openDetails();
    expect(await axeViolations(document.body)).toEqual([]);
  });
});
