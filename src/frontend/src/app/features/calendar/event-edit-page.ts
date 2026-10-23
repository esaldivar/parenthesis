import { ChangeDetectionStrategy, Component, DestroyRef, OnInit, computed, inject, input, signal, ElementRef, Injector, afterNextRender } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { Router, RouterLink } from '@angular/router';
import { Api, CalendarCategory, CalendarEvent, CalendarEventChange, EditScope, FamilyMember } from '../../core/api/api';
import { generalMessage, toProblem } from '../../core/api/problem';
import { AuthStore } from '../../core/auth/auth.store';
import { FORM_STYLES } from '../auth/form-styles';
import { addDays, dayLong, todayIn } from '../dashboard/week';
import { warningText } from './add-event-page';
import { repeatText } from './series';
import { withOwnOverlap } from './own-overlap';
import { revealFirstProblem } from './reveal-problem';
import { keepRangeInOrder, MAX_RANGE_DAYS, rangeFilter, rangeProblems } from './date-rules';
import { providePlainDates, typedValues } from './plain-dates';
import { fromFamilyLocal, lastDate, toFamilyLocal } from './time';

/** The categories that change only with both parents' agreement (the server decides; this only explains it). */
const NEEDS_BOTH: readonly CalendarCategory[] = ['ParentingTime', 'Holiday', 'Joint'];

/**
 * Edit one event (#188): its title, when, where, notes and, for parenting time, who has the children. Approval follows
 * the product rules, never a switch: for parenting time, holidays and family events, a change to anything but the
 * notes goes to the other parent, and the event stays as it is ("Change pending") until they answer; anything else
 * changes at once. The form says which will happen before saving. The type and the children can't change here.
 */
@Component({
  selector: 'app-event-edit-page',
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
  templateUrl: './event-edit-page.html',
  styleUrl: './add-event-page.scss',
  styles: [FORM_STYLES],
})
export class EventEditPage implements OnInit {
  private readonly api = inject(Api);
  private readonly injector = inject(Injector);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly router = inject(Router);
  protected readonly family = inject(AuthStore).currentFamily;
  private readonly timeZone = computed(() => this.family()?.timeZone ?? 'UTC');

  /** The `:eventId` route parameter. */
  readonly eventId = input.required<string>();

  protected readonly event = signal<CalendarEvent | null>(null);
  protected readonly members = signal<readonly FamilyMember[]>([]);
  protected readonly loadError = signal<string | null>(null);
  protected readonly busy = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly fieldErrors = signal<Readonly<Record<string, string>>>({});

  protected readonly form = inject(NonNullableFormBuilder).group({
    title: ['', Validators.maxLength(120)],
    caregiver: [''],
    allDay: [false],
    startDate: ['', Validators.required],
    startTime: ['09:00'],
    endDate: ['', Validators.required],
    endTime: ['10:00'],
    location: ['', Validators.maxLength(200)],
    notes: ['', Validators.maxLength(1000)],
  });
  private readonly value = toSignal(this.form.valueChanges, { initialValue: this.form.getRawValue() });
  protected readonly allDay = computed(() => this.value().allDay ?? false);
  /** Today in the family's time zone (#232). */
  protected readonly today = computed(() => todayIn(this.timeZone(), new Date()));
  /** The event's own dates: an event already in the past or under way can keep them (owner decision, #232). */
  private readonly ownDates = computed(() => {
    const loaded = this.loaded();
    return loaded ? [loaded['startDate'] as string, loaded['endDate'] as string] : [];
  });
  /** The range calendar's open days: from today (or the event's own dates), up to the longest an event lasts. */
  // One function for the page's life, reading the dates when called: a new one per keystroke would make the picker
  // re-check the dates, which changes them again, without end.
  protected readonly dayFilter = (day: string | null): boolean => {
    const v = this.form.getRawValue();
    return rangeFilter(this.today(), this.ownDates(), v.startDate || null, v.endDate || null, MAX_RANGE_DAYS)(day);
  };

