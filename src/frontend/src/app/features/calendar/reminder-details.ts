import { A11yModule } from '@angular/cdk/a11y';
import { ChangeDetectionStrategy, Component, OnInit, computed, inject, input, output, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { RouterLink } from '@angular/router';
import { Api, FamilyMember, Reminder } from '../../core/api/api';
import { generalMessage, toProblem } from '../../core/api/problem';
import { Icon } from '../../shared/icon/icon';
import { dateMedium, dayLong } from '../dashboard/week';
import { CalendarItem, FORMER_PARENT } from './calendar-items';
import { whenText } from './item-text';

/** "Every week, 3 times" or "Every day until Oct 22, 2026"; null for a one-off. */
export function repeatText(reminder: Reminder): string | null {
  const every = { Daily: 'Every day', Weekly: 'Every week', Monthly: 'Every month', None: null }[reminder.repeat];
  if (!every) {
    return null;
  }
  if (reminder.repeatCount) {
    return `${every}, ${reminder.repeatCount} times`;
  }
  return reminder.repeatUntil ? `${every} until ${dateMedium(reminder.repeatUntil)}` : every;
}

/**
 * A shared reminder's details, over the calendar (#72, part 3: #172). Opening it is what marks it Seen for this
 * parent; nothing else does. Either parent can delete it at once, with no approval. A reminder has no location,
 * completion, assignee or attachments, so none are offered. Edit opens the reminder form for the whole series.
 */
@Component({
  selector: 'app-reminder-details',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [A11yModule, MatButtonModule, RouterLink, Icon],
  host: { '(keydown.escape)': 'closed.emit()' },
  templateUrl: './reminder-details.html',
  styleUrl: './event-details.scss',
})
export class ReminderDetails implements OnInit {
  private readonly api = inject(Api);

  readonly item = input.required<CalendarItem>();
  readonly reminder = input.required<Reminder>();
  readonly members = input.required<readonly FamilyMember[]>();
  readonly familyId = input.required<string>();
  readonly closed = output();
  /** Something changed; the message says what. */
  readonly changed = output<string>();

  protected readonly confirming = signal(false);
  protected readonly busy = signal(false);
  protected readonly error = signal<string | null>(null);

  protected readonly date = computed(() => dayLong(this.item().firstDate));
  protected readonly when = computed(() => whenText(this.item()));
  protected readonly repeats = computed(() => repeatText(this.reminder()));
  private readonly me = computed(() => this.members().find((m) => m.isYou)?.membershipId);
  private readonly name = (membershipId: string) =>
    this.members().find((m) => m.membershipId === membershipId)?.displayName ?? FORMER_PARENT;
  protected readonly editedBy = computed(() => {
    const editor = this.reminder().editedBy;
    return editor ? this.name(editor) : null;
  });
  /** The other parent, quietly, once they've opened it. Your own Seen isn't shown back to you. */
  protected readonly seenBy = computed(() =>
    this.reminder()
      .seenBy.filter((s) => s.membershipId !== this.me())
      .map((s) => this.name(s.membershipId))
      .join(', '),
  );

  ngOnInit(): void {
    // Opening the details on purpose is the only thing that marks it seen. A failure here is harmless.
    this.api.reminderSeen(this.familyId(), this.reminder().id).catch(() => undefined);
  }

  protected async remove(): Promise<void> {
    this.busy.set(true);
    this.error.set(null);
    try {
      await this.api.deleteReminder(this.familyId(), this.reminder().id);
      this.changed.emit(`“${this.reminder().title}” was deleted.`);
    } catch (error) {
      this.error.set(generalMessage(toProblem(error)));
    } finally {
      this.busy.set(false);
    }
  }
}
