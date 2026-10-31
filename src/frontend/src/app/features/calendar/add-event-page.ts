import { LoadingIndicator } from '../../shared/brand/loading-indicator';
import { CalendarPalette } from './calendar-palette';
import { ChangeDetectionStrategy, Component, OnInit, computed, effect, inject, input, signal, untracked, ElementRef, Injector, afterNextRender } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { Router, RouterLink } from '@angular/router';
import { Api, CalendarCategory, CalendarWarning, Child, FamilyMember, NewCalendarEvent, SeriesFrequency, Weekday } from '../../core/api/api';
import { generalMessage, toProblem } from '../../core/api/problem';
import { AuthStore } from '../../core/auth/auth.store';
import { Icon, IconName } from '../../shared/icon/icon';
import { FORM_STYLES } from '../auth/form-styles';
import { PlainDate } from '../dashboard/model';
import { addDays, monthDay, todayIn, weekdayShort } from '../dashboard/week';
import { ReminderForm } from './reminder-form';
import { MAX_DATES, MAX_INTERVAL, RepeatRule, WEEKDAYS, lastAllowed, ordinal, seriesDates, weekdayOf } from './series';
import { TaskForm } from './task-form';
import { withOwnOverlap } from './own-overlap';
import { revealFirstProblem } from './reveal-problem';
import { dayFilter, END_BEFORE_START, rangeProblems, UNREADABLE_DATE } from './date-rules';
import { DateCheck } from './date-check';
import { LocationField } from './location-field';
import { DateField } from './date-field';
import { CalendarHeader } from './calendar-header';
import { isPlainDate, providePlainDates, typedValues } from './plain-dates';
import { fromFamilyLocal } from './time';