  constructor() {
    keepRangeInOrder(this.form, inject(DestroyRef));
  }

  protected readonly category = computed(() => this.event()?.category ?? null);
  protected readonly unavailable = computed(() => this.category() === 'Unavailable');
  protected readonly parenting = computed(() => this.category() === 'ParentingTime');
  protected readonly parents = computed(() => this.members().filter((m) => m.role === 'Parent'));
  protected readonly coParent = computed(() => this.parents().find((m) => !m.isYou)?.displayName ?? null);
  /** Whether a change (other than the notes) waits for the other parent. */
  protected readonly needsApproval = computed(() => {
    const category = this.category();
    return !!category && NEEDS_BOTH.includes(category) && !!this.coParent();
  });
  /** Why it can't be edited right now, if so. The details only offer Edit when it can, but links can be stale. */
  protected readonly blocked = computed(() => {
    const event = this.event();
    if (!event) {
      return null;
    }
    if (event.status === 'PendingApproval' || event.pendingChange !== 'None') {
      return 'This event has a request waiting for an answer. Wait for it, or withdraw it, before changing the event again.';
    }
    return event.status === 'Confirmed' ? null : 'This event can’t be changed any more.';
  });
  /** The form as loaded, to tell a change that needs approval from a notes-only one. */
  private readonly loaded = signal<Readonly<Record<string, unknown>> | null>(null);
  /** Something other than the notes changed (only that can need approval). */
  protected readonly materialChange = computed(() => {
    const loaded = this.loaded();
    const now: Readonly<Record<string, unknown>> = this.value();
    return !!loaded && Object.keys(loaded).some((k) => k !== 'notes' && now[k] !== loaded[k]);
  });
  /** A repeating event (#193): which dates the change applies to. */
  protected readonly scope = signal<EditScope>('this');
  protected readonly scopes: readonly { id: EditScope; label: string }[] = [
    { id: 'this', label: 'This event' },
    { id: 'following', label: 'This and following' },
    { id: 'all', label: 'All events' },
  ];
  protected readonly repeats = computed(() => {
    const repeat = this.event()?.repeat;
    return repeat ? repeatText(repeat) : null;
  });

  /** Several dates keep their own days: only times, title, place and notes change, so the dates are fixed. */
  protected setScope(scope: EditScope): void {
    this.scope.set(scope);
    const loaded = this.loaded();
    const dates = [this.form.controls.startDate, this.form.controls.endDate];
    if (scope === 'this') {
      dates.forEach((c) => c.enable());
    } else {
      if (loaded) {
        this.form.patchValue({ startDate: loaded['startDate'] as string, endDate: loaded['endDate'] as string });
      }
      dates.forEach((c) => c.disable());
    }
  }

  protected readonly note = computed(() =>
    this.needsApproval()
      ? `Changes to the title, date, time, place${this.parenting() ? ' or who has the children' : ''} go to ${this.coParent()} for approval. Until they answer, the event stays as it is and shows “Change pending”. Notes change at once.`
      : this.unavailable()
        ? `Changes apply at once. ${this.coParent() ?? 'Your co-parent'} sees only “Unavailable”; your note stays private to you.`
        : 'Changes apply at once, for both of you.',
  );

  async ngOnInit(): Promise<void> {
    const family = this.family();
    if (!family) {
      return;
    }
    try {
      const [event, details] = await Promise.all([this.api.calendarEvent(family.id, this.eventId()), this.api.family(family.id)]);
      this.members.set(details.members);
      this.fill(event);
      this.event.set(event);
    } catch (error) {
      const problem = toProblem(error);
      this.loadError.set(problem.status === 404 ? 'We couldn’t find that event. It may have been cancelled.' : generalMessage(problem));
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
    const event = this.event();
    if (!family || !event || this.busy() || this.blocked()) {
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
      const scope = this.scope();
      const saved = await this.api.updateEvent(family.id, event.id, this.change(), scope);
      const coParent = this.coParent() ?? 'your co-parent';
      const head =
        saved.pendingChange === 'Modify'
          ? `Sent to ${coParent} for approval. “${event.title}” stays as it is until they answer.`
          : scope === 'all'
            ? `Every date of “${saved.title}” was updated.`
            : scope === 'following'
              ? `“${saved.title}” was updated from ${dayLong(this.form.getRawValue().startDate)} on.`
              : `“${saved.title}” was updated.`;
      const notes = saved.warnings.map((w) => warningText(w, this.coParent()));
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
        this.error.set(problem.detail ? `${problem.title ?? ''} ${problem.detail}`.trim() : generalMessage(problem));
      }
      this.revealProblem();
    } finally {
      this.busy.set(false);
    }
  }

