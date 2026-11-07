import { DatePipe, NgTemplateOutlet } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import {
  ChangeDetectionStrategy, Component, DestroyRef, effect, inject, input, signal,
} from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { Api, AllergiesFoodHistoryPage, AllergiesFoodView } from '../../core/api/api';

@Component({
  selector: 'app-allergies-food-section',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DatePipe, NgTemplateOutlet, ReactiveFormsModule],
  template: `
    <section aria-labelledby="allergies-food-heading">
      <h3 id="allergies-food-heading">Allergies & Food</h3>
      @if (error()) {
        <p role="alert">{{ error() }}</p>
      }
      @if (current(); as saved) {
        @if (editing()) {
          <form [formGroup]="form" (ngSubmit)="save()">
            @if (conflict(); as latest) {
              <div class="latest">
                <p role="alert">Your co-parent saved changes first. Review the latest saved values below.
                  Your draft is still in the form.</p>
                <h4>Latest saved values</h4>
                <ng-container *ngTemplateOutlet="values; context: { $implicit: latest.values }" />
              </div>
            }
            <fieldset [disabled]="saving()">
              <legend>Allergies and notes and calming strategies</legend>
              <label>Allergies and notes <textarea formControlName="allergies" maxlength="1000"></textarea></label>
              <label>
                <input type="checkbox" formControlName="noKnownAllergies" />
                No known allergies
              </label>
              <p>Entering an allergy replaces the No known allergies status.</p>
              <label>Dietary restrictions and food preferences (optional) <textarea formControlName="foodPreferences" maxlength="1000"></textarea></label>
              <div class="actions">
                <button type="submit" [disabled]="form.invalid">
                  {{ saving() ? 'Saving…' : conflict() ? 'Save my draft' : 'Save' }}
                </button>
                <button type="button" (click)="cancel()">Cancel</button>
              </div>
            </fieldset>
          </form>
        } @else {
          <ng-container *ngTemplateOutlet="values; context: { $implicit: saved.values }" />
          @if (saved.recordedAt; as recordedAt) {
            <p>Recorded by {{ saved.recordedBy }} · <time [attr.datetime]="recordedAt">{{ recordedAt | date: 'medium' }}</time></p>
          }
          <div class="actions">
            <button type="button" (click)="edit(saved)">Edit Allergies & Food</button>
            <button type="button" [attr.aria-expanded]="historyOpen()" aria-controls="allergies-food-history"
              (click)="toggleHistory()">History</button>
          </div>
          <p role="status">{{ notice() }}</p>
        }
        <div id="allergies-food-history" [hidden]="!historyOpen() || editing()">
          <h4>Allergies & Food history</h4>
          @if (historyError()) {
            <p role="alert">History couldn’t be loaded.</p>
            <button type="button" (click)="loadHistory(nextRevision())">Try again</button>
          } @else if (historyLoading()) {
            <p role="status">Loading history…</p>
          } @else if (!history().length) {
            <p>No changes yet.</p>
          }
          @for (entry of history(); track entry.revision) {
            <article>
              <h5>{{ entry.editedBy }} · <time [attr.datetime]="entry.editedAt">{{ entry.editedAt | date: 'medium' }}</time></h5>
              <div class="comparison">
                <div><strong>Previous values</strong>
                  <ng-container *ngTemplateOutlet="values; context: { $implicit: entry.previous }" />
                </div>
                <div><strong>Saved values</strong>
                  <ng-container *ngTemplateOutlet="values; context: { $implicit: entry.current }" />
                </div>
              </div>
            </article>
          }
          @if (nextRevision() !== null && !historyLoading() && !historyError()) {
            <button type="button" (click)="loadHistory(nextRevision())">Show older changes</button>
          }
        </div>
      } @else if (error()) {
        <button type="button" (click)="load()">Try again</button>
      } @else {
        <p role="status">Loading Allergies & Food…</p>
      }
    </section>
    <ng-template #values let-entry>
      <dl>
        <dt>Allergies and notes</dt><dd>{{ entry.allergies ?? (entry.noKnownAllergies ? 'No known allergies' : 'No allergies listed') }}</dd>
        <dt>Dietary restrictions and food preferences</dt><dd>{{ entry.foodPreferences ?? 'Not set' }}</dd>
      </dl>
    </ng-template>
  `,
  styleUrl: './essentials-section.css',
  styles: `
    :host {
      display: block;
      --essentials-section-bg: var(--color-calendar-family-bg);
      --essentials-section-fg: var(--color-calendar-family-fg);
    }
  `,
})
export class AllergiesFoodSection {
  readonly familyId = input.required<string>();
  readonly childId = input.required<string>();
  private readonly api = inject(Api);
  private readonly destroyRef = inject(DestroyRef);
  protected readonly current = signal<AllergiesFoodView | null>(null);
  protected readonly conflict = signal<AllergiesFoodView | null>(null);
  protected readonly editing = signal(false);
  protected readonly saving = signal(false);
  protected readonly error = signal('');
  protected readonly notice = signal('');
  protected readonly historyOpen = signal(false);
  protected readonly historyLoading = signal(false);
  protected readonly historyError = signal(false);
  protected readonly history = signal<AllergiesFoodHistoryPage['entries']>([]);
  protected readonly nextRevision = signal<number | null>(null);
  protected readonly form = new FormGroup({
    noKnownAllergies: new FormControl(false, { nonNullable: true }),
    allergies: new FormControl('', { nonNullable: true, validators: Validators.maxLength(1000) }),
    foodPreferences: new FormControl('', { nonNullable: true, validators: Validators.maxLength(1000) }),
  });

