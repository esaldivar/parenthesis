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
  signal,
  untracked,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { NgTemplateOutlet } from '@angular/common';
import { Router, RouterLink } from '@angular/router';
import { Api, CalendarEvent, CalendarWarning, Child, FamilyMember } from '../../core/api/api';
import { generalMessage, toProblem } from '../../core/api/problem';
import { AuthStore } from '../../core/auth/auth.store';
import { Icon } from '../../shared/icon/icon';
import { FORM_STYLES } from '../auth/form-styles';
import { LocalDateTime } from '../dashboard/model';
import { addDays, dayLong, todayIn } from '../dashboard/week';
import { dayFilter, END_BEFORE_START } from './date-rules';
import { DateCheck } from './date-check';
import { DateField } from './date-field';
import { providePlainDates, typedValues } from './plain-dates';
import { warningText } from './add-event-page';
import { CalendarItem, toItems } from './calendar-items';
import { whenText } from './item-text';
import { CAREGIVER_UNAVAILABLE, caregiverUnavailableText } from './own-overlap';
import { fromFamilyLocal, lastDate } from './time';

type Step = 'choose' | 'review' | 'sent';
type LoadState = 'loading' | 'error' | 'ready';

export const REASON_MAX = 500;

/** Warnings that ask "Send anyway or choose different dates?". Overlapping parenting time is expected in a swap. */
const ASK_FIRST: readonly CalendarWarning[] = ['OverlapsCoParentUnavailable'];

/**
 * Request Swap (handoff 2026-10-20, board of October 21): propose new dates and times for confirmed parenting time,
 * review current against proposed, and send. The other parent approves or declines; nothing on the calendar changes
 * until they approve. If they marked the new time as unavailable, the parent chooses: Send Anyway or Choose
 * Different Dates. A swap changes dates and times only; the children and the parent stay as they are.
 */
@Component({
  selector: 'app-swap-request-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    DateField,
    NgTemplateOutlet,
    ReactiveFormsModule,
    RouterLink,
    MatButtonModule,
    MatFormFieldModule,
    MatInputModule,
    MatSlideToggleModule,
    MatDatepickerModule,
    Icon,
  ],
  providers: [providePlainDates()],
  templateUrl: './swap-request-page.html',
  styleUrls: ['./swap-request-page.scss'],
  styles: [FORM_STYLES],
})
export class SwapRequestPage {
  private readonly api = inject(Api);
  private readonly auth = inject(AuthStore);
  private readonly router = inject(Router);
  private readonly injector = inject(Injector);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  /** The `:eventId` route parameter. */
  readonly eventId = input.required<string>();

  protected readonly reasonMax = REASON_MAX;
  protected readonly family = this.auth.currentFamily;
  private readonly timeZone = computed(() => this.family()?.timeZone ?? 'UTC');

  protected readonly state = signal<LoadState>('loading');
  protected readonly loadError = signal<string | null>(null);
  private readonly event = signal<CalendarEvent | null>(null);
  private readonly members = signal<readonly FamilyMember[]>([]);
  private readonly children = signal<readonly Child[]>([]);
  private readonly reloads = signal(0);

  protected readonly step = signal<Step>('choose');
  protected readonly busy = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly datesError = signal<string | null>(null);
  protected readonly reasonError = signal<string | null>(null);
  /** Set after Continue when the new time clashes with someone's unavailable time: the parent chooses what to do. */
  protected readonly clash = signal<readonly CalendarWarning[]>([]);
  /** Notes that don't need a choice, shown on the review step. */
  protected readonly notes = signal<readonly CalendarWarning[]>([]);

  protected readonly form = inject(NonNullableFormBuilder).group({
    allDay: [false],
    startDate: ['', Validators.required],
    startTime: ['09:00'],
    endDate: ['', Validators.required],
    endTime: ['17:00'],
    reason: ['', Validators.maxLength(REASON_MAX)],
  });
  private readonly value = toSignal(this.form.valueChanges, { initialValue: this.form.getRawValue() });
  protected readonly allDay = computed(() => this.value().allDay ?? false);
  /** Today in the family's time zone (#232): new dates start from here. */
  protected readonly today = computed(() => todayIn(this.timeZone(), new Date()));
  /** The parenting time's current dates, which it may keep (an arrangement already under way keeps its start). */
  private readonly ownDates = computed(() => {
    const item = this.item();
    return item ? [item.firstDate, item.lastDate] : [];
  });
  /** The calendar's open days: from today, or the event's own days (#232). The dates are checked instead (#248). */
  // One function for the page's life: a new one per change would make the picker re-check its dates without end.
  protected readonly dayFilter = (day: string | null): boolean => dayFilter(this.today(), this.ownDates())(day);
  protected readonly endBeforeStart = END_BEFORE_START;
  /** Which date shows red, and why (#248). */
  protected readonly dateCheck = new DateCheck(
    () => (this.value(), typedValues(this.form)),
    () => this.today(),
    () => this.ownDates(),
  );
  protected readonly reasonLength = computed(() => (this.value().reason ?? '').length);

