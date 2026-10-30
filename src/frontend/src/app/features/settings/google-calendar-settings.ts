import { DatePipe, DOCUMENT } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  InjectionToken,
  OnInit,
  inject,
  input,
  signal,
  viewChild,
} from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatCheckboxChange, MatCheckboxModule } from '@angular/material/checkbox';
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
  imports: [DatePipe, MatButtonModule, MatCheckboxModule],
  template: `
    @if (error(); as error) {
      <p class="alert" role="alert">{{ error }}</p>
    }

    @if (status(); as status) {
      @if (!status.available) {
        <p class="muted">Copying events to Google Calendar isn’t available yet.</p>
      } @else {
        <p>
          Add your family’s confirmed events to a separate “{{ status.calendarName }}” calendar in
          your Google account. It’s one way: Parenthesis never reads your Google Calendar or brings
          anything from it into the family calendar.
        </p>
        <ul class="facts">
          <li>Requests still waiting for approval aren’t copied until both parents agree.</li>
          <li>
            Changes and cancellations follow within a few minutes. Change events here, not in Google
            Calendar.
          </li>
          <li>Only your Google Calendar is affected. Your co-parent can connect their own.</li>
        </ul>

        @switch (status.state) {
          @case ('Connected') {
            <p class="state" role="status">
              <strong>Connected.</strong>
              @if (status.lastSyncedAt) {
                Last updated {{ status.lastSyncedAt | date: 'MMM d, h:mm a' }}.
              } @else {
                Your events will appear in Google Calendar in a minute or two.
              }
            </p>
          }
          @case ('NeedsReconnect') {
            <p class="alert" role="alert">
              @if (status.problem === 'CalendarRemoved') {
                The “{{ status.calendarName }}” calendar was deleted in Google Calendar, so events
                aren’t being copied. Reconnect to make it again.
              } @else {
                Parenthesis can’t reach your Google Calendar any more, so events aren’t being
                copied. Reconnect to start again.
              }
            </p>
          }
        }

        @if (status.state !== 'NotConnected') {
          <fieldset class="types" [disabled]="saving()">
            <legend>Events to copy</legend>
            <p class="hint" id="google-types-hint">
              Only your Google Calendar changes. Unticked events are removed from it.
            </p>
            <div class="choices">
              @for (type of types; track type.value) {
                <mat-checkbox
                  [checked]="status.copyTypes.includes(type.value)"
                  (change)="toggle(type.value, $event)"
                  aria-describedby="google-types-hint"
                  >{{ type.label }}</mat-checkbox
                >
              }
            </div>
            <p class="hint" role="status">{{ saved() }}</p>
          </fieldset>
        }

        @if (confirming()) {
          <div class="panel" role="group" aria-labelledby="google-disconnect-heading">
            <h3 id="google-disconnect-heading" #confirmHeading tabindex="-1">
              Disconnect Google Calendar?
            </h3>
            <p>
              Parenthesis stops copying events and removes the “{{ status.calendarName }}” calendar
              from your Google account. Your other Google calendars aren’t touched.
            </p>
            <div class="actions">
              <button mat-flat-button type="button" [disabled]="busy()" (click)="disconnect()">
                {{ busy() ? 'Disconnecting…' : 'Disconnect' }}
              </button>
              <button mat-button type="button" [disabled]="busy()" (click)="confirming.set(false)">
                Cancel
              </button>
            </div>
          </div>
        } @else {
          <div class="actions">
            @if (status.state !== 'Connected') {
              <button mat-flat-button type="button" [disabled]="busy()" (click)="connect()">
                {{
                  busy()
                    ? 'Opening Google…'
                    : status.state === 'NeedsReconnect'
                      ? 'Reconnect Google Calendar'
                      : 'Connect Google Calendar'
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
                Disconnect…
              </button>
            }
          </div>
        }
      }
    } @else if (!error()) {
      <p class="muted">Loading…</p>
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
      display: grid;
      gap: var(--space-2);
      margin: 0;
      padding: var(--space-3);
      border: 1px solid var(--color-divider);
      border-radius: var(--radius-control);
    }
    legend {
      padding-inline: var(--space-1);
      font-weight: 600;
    }
    .choices {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(14rem, 1fr));
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

  /** In the calendar's order and words; the co-parent's unavailable time is off until a parent ticks it. */
  protected readonly types: readonly { value: GoogleCopyType; label: string }[] = [
    { value: 'ParentingTime', label: 'Parenting time' },
    { value: 'Joint', label: 'Family events' },
    { value: 'School', label: 'School' },
    { value: 'Medical', label: 'Medical' },
    { value: 'Dental', label: 'Dental' },
    { value: 'Activity', label: 'Activities' },
    { value: 'Birthday', label: 'Birthdays' },
    { value: 'Holiday', label: 'Holidays' },
    { value: 'Other', label: 'Other events' },
    { value: 'MyUnavailable', label: 'My unavailable time' },
    {
      value: 'CoParentUnavailable',
      label: 'My co-parent’s unavailable time (shown only as “Unavailable”)',
    },
  ];

  async ngOnInit(): Promise<void> {
    try {
      this.status.set(await this.api.googleCalendar(this.familyId()));
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

  protected async toggle(type: GoogleCopyType, change: MatCheckboxChange): Promise<void> {
    const checked = change.checked;
    const current = this.status();
    if (!current) {
      return;
    }
    const next = checked
      ? [...current.copyTypes, type]
      : current.copyTypes.filter((t) => t !== type);
    this.saving.set(true);
    this.error.set(null);
    this.saved.set('');
    try {
      this.status.set(await this.api.googleCalendarCopyTypes(this.familyId(), next));
      this.saved.set('Saved. Google Calendar updates within a minute or two.');
    } catch (error) {
      // Put the box back as it was saved.
      change.source.checked = !checked;
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
      this.toasts.show('Google Calendar is disconnected.');
    } catch (error) {
      this.error.set(generalMessage(toProblem(error)));
    } finally {
      this.busy.set(false);
    }
  }
}
