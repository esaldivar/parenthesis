import { A11yModule } from '@angular/cdk/a11y';
import { ChangeDetectionStrategy, Component, computed, effect, inject, input, output, signal, untracked } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { RouterLink } from '@angular/router';
import { Api, CalendarEvent, ChangeRequest, FamilyMember } from '../../core/api/api';
import { generalMessage, toProblem } from '../../core/api/problem';
import { Icon } from '../../shared/icon/icon';
import { dateTimeLabel, dayLong, timeLabel } from '../dashboard/week';
import { CalendarItem } from './calendar-items';
import { statusText, whenText } from './item-text';
import { lastDate, toFamilyLocal } from './time';

/**
 * One event's details, over the calendar (a dialog with its focus kept inside; Escape or Close returns focus to the
 * item). It says plainly what's confirmed and what's waiting, and offers what the rules allow: cancelling, which
 * asks the co-parent first for parenting time and family events; requesting a swap of parenting time; and, while a
 * request waits, its details (original → proposed, the reason, where it stands) with Withdraw for the parent who
 * sent it.
 */
@Component({
  selector: 'app-event-details',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [A11yModule, MatButtonModule, RouterLink, Icon],
  host: { '(keydown.escape)': 'closed.emit()' },
  templateUrl: './event-details.html',
  styleUrl: './event-details.scss',
})
export class EventDetails {
  private readonly api = inject(Api);

  readonly item = input.required<CalendarItem>();
  readonly event = input<CalendarEvent | null>(null);
  readonly members = input.required<readonly FamilyMember[]>();
  readonly familyId = input.required<string>();
  readonly timeZone = input.required<string>();
  readonly closed = output();
  /** Something changed; the message says what. */
  readonly changed = output<string>();

  protected readonly confirming = signal(false);
  protected readonly withdrawing = signal(false);
  /** The waiting request about this event, if any (from the approvals inbox). */
  protected readonly request = signal<ChangeRequest | null>(null);
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
        this.withdrawing.set(false);
        if (item.status !== 'confirmed') {
          void this.loadRequest(familyId, item.id);
        }
      });
    });
  }

  private async loadRequest(familyId: string, eventId: string): Promise<void> {
    try {
      const requests = await this.api.approvals(familyId);
      if (this.item().id === eventId) {
        this.request.set(requests.find((r) => r.targetId === eventId) ?? null);
      }
    } catch {
      // The details still show the status in words; the approvals inbox has the rest.
    }
  }

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

  protected async cancel(): Promise<void> {
    this.busy.set(true);
    this.error.set(null);
    try {
      const result = await this.api.cancelEvent(this.familyId(), this.item().id);
      this.changed.emit(
        result && result.pendingChange === 'Cancel'
          ? `Cancellation sent to ${this.coParent() ?? 'your co-parent'} for approval. “${this.item().title}” stays on the calendar until then.`
          : `“${this.item().title}” was cancelled.`,
      );
    } catch (error) {
      this.error.set(generalMessage(toProblem(error)));
    } finally {
      this.busy.set(false);
    }
  }
}
