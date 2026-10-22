import { ChangeDetectionStrategy, Component, OnInit, computed, inject, input, signal, ElementRef, Injector, afterNextRender } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { Router, RouterLink } from '@angular/router';
import { Api, CalendarCategory, CalendarWarning, Child, FamilyMember, NewCalendarEvent, Weekday } from '../../core/api/api';
import { generalMessage, toProblem } from '../../core/api/problem';
import { AuthStore } from '../../core/auth/auth.store';
import { Icon, IconName } from '../../shared/icon/icon';
import { FORM_STYLES } from '../auth/form-styles';
import { PlainDate } from '../dashboard/model';
import { addDays, monthDay, todayIn, weekdayShort } from '../dashboard/week';
import { ReminderForm } from './reminder-form';
import { MAX_DATES, WEEKDAYS, lastAllowed, seriesDates, weekdayOf } from './series';
import { TaskForm } from './task-form';
import { withOwnOverlap } from './own-overlap';
import { revealFirstProblem } from './reveal-problem';
import { fromFamilyLocal } from './time';

export type EventType = 'activity' | 'parenting' | 'family' | 'unavailable';

/** What's being created (handoff: "What are you creating?"). */
export type CreateKind = 'event' | 'task' | 'reminder';

const KINDS: readonly { id: CreateKind; label: string; description: string; icon: IconName }[] = [
  { id: 'event', label: 'Event', description: 'Something that happens at a time', icon: 'calendar' },
  { id: 'task', label: 'Task', description: 'Something to get done together', icon: 'note' },
  { id: 'reminder', label: 'Reminder', description: 'A note for a day, for both of you', icon: 'bell' },
];

interface TypeOption {
  readonly id: EventType;
  readonly label: string;
  readonly description: string;
  readonly icon: IconName;
}

const TYPES: readonly TypeOption[] = [
  { id: 'activity', label: 'Activity', description: 'Practice, lesson, appointment, outing', icon: 'soccer' },
  { id: 'parenting', label: 'Parenting time', description: 'Time with the kids', icon: 'calendar' },
  { id: 'family', label: 'Family event', description: 'Both parents attend', icon: 'children' },
  { id: 'unavailable', label: 'I’m unavailable', description: 'Only “Unavailable” is shared', icon: 'block' },
];

/** What an activity is, for its colour and icon. Holidays and family events have their own types. */
const ACTIVITY_CATEGORIES: readonly { id: CalendarCategory; label: string }[] = [
  { id: 'Activity', label: 'Activity' },
  { id: 'School', label: 'School' },
  { id: 'Medical', label: 'Medical' },
  { id: 'Dental', label: 'Dental' },
  { id: 'Birthday', label: 'Birthday' },
  { id: 'Other', label: 'Other' },
];

const isDate = (value: string | undefined): value is PlainDate => !!value && /^\d{4}-\d{2}-\d{2}$/.test(value);

/** A gentle, non-blocking note for each warning the API can return. Nothing is blocked or reassigned. */
export function warningText(warning: CalendarWarning, coParent: string | null): string {
  switch (warning) {
    case 'OverlapsCoParentUnavailable':
      return `${coParent ?? 'Your co-parent'} marked that time as unavailable, so it may be hard for them to accommodate.`;
    case 'CaregiverUnavailable':
      return 'The parent with the children marked that time as unavailable.';
    case 'OverlapsParentingTime':
      return 'It overlaps other parenting time.';
    default:
      return 'It overlaps your own parenting time. You may want to arrange cover.';
  }
}

/**
 * Add to Calendar (handoff 2026-10-20). First Event, Task or Reminder (#173): reminders and tasks (#177) get their own
 * forms. For an event, choose the type next: whole cards that highlight when chosen, with no radio
 * buttons, checkmarks or other selection marks (owner rule). The form then asks only what that type needs. Approval
 * follows the product rules, never a switch: parenting time and family events go to the co-parent; activities and
 * unavailable time are on the calendar at once. A family event always includes both parents; children are optional.
 */
@Component({
  selector: 'app-add-event-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ReactiveFormsModule,
    RouterLink,
    MatButtonModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatSlideToggleModule,
    Icon,
    ReminderForm,
    TaskForm,
  ],
  templateUrl: './add-event-page.html',
  styleUrls: ['./add-event-page.scss'],
  styles: [FORM_STYLES],
})
export class AddEventPage implements OnInit {
  private readonly api = inject(Api);
  private readonly injector = inject(Injector);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly auth = inject(AuthStore);
  private readonly router = inject(Router);

