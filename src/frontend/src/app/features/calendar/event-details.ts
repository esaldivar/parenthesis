import { A11yModule } from '@angular/cdk/a11y';
import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  Injector,
  afterNextRender,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
  untracked,
} from '@angular/core';
import { FormControl, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { RouterLink } from '@angular/router';
import { Api, CalendarEvent, ChangeRequest, EditScope, FamilyMember } from '../../core/api/api';
import { generalMessage, toProblem } from '../../core/api/problem';
import { Icon } from '../../shared/icon/icon';
import { dateTimeLabel, dayLong, timeLabel } from '../dashboard/week';
import { CalendarItem, FORMER_PARENT } from './calendar-items';
import { statusText, whenText } from './item-text';
import { datesText, repeatText } from './series';
import { lastDate, toFamilyLocal } from './time';

/**
 * One event's details, over the calendar (a dialog with its focus kept inside; Escape or Close returns focus to the
 * item). It says plainly what's confirmed and what's waiting, and offers what the rules allow: editing (#188) and
 * cancelling, which
 * asks the co-parent first for parenting time and family events; requesting a swap of parenting time; and, while a
 * request waits, its details (original → proposed, the reason, where it stands) with Withdraw for the parent who
 * sent it, and Approve or Decline (with an optional comment) for the parent who can decide (#218). Those use the same
 * approvals API and rules as the inbox.
 */
/** As in the approvals inbox. */
export const COMMENT_MAX = 500;

@Component({
  selector: 'app-event-details',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [A11yModule, ReactiveFormsModule, MatButtonModule, MatFormFieldModule, MatInputModule, RouterLink, Icon],
  host: { '(keydown.escape)': 'closed.emit()' },
  templateUrl: './event-details.html',
  styleUrl: './event-details.scss',
})
export class EventDetails {
  private readonly api = inject(Api);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly injector = inject(Injector);

  readonly item = input.required<CalendarItem>();
  readonly event = input<CalendarEvent | null>(null);
  readonly members = input.required<readonly FamilyMember[]>();
  readonly familyId = input.required<string>();
  readonly timeZone = input.required<string>();
  /**
   * For unavailable time: the confirmed parenting time of the same parent that it overlaps, if any (#190). Only then
   * is a swap offered, and opening the details never starts one.
   */
  readonly swapTarget = input<CalendarItem | null>(null);
  readonly closed = output();
  /** Something changed; the message says what. */
  readonly changed = output<string>();

  protected readonly confirming = signal(false);
  /** The parent's decision on a declined request (#199), from the approvals history. */
  protected readonly declineInfo = signal<{ by: string; on: string; comment: string | null } | null>(null);
  protected readonly withdrawing = signal(false);
  /** The waiting request about this event, if any (from the approvals inbox). */
  protected readonly request = signal<ChangeRequest | null>(null);
  /**
   * Whether the waiting request was found: `gone` when the item still shows as waiting but nothing waits any more
   * (answered on another device, withdrawn or expired), so no stale buttons are offered.
   */
  protected readonly requestState = signal<'loading' | 'found' | 'gone' | 'unknown'>('loading');
  protected readonly declining = signal(false);
  protected readonly commentMax = COMMENT_MAX;
  protected readonly comment = new FormControl('', { nonNullable: true, validators: Validators.maxLength(COMMENT_MAX) });
  protected readonly busy = signal(false);
  protected readonly error = signal<string | null>(null);

  protected readonly status = computed(() => statusText(this.item()) ?? 'Confirmed');
  protected readonly date = computed(() => dayLong(this.item().firstDate));
  protected readonly when = computed(() => whenText(this.item()));
  protected readonly coParent = computed(
    () => this.members().find((m) => m.role === 'Parent' && !m.isYou)?.displayName ?? null,
  );
  protected readonly people = computed(() =>
    [...this.item().parents.map((p) => p.name), ...this.item().children.map((c) => c.name)].join(', '),
  );
  /** Parenting time, holidays and family events change only with both parents' agreement. */
  private readonly needsBoth = computed(() => this.item().kind === 'parenting' || this.item().kind === 'family');

  protected readonly swapTargetWhen = computed(() => {
    const target = this.swapTarget();
    return target ? `${dayLong(target.firstDate)} · ${whenText(target)}` : null;
  });

  /** A swap changes confirmed parenting time's dates, with the co-parent's approval. */
  protected readonly canSwap = computed(
    () => this.item().category === 'ParentingTime' && this.item().status === 'confirmed' && !!this.coParent(),
  );
  protected readonly sentAt = computed(() => {
    const request = this.request();
    return request ? dateTimeLabel(toFamilyLocal(request.createdAt, this.timeZone())) : null;
  });
  protected readonly answerLabel = computed(() =>
    this.request()?.canDecide ? 'Your answer' : `${this.coParent() ?? 'Your co-parent'}’s answer`,
  );

  constructor() {
    effect(() => {
      const item = this.item();
      const familyId = this.familyId();
      untracked(() => {
        this.request.set(null);
        this.requestState.set('loading');
        this.declineInfo.set(null);
        this.withdrawing.set(false);
        this.declining.set(false);
        this.comment.reset();
        if (item.status === 'declined') {
          void this.loadDecline(familyId, item.id);
        } else if (item.status !== 'confirmed') {
          void this.loadRequest(familyId, item.id);
        }
      });
    });
  }

  private async loadRequest(familyId: string, eventId: string): Promise<void> {
    try {
      const requests = await this.api.approvals(familyId);
      if (this.item().id === eventId) {
        // A repeating parenting-time request is about the whole series (#239).
        const seriesId = this.event()?.seriesId;
        const request = requests.find((r) => r.targetId === eventId || (!!seriesId && r.targetId === seriesId)) ?? null;
        this.request.set(request);
        this.requestState.set(request ? 'found' : 'gone');
      }
    } catch {
      // The details still show the status in words; the approvals inbox has the rest.
      this.requestState.set('unknown');
    }
  }

  /** Who declined it, when, and their comment, from the decided requests. */
  private async loadDecline(familyId: string, eventId: string): Promise<void> {
    try {
      const decided = await this.api.approvals(familyId, 'history');
      const seriesId = this.event()?.seriesId;
      const request = decided.find((r) => (r.targetId === eventId || (!!seriesId && r.targetId === seriesId)) && r.status === 'Rejected');
      const answer = request?.decisions.find((d) => d.decision === 'Reject');
      if (this.item().id === eventId && answer) {
        const member = this.members().find((m) => m.membershipId === answer.deciderMembershipId);
        this.declineInfo.set({
          by: member?.isYou ? 'You' : (member?.displayName ?? FORMER_PARENT),
          on: dateTimeLabel(toFamilyLocal(answer.decidedAt, this.timeZone())),
          comment: answer.comment,
        });
      }
    } catch {
      // The details still say it was declined; the approvals history has the rest.
    }
  }

  /** Removes a declined request from this parent's calendar only (#199). */
  protected async dismiss(): Promise<void> {
    this.busy.set(true);
    this.error.set(null);
    try {
      await this.api.dismissEvent(this.familyId(), this.item().id);
      this.changed.emit(
        `“${this.item().title}” was removed from your calendar. It’s still in the approvals history.`,
      );
    } catch (error) {
      this.error.set(generalMessage(toProblem(error)));
    } finally {
      this.busy.set(false);
    }
  }

  /**
   * Whether several dates can be cancelled together. Not for repeating parenting time yet (#239): each date's
   * cancellation goes to the co-parent on its own.
   */
  protected readonly cancelsTogether = computed(() => !!this.repeats() && this.item().category !== 'ParentingTime');

  /** "Every Wed and Fri until Nov 13, 2026" for a repeating event (#193). */
  protected readonly repeats = computed(() => {
    const event = this.event();
    // Keep weekday ordering anchored to the series, even when a later occurrence is opened.
    // Older responses may omit the first dates; fall back to the opened occurrence.
    return event?.repeat
      ? repeatText(event.repeat, toFamilyLocal(event.repeat.firstStarts?.[0] ?? event.startsAt, this.timeZone()).slice(0, 10))
      : null;
  });

  /** "12 dates: Oct 28, Nov 4, Nov 11 and 9 more" for a repeating event (#239). */
  protected readonly seriesDates = computed(() => {
    const repeat = this.event()?.repeat;
    const zone = this.timeZone();
    return repeat ? datesText(repeat.dateCount, (repeat.firstStarts ?? []).map((s) => toFamilyLocal(s, zone).slice(0, 10))) : null;
  });

  /** Cancelling is offered on confirmed items; unavailable time only to its owner. */
  protected readonly canCancel = computed(
    () => this.item().status === 'confirmed' && (this.item().kind !== 'unavailable' || this.item().isMine),
  );
  protected readonly cancelExplanation = computed(() =>
    this.needsBoth() && this.coParent()
      ? `This asks ${this.coParent()} to approve cancelling it. It stays on the calendar until they do.`
      : 'This removes it from the calendar for both of you.',
  );

  /** The proposed change in words (before → after), when a change is waiting for approval. */
  protected readonly proposed = computed(() => {
    const proposed = this.event()?.proposed;
    if (!proposed || this.item().pendingChange !== 'Modify') {
      return null;
    }
    const zone = this.timeZone();
    const start = toFamilyLocal(proposed.startsAt, zone);
    const end = toFamilyLocal(proposed.endsAt, zone);
    const first = start.slice(0, 10);
    const last = lastDate(start, end);
    const when = proposed.allDay
      ? last > first
        ? `${dayLong(first)} – ${dayLong(last)}, all day`
        : `${dayLong(first)}, all day`
      : last > first || end.slice(0, 10) !== first
        ? `${dateTimeLabel(start)} – ${dateTimeLabel(end)}`
        : `${dayLong(first)} · ${timeLabel(start.slice(11))} – ${timeLabel(end.slice(11))}`;
    return [proposed.title !== this.item().title ? proposed.title : null, when, proposed.location]
      .filter(Boolean)
      .join(' · ');
  });

  protected async withdraw(): Promise<void> {
    const request = this.request();
    if (!request) {
      return;
    }
    this.busy.set(true);
    this.error.set(null);
    try {
      await this.api.withdraw(this.familyId(), request.id);
      this.changed.emit(
        this.item().status === 'pending'
          ? `You withdrew “${this.item().title}”. It isn’t on the calendar.`
          : `You withdrew your request. “${this.item().title}” stays as it was.`,
      );
    } catch (error) {
      this.error.set(generalMessage(toProblem(error)));
    } finally {
      this.busy.set(false);
    }
  }

  protected startCancel(): void {
    this.confirming.set(true);
    this.focus(this.cancelsTogether() ? '#event-keep-series' : '#event-keep');
  }

  protected keepEvent(): void {
    this.confirming.set(false);
    this.focus('#event-cancel');
  }

  protected startDecline(): void {
    this.comment.reset();
    this.error.set(null);
    this.declining.set(true);
    this.focus('#event-decline-comment');
  }

  protected keepWaiting(): void {
    this.declining.set(false);
    this.focus('#event-decline');
  }

  private focus(selector: string): void {
    afterNextRender(() => this.host.nativeElement.querySelector<HTMLElement>(selector)?.focus(), { injector: this.injector });
  }

  /** Approves the waiting request, as in the inbox; the calendar then refreshes and says what happened. */
  protected approve(): Promise<void> {
    const title = this.item().title;
    const change = this.item().pendingChange;
    return this.decide(
      (familyId, id) => this.api.approve(familyId, id),
      (result) =>
        result.status !== 'Approved'
          ? `You approved “${title}”. It still needs the other approval.`
          : change === 'Cancel'
            ? `You approved cancelling “${title}”. It’s off the calendar.`
            : change === 'Modify'
              ? `You approved the change. “${title}” was updated on the calendar.`
              : `You approved “${title}”. It’s on the calendar.`,
    );
  }

  /** Declines it with the optional comment, as in the inbox. */
  protected decline(): Promise<void> {
    if (this.comment.invalid) {
      return Promise.resolve();
    }
    const title = this.item().title;
    const change = this.item().pendingChange;
    const comment = this.comment.value.trim() || undefined;
    return this.decide(
      (familyId, id) => this.api.reject(familyId, id, comment),
      () =>
        change === 'Cancel'
          ? `You declined cancelling “${title}”. It stays on the calendar.`
          : change === 'Modify'
            ? `You declined the change. “${title}” stays as it was.`
            : `You declined “${title}”. It isn’t on the schedule.`,
    );
  }

  private async decide(
    action: (familyId: string, requestId: string) => Promise<ChangeRequest>,
    done: (result: ChangeRequest) => string,
  ): Promise<void> {
    const request = this.request();
    if (!request || this.busy()) {
      return;
    }
    this.busy.set(true);
    this.error.set(null);
    try {
      const result = await action(this.familyId(), request.id);
      this.changed.emit(done(result));
    } catch (error) {
      // Answered elsewhere meanwhile, for example: say so, and check where it stands now.
      this.error.set(generalMessage(toProblem(error)));
      this.declining.set(false);
      await this.loadRequest(this.familyId(), this.item().id);
    } finally {
      this.busy.set(false);
    }
  }

  /** Reloads the calendar when the request was answered elsewhere. */
  protected refresh(): void {
    this.changed.emit('The calendar is up to date.');
  }

  protected async cancel(scope: EditScope = 'this'): Promise<void> {
    this.busy.set(true);
    this.error.set(null);
    try {
      const result = await this.api.cancelEvent(this.familyId(), this.item().id, scope);
      const title = this.item().title;
      this.changed.emit(
        result && result.pendingChange === 'Cancel'
          ? `Cancellation sent to ${this.coParent() ?? 'your co-parent'} for approval. “${title}” stays on the calendar until then.`
          : scope === 'all'
            ? `Every date of “${title}” was cancelled.`
            : scope === 'following'
              ? `“${title}” was cancelled from ${this.date()} on.`
              : `“${title}” was cancelled.`,
      );
    } catch (error) {
      this.error.set(generalMessage(toProblem(error)));
    } finally {
      this.busy.set(false);
    }
  }
}