  /** Back to the calendar on the event's day. */
  protected readonly back = computed(() => this.form.controls.startDate.value || null);

  private fill(event: CalendarEvent): void {
    const zone = this.timeZone();
    const start = toFamilyLocal(event.startsAt, zone);
    const end = toFamilyLocal(event.endsAt, zone);
    this.form.patchValue({
      title: event.category === 'Unavailable' ? '' : event.title,
      caregiver: event.caregiverMembershipId ?? '',
      allDay: event.allDay,
      startDate: start.slice(0, 10),
      startTime: event.allDay ? '09:00' : start.slice(11),
      // An all-day event ends at midnight after its last day; the form shows the last day itself.
      endDate: event.allDay ? lastDate(start, end) : end.slice(0, 10),
      endTime: event.allDay ? '10:00' : end.slice(11),
      location: event.location ?? '',
      notes: event.notes ?? '',
    });
    this.loaded.set(this.form.getRawValue());
  }

  private validate(): Record<string, string> {
    const v = typedValues(this.form);
    const errors: Record<string, string> = {};
    if (!this.unavailable() && !this.parenting() && !v.title.trim()) {
      errors['title'] = 'Enter a title.';
    }
    Object.assign(errors, rangeProblems(v, this.today(), this.ownDates()));
    if (this.parenting() && !v.caregiver) {
      errors['caregiverMembershipId'] = 'Choose which parent has the children.';
    }
    return errors;
  }

  /**
   * The whole event as edited; the server works out what changed and whether it needs approval. For several dates of
   * a repeating event, only what changed, so each date keeps anything it has of its own.
   */
  private change(): CalendarEventChange {
    const v = this.form.getRawValue();
    const zone = this.timeZone();
    const loaded = this.loaded();
    if (this.scope() !== 'this' && loaded) {
      const changed = (...keys: string[]) => keys.some((k) => (v as Record<string, unknown>)[k] !== loaded[k]);
      return {
        ...(changed('title') && !this.unavailable() ? { title: v.title.trim() || undefined } : {}),
        ...(changed('allDay', 'startTime', 'endTime')
          ? {
              allDay: v.allDay,
              startsAt: fromFamilyLocal(v.allDay ? `${v.startDate}T00:00` : `${v.startDate}T${v.startTime}`, zone),
              endsAt: fromFamilyLocal(v.allDay ? `${addDays(v.endDate, 1)}T00:00` : `${v.endDate}T${v.endTime}`, zone),
            }
          : {}),
        ...(changed('location') && !this.unavailable() ? { location: v.location.trim() } : {}),
        ...(changed('notes') ? { notes: v.notes.trim() } : {}),
      };
    }
    return {
      // A blank title keeps the current one (parenting time and unavailable time have a default).
      title: this.unavailable() ? undefined : v.title.trim() || undefined,
      allDay: v.allDay,
      startsAt: fromFamilyLocal(v.allDay ? `${v.startDate}T00:00` : `${v.startDate}T${v.startTime}`, zone),
      endsAt: fromFamilyLocal(v.allDay ? `${addDays(v.endDate, 1)}T00:00` : `${v.endDate}T${v.endTime}`, zone),
      // An empty location or note clears it.
      location: this.unavailable() ? undefined : v.location.trim(),
      notes: v.notes.trim(),
      caregiverMembershipId: this.parenting() ? v.caregiver : undefined,
    };
  }
}