  /** `?date=YYYY-MM-DD`: the day to start on (from the calendar). */
  readonly date = input<string>();
  /** `?kind=reminder`: start on that choice. Event otherwise. */
  readonly kind = input<string>();
  /** `?time=HH:mm`: the half-hour tapped on a week's time grid (#212). The event starts then, for an hour. */
  readonly time = input<string>();
  protected readonly slotTime = computed(() => {
    const time = this.time();
    return time && /^([01]\d|2[0-3]):[0-5]\d$/.test(time) ? time : null;
  });

  protected readonly kinds = KINDS;
  /** Event, Task or Reminder. Event is chosen at first, so adding an event is as quick as before. */
  protected readonly creating = signal<CreateKind>('event');
  protected readonly types = TYPES;
  protected readonly categories = ACTIVITY_CATEGORIES;
  protected readonly family = this.auth.currentFamily;
  private readonly timeZone = computed(() => this.family()?.timeZone ?? 'UTC');

  protected readonly type = signal<EventType | null>(null);
  protected readonly members = signal<readonly FamilyMember[]>([]);
  protected readonly children = signal<readonly Child[]>([]);
  protected readonly loadError = signal<string | null>(null);
  protected readonly busy = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly fieldErrors = signal<Readonly<Record<string, string>>>({});

  protected readonly form = inject(NonNullableFormBuilder).group({
    title: ['', [Validators.maxLength(120)]],
    category: ['Activity' as CalendarCategory],
    caregiver: [''],
    allDay: [false],
    startDate: ['', Validators.required],
    startTime: ['09:00'],
    endDate: ['', Validators.required],
    endTime: ['10:00'],
    childIds: [[] as string[]],
    location: ['', Validators.maxLength(200)],
    notes: ['', Validators.maxLength(1000)],
    // Repeating unavailable time and activities (#193): weekly on chosen days, always ending within a year.
    repeats: [false],
    repeatDays: [[] as Weekday[]],
    ends: ['date' as 'date' | 'count'],
    repeatUntil: [''],
    repeatCount: [4],
  });
  private readonly value = toSignal(this.form.valueChanges, { initialValue: this.form.getRawValue() });

  protected readonly activeChildren = computed(() => this.children().filter((c) => c.status === 'Active'));
  /** Children added but still waiting for the other parent's approval (ADR-0006). */
  protected readonly pendingChildren = computed(() => this.children().some((c) => c.status === 'PendingApproval'));
  protected readonly parents = computed(() => this.members().filter((m) => m.role === 'Parent'));
  protected readonly coParent = computed(() => this.parents().find((m) => !m.isYou)?.displayName ?? null);
  protected readonly allDay = computed(() => this.value().allDay ?? false);
  protected readonly weekdays = WEEKDAYS;
  /** Only unavailable time and activities can repeat; parenting time and family events need approval each time. */
  protected readonly canRepeat = computed(() => this.type() === 'activity' || this.type() === 'unavailable');
  protected readonly repeats = computed(() => this.canRepeat() && (this.value().repeats ?? false));
  protected readonly repeatDays = computed(() => this.value().repeatDays ?? []);
  protected readonly endsOnDate = computed(() => this.value().ends === 'date');
  /** The dates the series will have, as the server will make them. */
  protected readonly dates = computed(() => {
    const v = this.value();
    if (!this.repeats() || !v.startDate) {
      return [];
    }
    return seriesDates(
      v.startDate,
      v.repeatDays ?? [],
      v.ends === 'date' ? v.repeatUntil || null : null,
      v.ends === 'count' ? (v.repeatCount ?? null) : null,
    );
  });
  /** "Wed, Oct 28 · Fri, Oct 30 · Wed, Nov 4" and "+3 more". */
  protected readonly preview = computed(() => {
    const dates = this.dates();
    return { shown: dates.slice(0, 3).map((d) => `${weekdayShort(d)}, ${monthDay(d)}`), more: Math.max(0, dates.length - 3), total: dates.length };
  });
  protected readonly selectedChildren = computed(() => this.value().childIds ?? []);
  protected readonly allChildren = computed(
    () => this.activeChildren().length > 0 && this.activeChildren().every((c) => this.selectedChildren().includes(c.id)),
  );

