import { ChangeDetectionStrategy, Component, OnDestroy, OnInit, inject, input, signal } from '@angular/core';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { MatAutocompleteModule } from '@angular/material/autocomplete';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { Api, NearbyPosition } from '../../core/api/api';
import { AuthStore } from '../../core/auth/auth.store';
import { Icon } from '../../shared/icon/icon';

/** Wait this long after the last keystroke before asking, so a parent typing quickly makes one request, not ten. */
export const SUGGESTION_DELAY_MS = 300;
const MINIMUM_INPUT = 3;

/**
 * How we ask the browser for the parent's position (#414): coarse is enough to favour nearby places, a position from
 * the last ten minutes will do, and after ten seconds we give up and explain.
 */
export const LOCATION_OPTIONS: PositionOptions = { enableHighAccuracy: false, timeout: 10_000, maximumAge: 600_000 };

/** What "Use my location" is doing, shown under the field. */
export type NearbyState = 'off' | 'asking' | 'on' | 'denied' | 'unavailable' | 'stopped';

export const NEARBY_MESSAGES: Record<NearbyState, string> = {
  off: '',
  asking: 'Finding your location…',
  on: 'Showing places near you first. Your location isn’t saved or shared.',
  denied:
    'Location is blocked for this site, so suggestions show places across the US. You can still type any address.',
  unavailable:
    'Couldn’t find your location, so suggestions show places across the US. You can still type any address.',
  stopped: 'Stopped using your location. Suggestions show places across the US.',
};

/**
 * An event's optional location (#113, #354). As a parent types, it offers address suggestions from Google Maps,
 * asked through our API so the key stays on the server. Picking one saves its text; typing anything else still works.
 * When suggestions are off, used up for the day, or Google doesn't answer, it's a plain text field: nothing
 * changes for the parent and no error is shown.
 *
 * "Use my location" (#414) favours places near the parent. Their position is kept only while this page is open, sent
 * only with their own suggestion requests, and never saved with the event or shown to anyone else. Without it,
 * suggestions are limited to the US (owner decision, November 4, 2026).
 */
@Component({
  selector: 'app-location-field',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule, MatFormFieldModule, MatInputModule, MatAutocompleteModule, MatButtonModule, Icon],
  template: `
    <div class="row">
      <mat-form-field appearance="outline" subscriptSizing="dynamic">
        <mat-label>Location (optional)</mat-label>
        <input
          matInput
          name="location"
          [formControl]="control()"
          maxlength="200"
          [matAutocomplete]="places"
          [matAutocompleteDisabled]="!available()"
          (input)="typed()"
        />
        <mat-autocomplete #places="matAutocomplete" (optionSelected)="picked()">
          @for (suggestion of suggestions(); track suggestion) {
            <mat-option [value]="suggestion">{{ suggestion }}</mat-option>
          }
          <!-- Google's attribution for its suggestions; screen readers get it from the field's hint instead. -->
          <div class="attribution" aria-hidden="true">Google Maps</div>
        </mat-autocomplete>
        @if (error(); as e) {
          <mat-hint class="field-error" role="alert">{{ e }}</mat-hint>
        } @else {
          <!-- "Open in Google Maps" searches this text as written (#113): a full address finds the right place. -->
          <mat-hint>
            Include the street, city and ZIP so directions find the right place.
            @if (confirmed()) {
              <span class="visually-hidden">Address suggestions come from Google Maps.</span>
            }
          </mat-hint>
        }
      </mat-form-field>
      @if (offerNearby()) {
        <!-- A toggle: the label stays the same and aria-pressed says whether it's on. -->
        <button
          mat-stroked-button
          type="button"
          class="nearby"
          [attr.aria-pressed]="nearby() === 'on'"
          [disabled]="nearby() === 'asking'"
          (click)="toggleNearby()"
        >
          <app-icon [name]="nearby() === 'on' ? 'check' : 'locate'" [size]="18" />
          Use my location
        </button>
      }
    </div>
    <p class="nearby-status" role="status">{{ message() }}</p>
  `,
  styles: `
    :host {
      display: block;
    }
    .row {
      display: flex;
      flex-wrap: wrap;
      align-items: flex-start;
      gap: var(--space-2) var(--space-3);
    }
    mat-form-field {
      flex: 1 1 16rem;
      min-width: 0;
    }
    .nearby {
      /* Lines up with the outlined field's box, and keeps a 44px target. */
      min-height: 44px;
      margin-top: 6px;
      flex: none;
    }
    .nearby app-icon {
      margin-inline-end: var(--space-1);
    }
    .nearby-status {
      margin: var(--space-1) 0 0;
      font-size: 0.875rem;
      color: var(--color-text-secondary);
    }
    /* Stays in the page while empty, so screen readers hear each new message. */
    .nearby-status:empty {
      margin: 0;
    }
    .attribution {
      padding: var(--space-1) var(--space-3) var(--space-2);
      text-align: end;
      font-size: 0.75rem;
      color: var(--color-text-secondary);
    }
  `,
})
export class LocationField implements OnInit, OnDestroy {
  private readonly api = inject(Api);
  private readonly family = inject(AuthStore).currentFamily;

