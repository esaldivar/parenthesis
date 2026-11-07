import { DatePipe, DOCUMENT, NgTemplateOutlet } from '@angular/common';
import { ChangeDetectionStrategy, Component, effect, inject, input, signal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { Icon } from '../../shared/icon/icon';
import { OnScreen, sectionUpdates } from './essentials-updates';
import { RevisionedSection } from './revisioned-section';
import { AllergiesFoodHistoryPage, AllergiesFoodView, Child } from '../../core/api/api';

@Component({
  selector: 'app-allergies-food-section',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DatePipe, NgTemplateOutlet, ReactiveFormsModule, OnScreen, Icon],
  template: `
    <section aria-labelledby="allergies-food-heading">
      <h3 id="allergies-food-heading">Allergies & Food
      </h3>
      <button type="button" [attr.aria-expanded]="exportOpen()" aria-controls="allergy-pdf-options"
        (click)="exportOpen.set(!exportOpen())">Download allergy PDF</button>
      <div id="allergy-pdf-options" [hidden]="!exportOpen()">
        <label>Include in the allergy PDF
          <select #exportChild [disabled]="exporting()">
            <option [value]="childId()">Current child</option>
            @for (child of children(); track child.id) {
              @if (child.id !== childId()) {
                <option [value]="child.id">{{ child.firstName }}</option>
              }
            }
            <option value="">All children</option>
          </select>
        </label>
        <button type="button" [disabled]="exporting()" (click)="downloadPdf(exportChild.value)">
          {{ exporting() ? 'Preparing PDF…' : 'Download PDF' }}
        </button>
        <p role="status">{{ exportNotice() }}</p>
      </div>
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
              <legend>Allergies and food</legend>
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
          <ng-container *ngTemplateOutlet="values; context: { $implicit: saved.values, current: true }" />
          @if (saved.recordedAt; as recordedAt) {
            <p>Recorded by {{ saved.recordedBy }} · <time [attr.datetime]="recordedAt">{{ recordedAt | date: 'medium' }}</time></p>
          }
          <div class="actions">
            <button type="button" class="pill" (click)="edit(saved)"><app-icon name="pencil" [size]="18" />Edit<span class="visually-hidden"> Allergies & Food</span></button>
            <button type="button" class="pill" [attr.aria-expanded]="historyOpen()" aria-controls="allergies-food-history"
              (click)="toggleHistory()"><app-icon name="history" [size]="18" />History</button>
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
    <ng-template #values let-entry let-current="current">
      <dl>
        <div class="row" [class.row--updated]="current && marks.updated('allergies', 'noKnownAllergies')" (appOnScreen)="current && marks.rowOnScreen('allergies', 'noKnownAllergies')">
          <dt>Allergies and notes@if (current && marks.updated('allergies', 'noKnownAllergies')) { <span class="updated-pill">Updated</span> }</dt><dd>{{ entry.allergies ?? (entry.noKnownAllergies ? 'No known allergies' : 'No allergies listed') }}</dd>
        </div>
        <div class="row" [class.row--updated]="current && marks.updated('foodPreferences')" (appOnScreen)="current && marks.rowOnScreen('foodPreferences')">
          <dt>Dietary restrictions and food preferences@if (current && marks.updated('foodPreferences')) { <span class="updated-pill">Updated</span> }</dt><dd>{{ entry.foodPreferences ?? 'Not set' }}</dd>
        </div>
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
export class AllergiesFoodSection extends RevisionedSection<AllergiesFoodView, AllergiesFoodView['values'], AllergiesFoodHistoryPage['entries'][number]> {
  readonly children = input<readonly Child[]>([]);
  protected readonly marks = sectionUpdates('allergiesFood', this.childId);
  protected readonly savedNotice = 'Allergies & Food saved.';
  private readonly document = inject(DOCUMENT);
  protected readonly exportOpen = signal(false);
  protected readonly exporting = signal(false);
  protected readonly exportNotice = signal('');
  protected readonly form = new FormGroup({
    noKnownAllergies: new FormControl(false, { nonNullable: true }),
    allergies: new FormControl('', { nonNullable: true, validators: Validators.maxLength(1000) }),
    foodPreferences: new FormControl('', { nonNullable: true, validators: Validators.maxLength(1000) }),
  });

  constructor() {
    super();
    effect(() => { void this.load(); });
  }

  protected async downloadPdf(childId: string): Promise<void> {
    if (this.exporting()) return;
    this.exporting.set(true);
    this.exportNotice.set('');
    try {
      const { pdf, fileName } = await this.api.downloadAllergyPdf(this.familyId(), childId || null);
      if (this.destroyRef.destroyed) return;

      const url = URL.createObjectURL(pdf);
      const link = this.document.createElement('a');
      link.href = url;
      // The server's dated name, so each saved copy says when it was made.
      link.download = fileName;
      try {
        link.click();
        this.exportNotice.set('Allergy PDF ready.');
      } finally {
        setTimeout(() => URL.revokeObjectURL(url), 1000);
      }
    } catch {
      this.exportNotice.set('The allergy PDF couldn’t be downloaded. Try again.');
    } finally {
      this.exporting.set(false);
    }
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

  protected store(revision: number, values: AllergiesFoodView['values']): Promise<AllergiesFoodView> {
    return this.api.saveAllergiesFood(this.familyId(), this.childId(), { revision, values });
  }

  protected historyPage(beforeRevision: number | null) {
    return this.api.allergiesFoodHistory(this.familyId(), this.childId(), beforeRevision);
  }
}