  protected readonly approvalNote = computed(() => {
    const coParent = this.coParent();
    switch (this.type()) {
      case 'parenting':
        return coParent
          ? `${coParent} needs to approve parenting time. Until they accept, it shows as pending and isn’t on the schedule.`
          : 'You’re the only parent so far, so it’s confirmed now and marked for your co-parent to review when they join.';
      case 'family':
        return `Both parents attend. ${coParent ?? 'Your co-parent'} needs to accept before it’s confirmed; your request counts as your approval.`;
      case 'unavailable':
        return `${coParent ?? 'Your co-parent'} sees only “Unavailable”. Your note stays private to you. It doesn’t change who has the children.`;
      case 'activity':
        return 'Activities go on the shared calendar straight away.';
      default:
        return null;
    }
  });

  async ngOnInit(): Promise<void> {
    const wanted = KINDS.find((k) => k.id === this.kind());
    if (wanted) {
      this.creating.set(wanted.id);
    }
    const start = isDate(this.date()) ? this.date()! : todayIn(this.timeZone(), new Date());
    this.form.patchValue({ startDate: start, endDate: start });
    const slot = this.slotTime();
    if (slot) {
      // An hour from the tapped half-hour, the same length as the form's own default; past midnight ends the next day.
      const [hours, minutes] = slot.split(':').map(Number);
      const end = hours * 60 + minutes + 60;
      const endTime = `${String(Math.floor(end / 60) % 24).padStart(2, '0')}:${String(end % 60).padStart(2, '0')}`;
      this.form.patchValue({ startTime: slot, endTime, endDate: end >= 24 * 60 ? addDays(start, 1) : start });
    }
    const family = this.family();
    if (!family) {
      return;
    }
    try {
      const [details, children] = await Promise.all([this.api.family(family.id), this.api.children(family.id)]);
      this.members.set(details.members);
      this.children.set(children);
      this.form.patchValue({ caregiver: details.members.find((m) => m.isYou)?.membershipId ?? '' });
    } catch (error) {
      this.loadError.set(generalMessage(toProblem(error)));
    }
  }

  protected choose(type: EventType): void {
    this.type.set(type);
    this.fieldErrors.set({});
    this.error.set(null);
    // Parenting time and unavailable time are usually whole days (All day is the default for unavailable time).
    // A tapped time slot (#212) keeps its time for every type.
    this.form.patchValue({ allDay: (type === 'parenting' || type === 'unavailable') && !this.slotTime() });
    if (type === 'unavailable') {
      this.form.patchValue({ childIds: [] });
    }
  }

  /** Turning Repeat on starts with the first date's weekday. */
  protected toggleRepeat(on: boolean): void {
    const v = this.form.getRawValue();
    if (on && v.repeatDays.length === 0 && v.startDate) {
      this.form.patchValue({ repeatDays: [weekdayOf(v.startDate)] });
    }
  }

  protected toggleDay(day: Weekday, checked: boolean): void {
    const current = this.repeatDays();
    this.form.patchValue({
      repeatDays: WEEKDAYS.map((d) => d.id).filter((d) => (d === day ? checked : current.includes(d))),
    });
  }

  protected toggleChild(id: string, checked: boolean): void {
    const current = this.selectedChildren();
    this.form.patchValue({ childIds: checked ? [...current, id] : current.filter((c) => c !== id) });
  }

  protected toggleAll(checked: boolean): void {
    this.form.patchValue({ childIds: checked ? this.activeChildren().map((c) => c.id) : [] });
  }

  /** Shows the first problem after a refused save (see revealFirstProblem). */
  private revealProblem(): void {
    afterNextRender(() => revealFirstProblem(this.host.nativeElement), { injector: this.injector });
  }