/** The Repeat menu (#238, owner decision October 23, 2026): no yearly for now. */
type RepeatChoice = 'none' | 'daily' | 'weekly' | 'monthly' | 'custom';

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
    LoadingIndicator,
    CalendarPalette, LocationField,
    DateField,
    ReactiveFormsModule,
    RouterLink,
    MatButtonModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatSlideToggleModule,
    MatDatepickerModule,
    Icon,
    ReminderForm,
    TaskForm,
  ],
  providers: [providePlainDates()],
  templateUrl: './add-event-page.html',
  styleUrls: ['./add-event-page.scss'],
  styles: [FORM_STYLES],
})
export class AddEventPage implements OnInit {
  protected readonly calendarHeader = CalendarHeader;
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
  protected readonly checkingAvailability = signal(false);
  private readonly pendingAvailability = signal<string | null>(null);
  protected readonly availabilityWarning = computed(() => {
    this.value();
    const pending = this.pendingAvailability();
    return pending !== null && pending === this.availabilityKey();
  });
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
    // Repeating unavailable time and activities (#193, #238): every day, week or month, or every N of them (Custom),
    // always ending within a year.
    repeat: ['none' as RepeatChoice],
    every: [1],
    unit: ['Weekly' as SeriesFrequency],
    repeatDays: [[] as Weekday[]],
    ends: ['date' as 'date' | 'count'],
    repeatUntil: [''],
    repeatCount: [4],
  });
  protected readonly value = toSignal(this.form.valueChanges, { initialValue: this.form.getRawValue() });
  /** Today in the family's time zone: new dates start from here (#232). */
  protected readonly today = computed(() => todayIn(this.timeZone(), new Date()));
  /** The calendar's open days: from today on (#232). Nothing else is disabled: the dates are checked instead (#248). */
  // One function for the page's life: a new one per change would make the picker re-check its dates without end.
  protected readonly dayFilter = (day: string | null): boolean => dayFilter(this.today())(day);
  protected readonly endBeforeStart = END_BEFORE_START;
  /** Which date shows red, and why (#248). */
  protected readonly dateCheck = new DateCheck(
    () => (this.value(), typedValues(this.form)),
    () => this.today(),
    () => [],
    () => this.timeZone(),
  );
  /** A repeat's last day: from the first date to a year later. */
  protected readonly repeatUntilMax = computed(() => (this.value().startDate ? lastAllowed(this.value().startDate!) : null));

  protected readonly activeChildren = computed(() => this.children().filter((c) => c.status === 'Active'));
  /** Children added but still waiting for the other parent's approval (ADR-0006). */
  protected readonly pendingChildren = computed(() => this.children().some((c) => c.status === 'PendingApproval'));
  protected readonly parents = computed(() => this.members().filter((m) => m.role === 'Parent'));
  protected readonly coParent = computed(() => this.parents().find((m) => !m.isYou)?.displayName ?? null);
  protected readonly allDay = computed(() => this.value().allDay ?? false);
  protected readonly weekdays = WEEKDAYS;
  /**
   * Unavailable time, activities and parenting time repeat (#193, #239). Repeating parenting time goes to the co-parent
   * as one request for every date. Family events don't repeat yet.
   */
  protected readonly canRepeat = computed(() => this.type() !== 'family' && !!this.type());
  protected readonly repeats = computed(() => this.canRepeat() && (this.value().repeat ?? 'none') !== 'none');
  protected readonly custom = computed(() => this.value().repeat === 'custom');
  protected readonly unit = computed(() => this.value().unit ?? 'Weekly');
  protected readonly repeatDays = computed(() => this.value().repeatDays ?? []);
  /** Custom's "every" list: 1 up to the most the unit allows (#238). */
  protected readonly intervals = computed(() => Array.from({ length: MAX_INTERVAL[this.unit()] }, (_, i) => i + 1));
  /** The menu names the start's weekday and day of the month, as Google Calendar does. */
  protected readonly weeklyLabel = computed(() => {
    const start = this.value().startDate;
    return isPlainDate(start) ? `Every week on ${weekdayOf(start)}` : 'Every week';
  });
  protected readonly monthlyLabel = computed(() => {
    const start = this.value().startDate;
    return isPlainDate(start) ? `Every month on the ${ordinal(Number(start.slice(8)))}` : 'Every month';
  });
  /** How the series repeats, from the menu (or Custom's every/unit/days). */
  protected readonly rule = computed<RepeatRule>(() => {
    const v = this.value();
    switch (v.repeat) {
      case 'daily':
        return { frequency: 'Daily', interval: 1, days: [] };
      case 'weekly':
        return { frequency: 'Weekly', interval: 1, days: isPlainDate(v.startDate) ? [weekdayOf(v.startDate)] : [] };
      case 'monthly':
        return { frequency: 'Monthly', interval: 1, days: [] };
      default: {
        const unit = v.unit ?? 'Weekly';
        return { frequency: unit, interval: Number(v.every ?? 1), days: unit === 'Weekly' ? (v.repeatDays ?? []) : [] };
      }
    }
  });
  protected readonly endsOnDate = computed(() => this.value().ends === 'date');

  /**
   * While it repeats, each date is one day (owner decision, October 23, 2026; #259): the End date follows the start
   * and can't be changed, so it can't be mistaken for when the repeat ends (which made every date run into the next).
   * How long each date lasts comes from All day or the times; which days, how often and until when come from Repeat.
   * Not repeating any more makes the End date free again, starting from the start.
   */
  private readonly endFollowsStart = effect(() => {
    const repeating = this.repeats();
    const start = this.value().startDate ?? '';
    untracked(() => {
      const end = this.form.controls.endDate;
      if (repeating) {
        if (end.value !== start) {
          end.setValue(start);
        }
        if (end.enabled) {
          end.disable();
        }
      } else if (end.disabled) {
        end.enable();
      }
    });
  });
  /** The dates the series will have, as the server will make them. */
  protected readonly dates = computed(() => {
    const v = this.value();
    if (!this.repeats() || !v.startDate) {
      return [];
    }
    return seriesDates(
      v.startDate,
      this.rule(),
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
          ? `This is your parenting time. ${coParent} needs to approve it. Until they accept, it shows as pending and isn’t on the schedule.`
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

  ngOnInit(): void {
    void this.initialize();
  }

  private async initialize(): Promise<void> {
    const wanted = KINDS.find((k) => k.id === this.kind());
    if (wanted) {
      this.creating.set(wanted.id);
    }
    // No days before today (#232): a tap on an earlier day starts on today instead, at no particular time.
    const asked = isDate(this.date()) ? this.date()! : null;
    const start = asked && asked >= this.today() ? asked : this.today();
    this.form.patchValue({ startDate: start, endDate: start });
    const slot = asked === start ? this.slotTime() : null;
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

  /** Custom by the week starts with the first date's weekday chosen. */
  protected chooseRepeat(): void {
    const v = this.form.getRawValue();
    if (v.repeat === 'custom' && v.unit === 'Weekly' && v.repeatDays.length === 0 && isPlainDate(v.startDate)) {
      this.form.patchValue({ repeatDays: [weekdayOf(v.startDate)] });
    }
  }

  /** A new unit keeps "every" within what it allows (1 to 99 for every unit, #238). */
  protected chooseUnit(): void {
    const v = this.form.getRawValue();
    if (v.every > MAX_INTERVAL[v.unit]) {
      this.form.patchValue({ every: MAX_INTERVAL[v.unit] });
    }
    this.chooseRepeat();
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

  protected async submit(allowOverlap = false): Promise<void> {
    const type = this.type();
    const family = this.family();
    if (!type || !family || this.busy()) {
      return;
    }
    const key = this.availabilityKey();
    const consent = allowOverlap && this.pendingAvailability() === key;
    this.pendingAvailability.set(null);
    // Clear the last attempt's messages first, so only this attempt's problem is shown and focused.
    this.error.set(null);
    const errors = this.validate(type);
    this.fieldErrors.set(errors);
    this.dateCheck.tried();
    if (Object.keys(errors).length > 0) {
      this.form.markAllAsTouched();
      this.revealProblem();
      return;
    }

    this.busy.set(true);
    this.error.set(null);
    try {
      const request = this.request(type);
      if (type === 'family' && this.coParent() && !consent) {
        this.checkingAvailability.set(true);
        const events = await this.api.calendarEvents(family.id, request.startsAt, request.endsAt);
        this.checkingAvailability.set(false);
        // The parent may keep editing while the check runs. Never send or confirm an older draft.
        if (key !== this.availabilityKey()) return;
        const otherParents = this.parents().filter((p) => !p.isYou).map((p) => p.membershipId);
        if (events.some((e) => e.category === 'Unavailable' && e.status === 'Confirmed'
          && otherParents.includes(e.ownerMembershipId) && Date.parse(e.startsAt) < Date.parse(request.endsAt) && Date.parse(e.endsAt) > Date.parse(request.startsAt))) {
          this.pendingAvailability.set(key);
          afterNextRender(() => this.host.nativeElement.querySelector<HTMLElement>('#availability-heading')?.focus(), { injector: this.injector });
          return;
        }
      }
      const created = await this.api.createEvent(family.id, request);
      const coParent = this.coParent() ?? 'your co-parent';
      const count = this.repeats() ? this.dates().length : 1;
      const head =
        created.status === 'PendingApproval'
          ? count > 1
            ? `Sent to ${coParent} for approval: “${created.title}” on ${count} dates. They show as pending until they accept.`
            : `Sent to ${coParent} for approval. “${created.title}” shows as pending until they accept.`
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
        this.dateCheck.fromServer(serverErrors);
      } else {
        this.error.set(generalMessage(problem));
      }
      this.revealProblem();
    } finally {
      this.checkingAvailability.set(false);
      this.busy.set(false);
    }
  }

  private availabilityKey(): string {
    const type = this.type();
    return JSON.stringify({ family: this.family()?.id, parents: this.parents().map((p) => p.membershipId), type, values: this.form.getRawValue() });
  }

  protected sendAnyway(): void {
    void this.submit(true);
  }

  protected chooseDifferentDates(): void {
    this.pendingAvailability.set(null);
    afterNextRender(() => this.host.nativeElement.querySelector<HTMLElement>('#add-start-date')?.focus(), { injector: this.injector });
  }

  protected fieldError(name: string): string | null {
    return this.fieldErrors()[name] ?? null;
  }

  private validate(type: EventType): Record<string, string> {
    const v = typedValues(this.form);
    const errors: Record<string, string> = {};
    if (type !== 'unavailable' && type !== 'parenting' && !v.title.trim()) {
      errors['title'] = 'Enter a title.';
    }
    Object.assign(errors, rangeProblems(v, this.today(), [], this.timeZone()));
    if (this.repeats()) {
      const rule = this.rule();
      if (!(Number.isInteger(rule.interval) && rule.interval >= 1 && rule.interval <= MAX_INTERVAL[rule.frequency])) {
        errors['repeatInterval'] = `Choose every 1 to ${MAX_INTERVAL[rule.frequency]}.`;
      } else if (rule.frequency === 'Weekly' && rule.days.length === 0) {
        errors['repeat'] = 'Choose the days it repeats on.';
      } else if (v.ends === 'date' && v.repeatUntil && !isPlainDate(v.repeatUntil)) {
        errors['repeatUntil'] = UNREADABLE_DATE;
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
            ...this.rule(),
            ...(v.ends === 'date' ? { until: v.repeatUntil } : { count: v.repeatCount }),
          }
        : undefined,
    };
  }
}
