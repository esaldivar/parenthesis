import { LocaleService } from '../../core/i18n/locale.service';
import { AppDatePipe } from '../../core/i18n/locale-formatting';
import { TranslatePipe, TranslationKey, translate } from '../../core/i18n/translations';
import { DOCUMENT } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  ElementRef,
  InjectionToken,
  OnInit,
  inject,
  input,
  signal,
  viewChild,
} from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatSelectModule } from '@angular/material/select';
import { Api, GoogleCalendarStatus, GoogleCopyType } from '../../core/api/api';
import { generalMessage, toProblem } from '../../core/api/problem';
import { Toasts } from '../../shared/toast/toasts';

/** Leaves the app for Google's consent page. Tests replace it. */
export const OPEN_EXTERNAL = new InjectionToken<(url: string) => void>('OPEN_EXTERNAL', {
  factory: () => {
    const document = inject(DOCUMENT);
    return (url: string) => document.location.assign(url);
  },
});

/**
 * A parent's own one-way copy of the family calendar to Google Calendar (#386), under Settings rather than on the
 * calendar (owner decision, October 30, 2026): nothing from Google is shown in Parenthesis. Connecting or
 * disconnecting changes only this parent's Google account.
 */
@Component({
  selector: 'app-google-calendar-settings',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [TranslatePipe, AppDatePipe, MatButtonModule, MatFormFieldModule, MatSelectModule],
  template: `
    @if (error(); as error) {
      <p class="alert" role="alert">{{ error }}</p>
    }

    @if (status(); as status) {
      @if (!status.available) {
        <p class="muted">{{ 'feature.copying.events.to.google.calendar.isn.t' | tr }}</p>
      } @else {
        <p>
          {{ 'feature.add.your.family.s.confirmed.events.to' | tr }}{{ status.calendarName }}{{ 'feature.calendar.in.your.google.account.it.s' | tr }}
        </p>
        <ul class="facts">
          <li>{{ 'feature.requests.still.waiting.for.approval.aren.t' | tr }}</li>
          <li>
            {{ 'feature.changes.and.cancellations.follow.within.a.few' | tr }}
          </li>
          <li>{{ 'feature.only.your.google.calendar.is.affected.your' | tr }}</li>
        </ul>

        @switch (status.state) {
          @case ('Connected') {
            <p class="state" role="status">
              <strong>{{ 'feature.connected' | tr }}</strong>
              @if (status.lastSyncedAt) {
                {{ 'feature.last.updated' | tr }} {{ status.lastSyncedAt | appDate: 'MMM d, h:mm a' }}.
              } @else {
                {{ 'feature.your.events.will.appear.in.google.calendar' | tr }}
              }
            </p>
          }
          @case ('NeedsReconnect') {
            <p class="alert" role="alert">
              @if (status.problem === 'CalendarRemoved') {
                {{ 'feature.the' | tr }}{{ status.calendarName }}{{ 'feature.calendar.was.deleted.in.google.calendar.so' | tr }}
              } @else {
                {{ 'feature.parenthesis.can.t.reach.your.google.calendar' | tr }}
              }
            </p>
          }
        }

        @if (status.state !== 'NotConnected') {
          <mat-form-field class="types" appearance="outline" subscriptSizing="dynamic">
            <mat-label>{{ 'feature.events.to.copy' | tr }}</mat-label>
            <mat-select
              multiple
              [value]="selection()"
              [disabled]="saving()"
              (selectionChange)="selection.set($event.value)"
              (openedChange)="$event || saveTypes()"
              aria-describedby="google-types-hint"
            >
              <mat-select-trigger>{{ summary() }}</mat-select-trigger>
              @for (type of types; track type.value) {
                <mat-option [value]="type.value">{{ type.label | tr }}</mat-option>
              }
            </mat-select>
            <mat-hint id="google-types-hint"
              >{{ 'feature.only.your.google.calendar.changes.events.you' | tr }}</mat-hint
            >
          </mat-form-field>
          <p class="hint">{{ leftOut() }}</p>
          <p class="hint" role="status">{{ saved() }}</p>
        }

        @if (confirming()) {
          <div class="panel" role="group" aria-labelledby="google-disconnect-heading">
            <h3 id="google-disconnect-heading" #confirmHeading tabindex="-1">
              {{ 'feature.disconnect.google.calendar' | tr }}
            </h3>
            <p>
              {{ 'feature.parenthesis.stops.copying.events.and.removes.the' | tr }}{{ status.calendarName }}{{ 'feature.calendar.from.your.google.account.your.other' | tr }}
            </p>
            <div class="actions">
              <button mat-flat-button type="button" [disabled]="busy()" (click)="disconnect()">
                {{ busy() ? ('feature.disconnecting' | tr) : ('feature.disconnect.acfc5b' | tr) }}
              </button>
              <button mat-button type="button" [disabled]="busy()" (click)="confirming.set(false)">
                {{ 'feature.cancel' | tr }}
              </button>
            </div>
          </div>
        } @else {
          <div class="actions">
            @if (status.state !== 'Connected') {
              <button mat-flat-button type="button" [disabled]="busy()" (click)="connect()">
                {{
                  busy()
                    ? ('feature.opening.google' | tr)
                    : status.state === 'NeedsReconnect'
                      ? ('feature.reconnect.google.calendar' | tr)
                      : ('feature.connect.google.calendar' | tr)
                }}
              </button>
            }
            @if (status.state !== 'NotConnected') {
              <button
                mat-stroked-button
                type="button"
                [disabled]="busy()"
                (click)="askToDisconnect()"
              >
                {{ 'feature.disconnect' | tr }}
              </button>
            }
          </div>
        }
      }
    } @else if (!error()) {
      <p class="muted">{{ 'feature.loading' | tr }}</p>
    }
  `,
  styles: `
    :host {
      display: grid;
      gap: var(--space-3);
    }
    p,
    h3 {
      margin: 0;
    }
    h3 {
      font-size: var(--font-size-body);
    }
    .facts {
      margin: 0;
      padding-inline-start: var(--space-4);
      display: grid;
      gap: var(--space-1);
      color: var(--color-text-secondary);
    }
    .actions {
      display: flex;
      flex-wrap: wrap;
      gap: var(--space-2);
    }
    button {
      min-height: var(--target-min);
    }
    .panel {
      display: grid;
      gap: var(--space-2);
      padding: var(--space-3);
      border: 1px solid var(--color-divider);
      border-radius: var(--radius-control);
    }
    .types {
      width: 100%;
      max-width: 28rem;
    }
    .hint {
      color: var(--color-text-secondary);
    }
    .hint:empty {
      display: none;
    }
    .muted {
      color: var(--color-text-secondary);
    }
    .alert {
      padding: var(--space-3) var(--space-4);
      border: 1px solid var(--color-danger);
      border-radius: var(--radius-control);
      background: var(--color-status-rejected-bg);
    }
  `,
})
export class GoogleCalendarSettings implements OnInit {
  private readonly copyLocale = inject(LocaleService);
  private readonly api = inject(Api);
  private readonly toasts = inject(Toasts);
  private readonly openExternal = inject(OPEN_EXTERNAL);
  private readonly confirmHeading = viewChild<ElementRef<HTMLElement>>('confirmHeading');