  constructor() {
    effect(() => { void this.load(); });
  }

  protected async load(): Promise<void> {
    this.error.set('');
    try {
      this.current.set(await this.api.allergiesFood(this.familyId(), this.childId()));
    } catch {
      this.error.set('Allergies & Food couldn’t be loaded.');
    }
  }

  protected edit(saved: AllergiesFoodView): void {
    const { allergies, foodPreferences, noKnownAllergies } = saved.values;
    this.form.reset({
      noKnownAllergies, allergies: allergies ?? '', foodPreferences: foodPreferences ?? '',
    });
    this.historyOpen.set(false);
    this.notice.set('');
    this.editing.set(true);
  }

  protected cancel(): void {
    if (this.conflict() !== null) {
      this.current.set(this.conflict());
    }
    this.conflict.set(null);
    this.error.set('');
    this.editing.set(false);
  }

  protected async save(): Promise<void> {
    const base = this.conflict() ?? this.current();
    if (!base || this.saving() || this.form.invalid) return;
    this.saving.set(true);
    this.error.set('');
    try {
      const saved = await this.api.saveAllergiesFood(this.familyId(), this.childId(), {
        revision: base.revision, values: this.form.getRawValue(),
      });
      if (this.destroyRef.destroyed) return;
      this.current.set(saved);
      this.conflict.set(null);
      this.editing.set(false);
      this.notice.set('Allergies & Food saved.');
    } catch (error) {
      if (error instanceof HttpErrorResponse && error.status === 409) {
        this.conflict.set(error.error as AllergiesFoodView);
      } else {
        this.error.set('Changes couldn’t be saved. Your draft is still here.');
      }
    } finally {
      this.saving.set(false);
    }
  }

  protected toggleHistory(): void {
    const open = !this.historyOpen();
    this.historyOpen.set(open);
    if (open) void this.loadHistory(null);
  }

  protected async loadHistory(beforeRevision: number | null): Promise<void> {
    if (this.historyLoading()) return;
    this.historyLoading.set(true);
    this.historyError.set(false);
    if (beforeRevision === null) {
      this.history.set([]);
      this.nextRevision.set(null);
    }
    try {
      const page = await this.api.allergiesFoodHistory(this.familyId(), this.childId(), beforeRevision);
      this.history.update((entries) => [...entries, ...page.entries]);
      this.nextRevision.set(page.beforeRevision);
    } catch {
      this.historyError.set(true);
    } finally {
      this.historyLoading.set(false);
    }
  }
}