  protected readonly item = computed<CalendarItem | null>(() => {
    const event = this.event();
    return event ? toItems([event], this.members(), this.children(), this.timeZone())[0] : null;
  });
  /** The parent who has the children in this parenting time; a swap keeps them. */
  private readonly caregiver = computed(() => this.members().find((m) => m.membershipId === this.event()?.caregiverMembershipId));

  protected readonly coParent = computed(
    () => this.members().find((m) => m.role === 'Parent' && !m.isYou)?.displayName ?? null,
  );
  protected readonly otherParent = computed(() => this.coParent() ?? 'your co-parent');

  /** Why this event can't be swapped, if it can't. */
  protected readonly blocked = computed(() => {
    const event = this.event();
    if (!event) {
      return null;
    }
    if (event.category !== 'ParentingTime') {
      return 'Only parenting time can be swapped.';
    }
    if (event.status !== 'Confirmed' || event.pendingChange !== 'None') {
      return 'It already has a request waiting for an answer. Withdraw it, or wait for the answer, before asking for a swap.';
    }
    if (!this.coParent()) {
      return 'A swap needs your co-parent’s approval, so you can ask for one once they’ve joined.';
    }
    return null;
  });

  /** The proposed times in the family's time zone. `end` is exclusive. */
  protected readonly proposedTimes = computed(() => {
    const v = this.value();
    const allDay = v.allDay ?? false;
    const start: LocalDateTime = allDay ? `${v.startDate}T00:00` : `${v.startDate}T${v.startTime}`;
    const end: LocalDateTime = allDay ? `${addDays(v.endDate ?? '', 1)}T00:00` : `${v.endDate}T${v.endTime}`;
    return { start, end, allDay };
  });

  /** The event as it would read after the swap, for the review and confirmation. */
  protected readonly proposed = computed<CalendarItem | null>(() => {
    const item = this.item();
    if (!item || this.step() === 'choose') {
      return null;
    }
    const { start, end, allDay } = this.proposedTimes();
    const first = start.slice(0, 10);
    const last = lastDate(start, end);
    return { ...item, start, end, allDay, firstDate: first, lastDate: last, spansDays: allDay || last > first };
  });

  protected readonly clashText = computed(() =>
    this.clash().map((w) => warningText(w, this.coParent())),
  );
  protected readonly noteText = computed(() => this.notes().map((w) => warningText(w, this.coParent())));

  /** "Sunday, October 19 · 8:00 AM – 3:00 PM", or just the range when it spans several dates. */
  protected describe(item: CalendarItem): string {
    return item.lastDate > item.firstDate ? whenText(item) : `${dayLong(item.firstDate)} · ${whenText(item)}`;
  }

  protected childNames(item: CalendarItem): string {
    return item.children.map((c) => c.name).join(', ');
  }

  constructor() {
    effect(() => {
      const family = this.family();
      const id = this.eventId();
      this.reloads();
      if (family) {
        untracked(() => void this.load(family.id, id));
      }
    });

    // Changing the dates after a warning asks again on Continue.
    effect(() => {
      this.value();
      untracked(() => {
        this.clash.set([]);
        this.datesError.set(null);
      });
    });
  }

  private async load(familyId: string, eventId: string): Promise<void> {
    this.state.set('loading');
    try {
      const [event, details, children] = await Promise.all([
        this.api.calendarEvent(familyId, eventId),
        this.api.family(familyId),
        this.api.children(familyId),
      ]);
      this.members.set(details.members);
      this.children.set(children);
      this.event.set(event);
      const item = this.item()!;
      this.form.reset({
        allDay: item.allDay,
        startDate: item.firstDate,
        startTime: item.allDay ? '09:00' : item.start.slice(11),
        endDate: item.lastDate,
        endTime: item.allDay ? '17:00' : item.end.slice(11),
        reason: '',
      });
      this.state.set('ready');
    } catch (error) {
      const problem = toProblem(error);
      this.loadError.set(problem.status === 404 ? 'We couldn’t find that parenting time. It may have been cancelled.' : generalMessage(problem));
      this.state.set('error');
    }
  }

  protected retry(): void {
    this.reloads.update((n) => n + 1);
  }