  readonly familyId = input.required<string>();

  protected readonly status = signal<GoogleCalendarStatus | null>(null);
  protected readonly busy = signal(false);
  protected readonly confirming = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly saving = signal(false);
  protected readonly saved = signal('');
  /** What the list shows, saved when it closes. */
  protected readonly selection = signal<readonly GoogleCopyType[]>([]);

  /** In the calendar's order and words; the co-parent's unavailable time is off until a parent ticks it. */
  protected readonly types: readonly { value: GoogleCopyType; label: TranslationKey; short?: TranslationKey }[] = [
    { value: 'ParentingTime', label: 'feature.parenting.time' },
    { value: 'Joint', label: 'google.calendar.types.joint' },
    { value: 'School', label: 'feature.school' },
    { value: 'Medical', label: 'calendar.type.medical' },
    { value: 'Dental', label: 'calendar.type.dental' },
    { value: 'Activity', label: 'google.calendar.types.activities' },
    { value: 'Birthday', label: 'google.calendar.types.birthdays' },
    { value: 'Holiday', label: 'google.calendar.types.holidays' },
    { value: 'Other', label: 'google.calendar.types.other' },
    { value: 'MyUnavailable', label: 'google.calendar.types.ownUnavailable' },
    {
      value: 'CoParentUnavailable',
      label: 'google.calendar.types.parentUnavailable',
      short: 'google.calendar.types.parentUnavailableShort',
    },
  ];

