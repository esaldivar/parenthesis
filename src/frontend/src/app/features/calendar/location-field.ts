import { ChangeDetectionStrategy, Component, OnDestroy, inject, input, signal } from '@angular/core';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { MatAutocompleteModule } from '@angular/material/autocomplete';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { Api } from '../../core/api/api';
import { AuthStore } from '../../core/auth/auth.store';

/** Wait this long after the last keystroke before asking, so a parent typing quickly makes one request, not ten. */
export const SUGGESTION_DELAY_MS = 300;
const MINIMUM_INPUT = 3;

/**
 * An event's optional location (#113, #354). As a parent types, it offers address suggestions from Google Maps,
 * asked through our API so the key stays on the server. Picking one saves its text; typing anything else still works.
 * When suggestions are off, used up for the day, or Google doesn't answer, it's a plain text field: nothing
 * changes for the parent and no error is shown.
 */
@Component({
  selector: 'app-location-field',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule, MatFormFieldModule, MatInputModule, MatAutocompleteModule],
  template: `
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
          @if (available()) {
            <span class="visually-hidden">Address suggestions come from Google Maps.</span>
          }
        </mat-hint>
      }
    </mat-form-field>
  `,
  styles: `
    :host {
      display: block;
    }
    mat-form-field {
      width: 100%;
    }
    .attribution {
      padding: var(--space-1) var(--space-3) var(--space-2);
      text-align: end;
      font-size: 0.75rem;
      color: var(--color-text-secondary);
    }
  `,
})
export class LocationField implements OnDestroy {
  private readonly api = inject(Api);
  private readonly family = inject(AuthStore).currentFamily;

  readonly control = input.required<FormControl<string>>();
  readonly error = input<string | null>(null);

  protected readonly suggestions = signal<readonly string[]>([]);
  /** Turns off for this field once the server says suggestions aren't available. */
  protected readonly available = signal(true);

  private session: string | null = null;
  private timer: ReturnType<typeof setTimeout> | undefined;
  /** Each request's number; an answer that isn't the latest is ignored. */
  private latest = 0;

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

  ngOnDestroy(): void {
    clearTimeout(this.timer);
  }

  private async ask(text: string): Promise<void> {
    const familyId = this.family()?.id;
    if (!familyId) {
      return;
    }
    this.session ??= crypto.randomUUID();
    const request = ++this.latest;
    try {
      const answer = await this.api.placeSuggestions(familyId, text, this.session);
      if (request !== this.latest) {
        return;
      }
      if (!answer.available) {
        this.available.set(false);
        this.suggestions.set([]);
        return;
      }
      this.suggestions.set(answer.suggestions);
    } catch {
      // Suggestions are a convenience: a failure leaves a plain text field, with nothing to explain.
      if (request === this.latest) {
        this.suggestions.set([]);
      }
    }
  }
}