  protected async submit(): Promise<void> {
    const type = this.type();
    const family = this.family();
    if (!type || !family) {
      return;
    }
    // Clear the last attempt's messages first, so only this attempt's problem is shown and focused.
    this.error.set(null);
    const errors = this.validate(type);
    this.fieldErrors.set(errors);
    if (Object.keys(errors).length > 0) {
      this.form.markAllAsTouched();
      this.revealProblem();
      return;
    }

    this.busy.set(true);
    this.error.set(null);
    try {
      const created = await this.api.createEvent(family.id, this.request(type));
      const coParent = this.coParent() ?? 'your co-parent';
      const count = this.repeats() ? this.dates().length : 1;
      const head =
        created.status === 'PendingApproval'
          ? `Sent to ${coParent} for approval. “${created.title}” shows as pending until they accept.`
          : count > 1
            ? `“${created.title}” is on the calendar on ${count} dates.`
            : `“${created.title}” is on the calendar.`;
      const notes = created.warnings.map((w) => warningText(w, this.coParent()));
      await this.router.navigate(['/calendar'], {
        queryParams: { date: this.form.getRawValue().startDate },
        state: { calendarNotice: [head, ...notes].join(' ') },
      });
    } catch (error) {
      const problem = toProblem(error);
      const serverErrors = Object.fromEntries(Object.entries(problem.errors).map(([k, v]) => [k, v.join(' ')]));
      if (problem.status === 400 && Object.keys(serverErrors).length > 0) {
        const caregiver = this.parents().find((p) => p.membershipId === this.form.getRawValue().caregiver);
        this.fieldErrors.set(withOwnOverlap(serverErrors, caregiver));
      } else {
        this.error.set(generalMessage(problem));
      }
      this.revealProblem();
    } finally {
      this.busy.set(false);
    }
  }

  protected fieldError(name: string): string | null {
    return this.fieldErrors()[name] ?? null;
  }

  private validate(type: EventType): Record<string, string> {
    const v = this.form.getRawValue();
    const errors: Record<string, string> = {};
    if (type !== 'unavailable' && type !== 'parenting' && !v.title.trim()) {
      errors['title'] = 'Enter a title.';
    }
    if (!v.startDate || !v.endDate) {
      errors['endsAt'] = 'Choose when it starts and ends.';
    } else {
      const start = v.allDay ? v.startDate : `${v.startDate}T${v.startTime}`;
      const end = v.allDay ? v.endDate : `${v.endDate}T${v.endTime}`;
      if (v.allDay ? end < start : end <= start) {
        errors['endsAt'] = 'Choose an end that’s after the start.';
      }
    }
    if (this.repeats()) {
      if (v.repeatDays.length === 0) {
        errors['repeat'] = 'Choose the days it repeats on.';
      } else if (v.ends === 'date' && (!v.repeatUntil || v.repeatUntil < v.startDate || v.repeatUntil > lastAllowed(v.startDate))) {
        errors['repeatUntil'] = 'Choose an end date from the first day to a year later.';
      } else if (v.ends === 'count' && !(Number.isInteger(v.repeatCount) && v.repeatCount >= 2 && v.repeatCount <= MAX_DATES)) {
        errors['repeatCount'] = `Repeat it 2 to ${MAX_DATES} times.`;
      } else if (this.dates().length === 0) {
        errors['repeat'] = 'None of the chosen days fall before the end date.';
      } else if (v.ends === 'count' && this.dates().length < v.repeatCount) {
        errors['repeatCount'] = 'That many times goes past a year. Choose fewer, or an end date.';
      }
    }
    if (type === 'parenting') {
      if (!v.caregiver) {
        errors['caregiverMembershipId'] = 'Choose which parent has the children.';
      }
      if (v.childIds.length === 0) {
        errors['childIds'] = 'Choose which children this parenting time is for.';
      }
    }
    return errors;
  }

  private request(type: EventType): NewCalendarEvent {
    const v = this.form.getRawValue();
    const zone = this.timeZone();
    const category: CalendarCategory =
      type === 'parenting' ? 'ParentingTime' : type === 'family' ? 'Joint' : type === 'unavailable' ? 'Unavailable' : v.category;
    const caregiverName = this.parents().find((p) => p.membershipId === v.caregiver)?.displayName;
    const title =
      type === 'unavailable' ? undefined : v.title.trim() || (type === 'parenting' ? `Time with ${caregiverName ?? 'parent'}` : '');
    return {
      category,
      title,
      allDay: v.allDay,
      startsAt: fromFamilyLocal(v.allDay ? `${v.startDate}T00:00` : `${v.startDate}T${v.startTime}`, zone),
      endsAt: fromFamilyLocal(v.allDay ? `${addDays(v.endDate, 1)}T00:00` : `${v.endDate}T${v.endTime}`, zone),
      location: type === 'unavailable' ? undefined : v.location.trim() || undefined,
      notes: v.notes.trim() || undefined,
      childIds: type === 'unavailable' ? [] : v.childIds,
      caregiverMembershipId: type === 'parenting' ? v.caregiver : undefined,
      repeat: this.repeats()
        ? {
            days: v.repeatDays,
            ...(v.ends === 'date' ? { until: v.repeatUntil } : { count: v.repeatCount }),
          }
        : undefined,
    };
  }
}