  ngOnInit(): void {
    void this.initialize();
  }

  private async initialize(): Promise<void> {
    try {
      const status = await this.api.googleCalendar(this.familyId());
      this.status.set(status);
      this.selection.set(status.copyTypes);
    } catch (error) {
      this.error.set(generalMessage(toProblem(error)));
    }
  }

  protected async connect(): Promise<void> {
    this.busy.set(true);
    this.error.set(null);
    try {
      const { url } = await this.api.googleCalendarAuthorize(this.familyId());
      this.openExternal(url);
    } catch (error) {
      this.error.set(generalMessage(toProblem(error)));
      this.busy.set(false);
    }
  }

  /** "All event types" or "10 of 11 event types", short enough for a phone. */
  protected readonly summary = computed(() => {
    const chosen = this.selection().length;
    if (chosen === this.types.length) return translate('google.calendar.typesAll', this.copyLocale.locale());
    return chosen === 0 ? translate('google.calendar.typesNone', this.copyLocale.locale()) : translate('google.calendar.typesCount', this.copyLocale.locale(), { count: chosen, total: this.types.length });
  });

  /** What isn't copied, spelled out under the list while only a few are left out. */
  protected readonly leftOut = computed(() => {
    const chosen = this.selection();
    const missing = this.types
      .filter((t) => !chosen.includes(t.value))
      .map((t) => translate(t.short ?? t.label, this.copyLocale.locale()).toLocaleLowerCase(this.copyLocale.locale()));
    return missing.length === 0 || missing.length > 3 || chosen.length === 0
      ? ''
      : translate('google.calendar.typesExcluded', this.copyLocale.locale(), { types: missing.join(', ') });
  });

  /** Saves when the list closes, if anything changed. */
  protected async saveTypes(): Promise<void> {
    const current = this.status();
    const next = this.selection();
    if (
      !current ||
      (next.length === current.copyTypes.length && next.every((t) => current.copyTypes.includes(t)))
    ) {
      return;
    }
    this.saving.set(true);
    this.error.set(null);
    this.saved.set('');
    try {
      const saved = await this.api.googleCalendarCopyTypes(this.familyId(), next);
      this.status.set(saved);
      this.selection.set(saved.copyTypes);
      this.saved.set(translate('google.calendar.saved', this.copyLocale.locale()));
    } catch (error) {
      // Show the choice as it was last saved.
      this.selection.set(current.copyTypes);
      this.error.set(generalMessage(toProblem(error)));
    } finally {
      this.saving.set(false);
    }
  }

  protected askToDisconnect(): void {
    this.confirming.set(true);
    // Move focus to the question so keyboard and screen-reader users land on it.
    setTimeout(() => this.confirmHeading()?.nativeElement.focus());
  }

  protected async disconnect(): Promise<void> {
    this.busy.set(true);
    this.error.set(null);
    try {
      await this.api.googleCalendarDisconnect(this.familyId());
      this.status.update(
        (s) =>
          s && {
            ...s,
            state: 'NotConnected',
            problem: 'None',
            connectedAt: null,
            lastSyncedAt: null,
          },
      );
      this.confirming.set(false);
      this.toasts.show(translate('google.calendar.disconnected', this.copyLocale.locale()));
    } catch (error) {
      this.error.set(generalMessage(toProblem(error)));
    } finally {
      this.busy.set(false);
    }
  }
}
