import { A11yModule } from '@angular/cdk/a11y';
import { ChangeDetectionStrategy, Component, computed, inject, input, output, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { RouterLink } from '@angular/router';
import { Api, CalendarEvent, FamilyMember } from '../../core/api/api';
import { generalMessage, toProblem } from '../../core/api/problem';
import { Icon } from '../../shared/icon/icon';
import { dateTimeLabel, dayLong } from '../dashboard/week';
import { CalendarItem } from './calendar-items';
import { statusText, whenText } from './item-text';
import { toFamilyLocal } from './time';

/**
 * One event's details, over the calendar (a dialog with its focus kept inside; Escape or Close returns focus to the
 * item). It says plainly what's confirmed and what's waiting, and offers what the rules allow: cancelling, which
 * asks the co-parent first for parenting time and family events, and a way to the approvals inbox.
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

  /** Cancelling is offered on confirmed items; unavailable time only to its owner. */
  protected readonly canCancel = computed(
    () => this.item().status === 'confirmed' && (this.item().kind !== 'unavailable' || this.item().isMine),
  );
  protected readonly cancelExplanation = computed(() =>
    this.needsBoth() && this.coParent()
      ? `This asks ${this.coParent()} to approve cancelling it. It stays on the calendar until they do.`
      : 'This removes it from the calendar for both of you.',
  );

  /** The proposed change, before → after, when a change is waiting for approval. */
  protected readonly proposed = computed(() => {
    const proposed = this.event()?.proposed;
    if (!proposed || this.item().pendingChange !== 'Modify') {
      return null;
    }
    const zone = this.timeZone();
    return {
      title: proposed.title,
      from: dateTimeLabel(toFamilyLocal(proposed.startsAt, zone)),
      to: dateTimeLabel(toFamilyLocal(proposed.endsAt, zone)),
      location: proposed.location,
    };
  });

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
