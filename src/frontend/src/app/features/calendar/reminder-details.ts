import { AppLocale, LocaleService } from '../../core/i18n/locale.service';
import { TranslatePipe, translate } from '../../core/i18n/translations';
import { CalendarPalette, PanelTint } from './calendar-palette';
import { A11yModule } from '@angular/cdk/a11y';
import { ChangeDetectionStrategy, Component, ElementRef, Injector, OnInit, afterNextRender, computed, inject, input, output, signal, viewChild } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { RouterLink } from '@angular/router';
import { Api, FamilyMember, Reminder } from '../../core/api/api';
import { generalMessage, toProblem } from '../../core/api/problem';
import { Icon } from '../../shared/icon/icon';
import { dateMedium, dayLong } from '../dashboard/week';
import { CalendarItem } from './calendar-items';
import { whenText } from './item-text';

/** "Every week, 3 times" or "Every day until Oct 22, 2026"; null for a one-off. */
export function repeatText(reminder: Reminder, locale: AppLocale = 'en'): string | null {
  const key = { Daily: 'feature.every.day', Weekly: 'calendar.reminder.weekly', Monthly: 'calendar.reminder.monthly', None: null } as const;
  const interval = key[reminder.repeat];
  if (!interval) {
    return null;
  }
  const every = translate(interval, locale);
  if (reminder.repeatCount) {
    return translate(reminder.repeatCount === 1 ? 'calendar.reminder.once' : 'calendar.reminder.count', locale, {
      every, count: reminder.repeatCount,
    });
  }
  return reminder.repeatUntil
    ? translate('calendar.reminder.until', locale, { every, date: dateMedium(reminder.repeatUntil, locale) })
    : every;
}

/**
 * A shared reminder's details, over the calendar (#72, part 3: #172). Opening it is what marks it Seen for this
 * parent; nothing else does. Either parent can delete it at once, with no approval. A reminder has no location,
 * completion, assignee or attachments, so none are offered. Edit opens the reminder form for the whole series.
 */
@Component({
  selector: 'app-reminder-details',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [TranslatePipe, CalendarPalette, PanelTint, A11yModule, MatButtonModule, RouterLink, Icon],
  host: { '(keydown.escape)': 'closed.emit()' },
  templateUrl: './reminder-details.html',
  styleUrl: './event-details.scss',
})
export class ReminderDetails implements OnInit {
  private readonly locale = inject(LocaleService);
  private readonly api = inject(Api);
  private readonly injector = inject(Injector);
  private readonly deleteButton = viewChild('deleteButton', { read: ElementRef<HTMLButtonElement> });
  private readonly keepButton = viewChild('keepButton', { read: ElementRef<HTMLButtonElement> });

  readonly item = input.required<CalendarItem>();
  protected readonly childNames = computed(() => this.item().children.map(child => child.name).join(', '));
  readonly reminder = input.required<Reminder>();
  readonly members = input.required<readonly FamilyMember[]>();
  readonly familyId = input.required<string>();
  readonly closed = output();
  /** Something changed; the message says what. */
  readonly changed = output<string>();

  protected readonly confirming = signal(false);
  protected readonly busy = signal(false);
  protected readonly error = signal<string | null>(null);

  protected readonly date = computed(() => dayLong(this.item().firstDate, this.locale.locale()));
  protected readonly when = computed(() => whenText(this.item(), this.locale.locale()));
  protected readonly repeats = computed(() => repeatText(this.reminder(), this.locale.locale()));
  private readonly me = computed(() => this.members().find((m) => m.isYou)?.membershipId);
  private readonly name = (membershipId: string) =>
    this.members().find((m) => m.membershipId === membershipId)?.displayName ?? translate('feedback.former.parent', this.locale.locale());
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

  /** Replacing the action row must hand focus to its safe action, or back to the initiating Delete button. */
  protected confirmDelete(confirming: boolean): void {
    if (this.busy()) {
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
    if (this.busy()) {
      return;
    }
    this.busy.set(true);
    this.error.set(null);
    try {
      await this.api.deleteReminder(this.familyId(), this.reminder().id);
      this.changed.emit(translate('calendar.event.deleted', this.locale.locale(), { title: this.reminder().title }));
    } catch (error) {
      this.error.set(generalMessage(toProblem(error)));
    } finally {
      this.busy.set(false);
    }
  }
}
