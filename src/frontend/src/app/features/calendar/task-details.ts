import { CalendarPalette } from './calendar-palette';
import { A11yModule } from '@angular/cdk/a11y';
import { DOCUMENT } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  Injector,
  OnInit,
  afterNextRender,
  computed,
  inject,
  input,
  linkedSignal,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { Router, RouterLink } from '@angular/router';
import { Api, ChecklistItem, FamilyMember, SharedTask } from '../../core/api/api';
import { generalMessage, toProblem } from '../../core/api/problem';
import { Icon } from '../../shared/icon/icon';
import { dayLong, monthDay, timeLabel } from '../dashboard/week';
import { CalendarItem, FORMER_PARENT } from './calendar-items';
import { toFamilyLocal } from './time';

/** How long the confetti plays before only the calm "done" state is left. */
export const CELEBRATION_MS = 2400;
const CONFETTI_PIECES = 14;

/**
 * A shared task's details, over the calendar (#73, part 3: #176). Opening it is what marks it Seen for this parent;
 * nothing else does. With a checklist, either parent ticks and unticks items, and the task is done when its deciding
 * items are; without one, Mark done (and Undo) decides. Attribution is quiet: who and when, never scores. When the
 * server says a change completed the task, a short celebration plays (just the message with reduced motion), and
 * never on reopening or reloading. If the other parent changed the task first, it refreshes and says so.
 */
@Component({
  selector: 'app-task-details',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CalendarPalette, A11yModule, MatButtonModule, RouterLink, Icon],
  host: { '(keydown.escape)': 'closed.emit()' },
  templateUrl: './task-details.html',
  styleUrls: ['./event-details.scss', './task-details.scss'],
})
export class TaskDetails implements OnInit {
  private readonly api = inject(Api);
  private readonly window = inject(DOCUMENT).defaultView;
  private readonly injector = inject(Injector);
  protected readonly reloadUrl = inject(Router).url;
  protected readonly sessionChanged = signal(false);
  private readonly deleteButton = viewChild('deleteButton', { read: ElementRef<HTMLButtonElement> });
  private readonly keepButton = viewChild('keepButton', { read: ElementRef<HTMLButtonElement> });

  readonly item = input.required<CalendarItem>();
  readonly task = input.required<SharedTask>();
  readonly members = input.required<readonly FamilyMember[]>();
  readonly familyId = input.required<string>();
  readonly timeZone = input.required<string>();
  readonly closed = output();
  /** The task changed here (a tick, Mark done); the calendar shows the new state without closing. */
  readonly updated = output<SharedTask>();
  /** It was deleted; the message says so. */
  readonly changed = output<string>();

  /** The latest copy: the calendar's, or the server's answer to a change made here. */
  protected readonly current = linkedSignal(() => this.task());
  protected readonly busy = signal(false);
  protected readonly confirming = signal(false);
  protected readonly error = signal<string | null>(null);
  /** Said politely: a conflict refresh, or the celebration message. */
  protected readonly notice = signal<string | null>(null);
  protected readonly confetti = signal(false);
  protected readonly pieces = Array.from({ length: CONFETTI_PIECES }, (_, i) => i);

  protected readonly due = computed(() => dayLong(this.current().dueDate));
  protected readonly hasChecklist = computed(() => this.current().items.length > 0);
  protected readonly anyRequired = computed(() => this.current().items.some((i) => i.required));
  protected readonly done = computed(() => this.current().completedAt !== null);
  protected readonly progressText = computed(() => {
    const t = this.current();
    return `${t.progressDone} of ${t.progressTotal} ${this.anyRequired() ? 'required ' : ''}done`;
  });
  private readonly me = computed(() => this.members().find((m) => m.isYou)?.membershipId);
  protected readonly editedBy = computed(() => {
    const editor = this.current().editedBy;
    return editor ? this.name(editor) : null;
  });
  protected readonly seenBy = computed(() =>
    this.current()
      .seenBy.filter((s) => s.membershipId !== this.me())
      .map((s) => this.name(s.membershipId))
      .join(', '),
  );
  protected readonly completedText = computed(() => {
    const t = this.current();
    return t.completedBy && t.completedAt ? `Done by ${this.who(t.completedBy)} · ${this.at(t.completedAt)}` : null;
  });

  private timer: ReturnType<typeof setTimeout> | undefined;

  constructor() {
    inject(DestroyRef).onDestroy(() => clearTimeout(this.timer));
  }