  /** Checks the dates, then asks the server whether they clash with anyone's unavailable time. Nothing is saved. */
  protected async continue(): Promise<void> {
    const family = this.family();
    const event = this.event();
    if (!family || !event || this.busy()) {
      return;
    }
    // An invalid date is only red, with its reason for screen readers (#248): Continue stops on it.
    this.dateCheck.tried();
    if (Object.keys(this.dateCheck.problems()).length > 0) {
      this.datesError.set(null);
      this.focus('input[aria-invalid="true"]');
      return;
    }
    const problem = this.validate(event);
    this.datesError.set(problem.dates);
    this.reasonError.set(problem.reason);
    if (problem.dates || problem.reason) {
      this.focus(problem.dates ? '#swap-start-date' : '#swap-reason');
      return;
    }

    this.busy.set(true);
    this.error.set(null);
    try {
      const { startsAt, endsAt } = this.instants();
      const { warnings } = await this.api.eventConflicts(family.id, event.id, startsAt, endsAt);
      if (warnings.includes('CaregiverUnavailable')) {
        // The parent with the children can't be unavailable then (#210): no Send anyway, the dates must change.
        this.datesError.set(caregiverUnavailableText(this.caregiver(), true));
        this.focus('#swap-start-date');
        return;
      }
      this.notes.set(warnings.filter((w) => !ASK_FIRST.includes(w)));
      const clash = warnings.filter((w) => ASK_FIRST.includes(w));
      if (clash.length > 0) {
        this.clash.set(clash);
        this.focus('#swap-clash-heading');
      } else {
        this.goTo('review');
      }
    } catch (error) {
      this.error.set(generalMessage(toProblem(error)));
    } finally {
      this.busy.set(false);
    }
  }

  protected sendAnyway(): void {
    this.clash.set([]);
    this.goTo('review');
  }

  protected chooseDifferentDates(): void {
    this.clash.set([]);
    this.focus('#swap-start-date');
  }

  protected back(): void {
    this.goTo('choose');
  }

  protected async send(): Promise<void> {
    const family = this.family();
    const event = this.event();
    if (!family || !event || this.busy()) {
      return;
    }
    this.busy.set(true);
    this.error.set(null);
    try {
      const { startsAt, endsAt } = this.instants();
      const reason = this.form.getRawValue().reason.trim();
      const result = await this.api.updateEvent(family.id, event.id, {
        startsAt,
        endsAt,
        allDay: this.allDay(),
        reason: reason || undefined,
      });
      if (result.pendingChange === 'Modify') {
        this.goTo('sent');
      } else {
        // Applied at once (the co-parent left meanwhile): say so plainly.
        await this.router.navigate(['/calendar'], {
          queryParams: { date: this.proposedTimes().start.slice(0, 10) },
          state: { calendarNotice: `“${result.title}” was updated.` },
        });
      }
    } catch (error) {
      const problem = toProblem(error);
      const fields = Object.entries(problem.errors).flatMap(([key, messages]) =>
        key === CAREGIVER_UNAVAILABLE ? [caregiverUnavailableText(this.caregiver(), true)] : messages,
      );
      this.error.set(
        fields.length > 0
          ? fields.join(' ')
          : problem.detail
            ? `${problem.title ?? ''} ${problem.detail}`.trim()
            : generalMessage(problem),
      );
    } finally {
      this.busy.set(false);
    }
  }

  private instants(): { startsAt: string; endsAt: string } {
    const { start, end } = this.proposedTimes();
    const zone = this.timeZone();
    return { startsAt: fromFamilyLocal(start, zone), endsAt: fromFamilyLocal(end, zone) };
  }

  private validate(event: CalendarEvent): { dates: string | null; reason: string | null } {
    const v = typedValues(this.form);
    const reason = v.reason.trim().length > REASON_MAX ? `Keep the reason under ${REASON_MAX} characters.` : null;
    // The dates themselves were checked before this (#248).
    if (!v.allDay && (!v.startTime || !v.endTime)) {
      return { dates: 'Choose when the new time starts and ends.', reason };
    }
    const { startsAt, endsAt } = this.instants();
    if (
      new Date(startsAt).getTime() === new Date(event.startsAt).getTime() &&
      new Date(endsAt).getTime() === new Date(event.endsAt).getTime() &&
      v.allDay === event.allDay
    ) {
      return { dates: 'Choose dates or times that are different from the current ones.', reason };
    }
    return { dates: null, reason };
  }

  /** Each step starts at its heading, so keyboard and screen-reader users land on the new content. */
  private goTo(step: Step): void {
    this.step.set(step);
    this.focus('h1');
  }

  private focus(selector: string): void {
    afterNextRender(() => this.host.nativeElement.querySelector<HTMLElement>(selector)?.focus(), { injector: this.injector });
  }
}