  readonly control = input.required<FormControl<string>>();
  readonly error = input<string | null>(null);

  protected readonly suggestions = signal<readonly string[]>([]);
  /** Turns off for this field once the server says suggestions aren't available. */
  protected readonly available = signal(true);
  /**
   * True only once the server has answered that suggestions are on. Until then (and when they're off) nothing
   * mentions Google, so a plain-text field never claims suggestions it doesn't have.
   */
  protected readonly confirmed = signal(false);
  /** "Use my location" appears only when suggestions are on and the browser can tell us where it is. */
  protected readonly offerNearby = signal(false);
  protected readonly nearby = signal<NearbyState>('off');
  protected readonly message = signal('');

  /** The parent's position while "Use my location" is on. Kept in memory only, for this page. */
  private position: NearbyPosition | null = null;
  private session: string | null = null;
  private timer: ReturnType<typeof setTimeout> | undefined;
  /** Each request's number; an answer that isn't the latest is ignored. */
  private latest = 0;
  /** Each location request's number, so turning it off while the browser is still asking wins. */
  private locating = 0;

  ngOnInit(): void {
    void this.checkAvailable();
  }

  protected typed(): void {
    clearTimeout(this.timer);
    const text = this.control().value.trim();
    if (!this.available() || text.length < MINIMUM_INPUT) {
      this.latest++;
      this.suggestions.set([]);
      return;
    }
    this.timer = setTimeout(() => void this.ask(text), SUGGESTION_DELAY_MS);
  }

  /** A picked suggestion ends the session: the next typing starts a new one. */
  protected picked(): void {
    this.session = null;
    this.latest++;
    this.suggestions.set([]);
  }

  protected toggleNearby(): void {
    if (this.nearby() === 'on') {
      this.position = null;
      this.show('stopped');
      this.refresh();
      return;
    }
    const request = ++this.locating;
    this.show('asking');
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        if (request !== this.locating) {
          return;
        }
        this.position = { latitude: coords.latitude, longitude: coords.longitude };
        this.show('on');
        this.refresh();
      },
      (failure) => {
        if (request !== this.locating) {
          return;
        }
        this.position = null;
        this.show(failure.code === failure.PERMISSION_DENIED ? 'denied' : 'unavailable');
      },
      LOCATION_OPTIONS,
    );
  }

  ngOnDestroy(): void {
    clearTimeout(this.timer);
    this.locating++;
    this.position = null;
  }

  private show(state: NearbyState): void {
    this.nearby.set(state);
    this.message.set(NEARBY_MESSAGES[state]);
  }

  /** Asks again for what's already typed, so the list re-sorts as soon as the location changes. */
  private refresh(): void {
    if (this.control().value.trim().length >= MINIMUM_INPUT) {
      this.typed();
    }
  }

  /** Only tells us whether suggestions are on: the server never asks Google for it. */
  private async checkAvailable(): Promise<void> {
    const familyId = this.family()?.id;
    if (!familyId) {
      return;
    }
    try {
      const answer = await this.api.placeSuggestionsStatus(familyId);
      this.applyAvailability(answer.available);
    } catch {
      // Leave the field as it is: typing still asks, and fails quietly too.
    }
  }

  private applyAvailability(available: boolean): void {
    this.available.set(available);
    this.confirmed.set(available);
    this.offerNearby.set(available && 'geolocation' in navigator);
    if (!available) {
      this.locating++;
      this.position = null;
      this.show('off');
    }
  }

  private async ask(text: string): Promise<void> {
    const familyId = this.family()?.id;
    if (!familyId) {
      return;
    }
    this.session ??= crypto.randomUUID();
    const request = ++this.latest;
    try {
      const answer = await this.api.placeSuggestions(familyId, text, this.session, this.position);
      if (request !== this.latest) {
        return;
      }
      if (!answer.available) {
        this.applyAvailability(false);
        this.suggestions.set([]);
        return;
      }
      this.applyAvailability(true);
      this.suggestions.set(answer.suggestions);
    } catch {
      // Suggestions are a convenience: a failure leaves a plain text field, with nothing to explain.
      if (request === this.latest) {
        this.suggestions.set([]);
      }
    }
  }
}