  ngOnInit(): void {
    // Opening the details on purpose is the only thing that marks it seen. A failure here is harmless.
    this.api.taskSeen(this.familyId(), this.task().id).catch(() => undefined);
  }

  protected tickedText(item: ChecklistItem): string | null {
    return item.completedBy && item.completedAt ? `Ticked by ${this.who(item.completedBy)} · ${this.at(item.completedAt)}` : null;
  }

  /** aria-disabled preserves keyboard focus; prevent the native checkbox toggle while a save is in flight. */
  protected holdWhileBusy(event: MouseEvent): void {
    if (this.busy() || this.sessionChanged()) {
      event.preventDefault();
    }
  }

  protected async toggle(item: ChecklistItem, box: HTMLInputElement): Promise<void> {
    await this.change(() => this.api.setTaskItem(this.familyId(), this.current().id, item.id, box.checked));
    // The box always ends up showing what the server has, even after a conflict or an error.
    box.checked = this.current().items.find((i) => i.id === item.id)?.completedAt != null;
  }

  protected setDone(done: boolean): Promise<void> {
    return this.change(() => this.api.setTaskDone(this.familyId(), this.current().id, done));
  }

  protected confirmDelete(confirming: boolean): void {
    if (this.busy() || this.sessionChanged()) {
      return;
    }
    this.confirming.set(confirming);
    afterNextRender(() => {
      if (this.confirming() === confirming) {
        const target = (confirming ? this.keepButton() : this.deleteButton())?.nativeElement;
        if (target?.isConnected) {
          target.focus();
        }
      }
    }, { injector: this.injector });
  }

  protected async remove(): Promise<void> {
    if (this.busy() || this.sessionChanged()) {
      return;
    }
    this.busy.set(true);
    this.error.set(null);
    try {
      await this.api.deleteTask(this.familyId(), this.current().id);
      this.changed.emit(`“${this.current().title}” was deleted.`);
    } catch (error) {
      this.fail(error);
    } finally {
      this.busy.set(false);
    }
  }

  private async change(request: () => Promise<SharedTask>): Promise<void> {
    if (this.busy() || this.sessionChanged()) {
      return;
    }
    this.busy.set(true);
    this.error.set(null);
    this.notice.set(null);
    try {
      const saved = await request();
      this.show(saved);
      if (saved.justCompleted) {
        this.celebrate();
      }
    } catch (error) {
      const problem = toProblem(error);
      if (problem.status === 409) {
        await this.refresh();
      } else {
        this.fail(error);
      }
    } finally {
      this.busy.set(false);
    }
  }

  /** A rejected token needs a fresh page/session before the parent explicitly tries again (#176). */
  private fail(error: unknown): void {
    const problem = toProblem(error);
    if (problem.status === 400 && problem.title === 'Invalid or missing antiforgery token.') {
      this.sessionChanged.set(true);
      this.error.set('Your session needs to be refreshed. Reload the calendar, then check the task and try again. This action wasn’t saved.');
      afterNextRender(() => this.window?.document.getElementById('task-session-error')?.focus(), { injector: this.injector });
    } else {
      this.error.set(generalMessage(problem));
    }
  }

  /** The other parent changed it first: load their version and say so plainly. */
  private async refresh(): Promise<void> {
    try {
      this.show(await this.api.task(this.familyId(), this.current().id));
      this.notice.set('The other parent just changed this task. It’s up to date now, so check it and try again.');
    } catch (error) {
      this.error.set(generalMessage(toProblem(error)));
    }
  }

  private show(task: SharedTask): void {
    this.current.set(task);
    this.updated.emit(task);
  }

  /** Only on the change the server says completed the task. With reduced motion, just the message. */
  private celebrate(): void {
    this.notice.set('Great teamwork! This task is done.');
    if (this.window?.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
      return;
    }
    this.confetti.set(true);
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.confetti.set(false), CELEBRATION_MS);
  }

  private name(membershipId: string): string {
    return this.members().find((m) => m.membershipId === membershipId)?.displayName ?? FORMER_PARENT;
  }

  private who(membershipId: string): string {
    return membershipId === this.me() ? 'you' : this.name(membershipId);
  }

  /** "Oct 20, 3:15 PM" in the family's time zone. */
  private at(instant: string): string {
    const local = toFamilyLocal(instant, this.timeZone());
    return `${monthDay(local.slice(0, 10))}, ${timeLabel(local.slice(11))}`;
  }
}
