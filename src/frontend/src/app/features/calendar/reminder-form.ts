import { ChangeDetectionStrategy, Component, OnInit, computed, inject, input, signal, ElementRef, Injector, afterNextRender } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { Router, RouterLink } from '@angular/router';
import { Api, Child, Reminder, ReminderInput, RepeatFrequency } from '../../core/api/api';
import { generalMessage, toProblem } from '../../core/api/problem';
import { AuthStore } from '../../core/auth/auth.store';
import { FORM_STYLES } from '../auth/form-styles';
import { PlainDate } from '../dashboard/model';
import { todayIn } from '../dashboard/week';
import { revealFirstProblem } from './reveal-problem';
import { PAST_DATE, UNREADABLE_DATE, choosable } from './date-rules';
import { isPlainDate, providePlainDates, typedValues } from './plain-dates';
import { fromFamilyLocal, toFamilyLocal } from './time';

export const TITLE_MAX = 80;
export const DETAILS_MAX = 1000;
const COUNT_MAX = 366;
/** A repeating reminder ends within 2 years of its first day (the server's limit, ReminderSchedule.MaxYears). */
const MAX_YEARS = 2;

/** The last day a reminder may repeat to: its first day 2 years on, or February 28 when that day doesn't exist. */
export function lastReminderDay(first: PlainDate): PlainDate {
  const [year, month, day] = first.split('-').map(Number);
  const daysInMonth = new Date(Date.UTC(year + MAX_YEARS, month, 0)).getUTCDate();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${year + MAX_YEARS}-${pad(month)}-${pad(Math.min(day, daysInMonth))}`;
}

const REPEATS: readonly { id: RepeatFrequency; label: string }[] = [
  { id: 'None', label: 'Doesn’t repeat' },
  { id: 'Daily', label: 'Every day' },
  { id: 'Weekly', label: 'Every week' },
  { id: 'Monthly', label: 'Every month' },
];

/**
 * Add or edit a shared reminder (#72, part 4: #173). A reminder is a dated note for both parents: it goes on the
 * calendar at once, with no approval. No location (things that happen somewhere are events), completion, assignee
 * or attachments. A repeat always has an end; editing a repeating reminder changes the whole series.
 */
@Component({
  selector: 'app-reminder-form',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ReactiveFormsModule,
    RouterLink,
    MatButtonModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatSlideToggleModule,
    MatDatepickerModule,
  ],
  providers: [providePlainDates()],
  templateUrl: './reminder-form.html',
  styleUrl: './add-event-page.scss',
  styles: [FORM_STYLES],
})
export class ReminderForm implements OnInit {
  private readonly api = inject(Api);
  private readonly injector = inject(Injector);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly auth = inject(AuthStore);
  private readonly router = inject(Router);

  /** The day to start on when adding. */
  readonly date = input<PlainDate | null>(null);
  /** The half-hour tapped on a week's time grid (#212), for a new reminder. */
  readonly time = input<string | null>(null);
  /** Editing: the reminder (its series start, as `GET` returns it). */
  readonly reminder = input<Reminder | null>(null);

  protected readonly repeats = REPEATS;
  protected readonly titleMax = TITLE_MAX;
  protected readonly detailsMax = DETAILS_MAX;
  private readonly family = this.auth.currentFamily;
  private readonly timeZone = computed(() => this.family()?.timeZone ?? 'UTC');

  protected readonly children = signal<readonly Child[]>([]);
  protected readonly busy = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly fieldErrors = signal<Readonly<Record<string, string>>>({});

  protected readonly form = inject(NonNullableFormBuilder).group({
    title: ['', [Validators.required, Validators.maxLength(TITLE_MAX)]],
    allDay: [false],
    date: ['', Validators.required],
    time: ['08:00'],
    childId: [''],
    details: ['', Validators.maxLength(DETAILS_MAX)],
    repeat: ['None' as RepeatFrequency],
    ends: ['count' as 'count' | 'date'],
    repeatCount: [4],
    repeatUntil: [''],
  });
  protected readonly value = toSignal(this.form.valueChanges, { initialValue: this.form.getRawValue() });
  protected readonly allDay = computed(() => this.value().allDay ?? false);
  /** Today in the family's time zone (#232): a new date is from today on. */
  protected readonly today = computed(() => todayIn(this.timeZone(), new Date()));
  /** The reminder's own date when editing, which it may keep even when it's past. */
  private readonly ownDate = signal<PlainDate | null>(null);
  protected readonly dayFilter = computed(() => {
    const [today, own] = [this.today(), this.ownDate()];
    return (day: PlainDate | null) => choosable(day, today, own ? [own] : []);
  });
  /** The latest "Last day" the picker offers: 2 years after the first day. */
  protected readonly untilMax = computed(() => (isPlainDate(this.value().date) ? lastReminderDay(this.value().date!) : null));
  protected readonly repeating = computed(() => (this.value().repeat ?? 'None') !== 'None');
  protected readonly endsOnDate = computed(() => this.value().ends === 'date');
  protected readonly editing = computed(() => this.reminder() !== null);
  protected readonly activeChildren = computed(() => this.children().filter((c) => c.status === 'Active'));

  async ngOnInit(): Promise<void> {
    const reminder = this.reminder();
    const zone = this.timeZone();
    if (reminder) {
      const start = toFamilyLocal(reminder.startsAt, zone);
      this.form.patchValue({
        title: reminder.title,
        allDay: reminder.allDay,
        date: start.slice(0, 10),
        time: reminder.allDay ? '08:00' : start.slice(11),
        childId: reminder.childId ?? '',
        details: reminder.details ?? '',
        repeat: reminder.repeat,
        ends: reminder.repeatUntil ? 'date' : 'count',
        repeatCount: reminder.repeatCount ?? 4,
        repeatUntil: reminder.repeatUntil ?? '',
      });
      this.ownDate.set(start.slice(0, 10));
    } else {
      // No days before today (#232).
      const [asked, time] = [this.date(), this.time()];
      const date = asked && asked >= this.today() ? asked : this.today();
      this.form.patchValue({ date, ...(time && date === asked ? { time, allDay: false } : {}) });
    }
    const family = this.family();
    if (family) {
      try {
        this.children.set(await this.api.children(family.id));
      } catch {
        // The child list is optional; the reminder can still be saved without one.
      }
    }
  }

  protected fieldError(name: string): string | null {
    return this.fieldErrors()[name] ?? null;
  }

  /** Shows the first problem after a refused save (see revealFirstProblem). */
  private revealProblem(): void {
    afterNextRender(() => revealFirstProblem(this.host.nativeElement), { injector: this.injector });
  }

  protected async submit(): Promise<void> {
    const family = this.family();
    if (!family || this.busy()) {
      return;
    }
    // Clear the last attempt's messages first, so only this attempt's problem is shown and focused.
    this.error.set(null);
    const errors = this.validate();
    this.fieldErrors.set(errors);
    if (Object.keys(errors).length > 0) {
      this.form.markAllAsTouched();
      this.revealProblem();
      return;
    }

    this.busy.set(true);
    this.error.set(null);
    try {
      const input = this.request();
      const existing = this.reminder();
      const saved = existing
        ? await this.api.updateReminder(family.id, existing.id, input)
        : await this.api.createReminder(family.id, input);
      await this.router.navigate(['/calendar'], {
        queryParams: { date: this.form.getRawValue().date },
        state: { calendarNotice: existing ? `“${saved.title}” was updated.` : `“${saved.title}” is on the calendar.` },
      });
    } catch (error) {
      const problem = toProblem(error);
      const serverErrors = Object.fromEntries(Object.entries(problem.errors).map(([k, v]) => [k, v.join(' ')]));
      if (problem.status === 400 && Object.keys(serverErrors).length > 0) {
        this.fieldErrors.set(serverErrors);
      } else {
        this.error.set(generalMessage(problem));
      }
      this.revealProblem();
    } finally {
      this.busy.set(false);
    }
  }

  private validate(): Record<string, string> {
    const v = typedValues(this.form);
    const errors: Record<string, string> = {};
    if (!v.title.trim()) {
      errors['title'] = 'Enter a title.';
    }
    if (v.date && !isPlainDate(v.date)) {
      errors['startsAt'] = UNREADABLE_DATE;
    } else if (!v.date) {
      errors['startsAt'] = 'Choose a date for the reminder.';
    } else if (v.date < this.today() && v.date !== this.ownDate()) {
      errors['startsAt'] = PAST_DATE;
    }
    if (!v.allDay && !v.time) {
      errors['time'] = 'Choose a time for the reminder.';
    }
    if (v.repeat !== 'None') {
      if (v.ends === 'count' && !(Number.isInteger(v.repeatCount) && v.repeatCount >= 2 && v.repeatCount <= COUNT_MAX)) {
        errors['repeatCount'] = `Repeat it 2 to ${COUNT_MAX} times.`;
      }
      if (v.ends === 'date' && v.repeatUntil && !isPlainDate(v.repeatUntil)) {
        errors['repeatUntil'] = UNREADABLE_DATE;
      } else if (
        v.ends === 'date' &&
        (!v.repeatUntil || (isPlainDate(v.date) && (v.repeatUntil <= v.date || v.repeatUntil > lastReminderDay(v.date))))
      ) {
        errors['repeatUntil'] = `Choose an end date after the first day and within ${MAX_YEARS} years.`;
      }
    }
    return errors;
  }

  private request(): ReminderInput {
    const v = this.form.getRawValue();
    const repeats = v.repeat !== 'None';
    return {
      title: v.title.trim(),
      startsAt: fromFamilyLocal(v.allDay ? `${v.date}T00:00` : `${v.date}T${v.time}`, this.timeZone()),
      allDay: v.allDay,
      childId: v.childId || null,
      details: v.details.trim() || undefined,
      repeat: v.repeat,
      repeatCount: repeats && v.ends === 'count' ? v.repeatCount : undefined,
      repeatUntil: repeats && v.ends === 'date' ? v.repeatUntil : undefined,
    };
  }

  /** Where Cancel goes: the day being edited or added. */
  protected readonly back = computed(() => this.value().date || todayIn(this.timeZone(), new Date()));
}
