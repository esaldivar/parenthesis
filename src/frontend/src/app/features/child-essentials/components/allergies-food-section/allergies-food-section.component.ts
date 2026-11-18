import { localizedMessage } from '../../localized-message';
import { AppDatePipe } from '../../../../core/i18n/locale-formatting';
import { TranslatePipe } from '../../../../core/i18n/translations';
import { DOCUMENT, NgTemplateOutlet } from '@angular/common';
import { ChangeDetectionStrategy, Component, effect, inject, input, signal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { OnScreen, sectionUpdates } from '../../essentials-updates';
import { RevisionedSection } from '../../revisioned-section';
import { AllergiesFoodHistoryPage, AllergiesFoodView, Child } from '../../../../core/api/api';

@Component({
  selector: 'app-allergies-food-section',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [TranslatePipe, AppDatePipe, NgTemplateOutlet, ReactiveFormsModule, OnScreen],
  template: `
    <!-- The original allergies illustration, large and faint behind the panels and fields (#662). Decorative. -->
    <img class="art" src="art/child-essentials/allergies.webp" alt="" />
    <section aria-labelledby="allergies-food-heading">
      <h3 id="allergies-food-heading" class="visually-hidden">{{ 'feature.allergies.food' | tr }}</h3>
      <button type="button" class="action soft pdf" [attr.aria-expanded]="exportOpen()" aria-controls="allergy-pdf-options"
        (click)="exportOpen.set(!exportOpen())">{{ 'feature.download.allergy.pdf' | tr }}</button>
      <div id="allergy-pdf-options" class="export" [hidden]="!exportOpen()">
        <label class="field"><span>{{ 'feature.include.in.the.allergy.pdf' | tr }}</span>
          <select #exportChild [disabled]="exporting()">
            <option [value]="childId()">{{ 'feature.current.child' | tr }}</option>
            @for (child of children(); track child.id) {
              @if (child.id !== childId()) {
                <option [value]="child.id">{{ child.firstName }}</option>
              }
            }
            <option value="">{{ 'feature.all.children' | tr }}</option>
          </select>
        </label>
        <button type="button" class="action filled wide" [disabled]="exporting()" (click)="downloadPdf(exportChild.value)">
          {{ exporting() ? ('feature.preparing.pdf' | tr) : ('feature.download.pdf' | tr) }}
        </button>
        <p role="status" class="small">{{ exportNotice() }}</p>
      </div>
      @if (error()) {
        <p role="alert" class="message">{{ error() }}</p>
      }
      @if (current(); as saved) {
        @if (editing()) {
          <form [formGroup]="form" (ngSubmit)="save()">
            @if (conflict(); as latest) {
              <div class="latest">
                <p role="alert" class="message">{{ 'feature.your.co.parent.saved.changes.first.review' | tr }}</p>
                <h4 class="caption">{{ 'feature.latest.saved.values' | tr }}</h4>
                <ng-container *ngTemplateOutlet="values; context: { $implicit: latest.values }" />
              </div>
            }
            <fieldset [disabled]="saving()">
              <legend class="visually-hidden">{{ 'feature.allergies.and.food' | tr }}</legend>
              <label class="field"><span class="label">{{ 'feature.allergies.and.notes' | tr }}</span>
                <textarea formControlName="allergies" maxlength="1000"></textarea>
              </label>
              <label class="check">
                <input type="checkbox" formControlName="noKnownAllergies" aria-describedby="no-known-allergies-help" />
                <span class="box" aria-hidden="true"></span>
                <span>{{ 'feature.no.known.allergies' | tr }}</span>
              </label>
              <p id="no-known-allergies-help" class="help">{{ 'feature.entering.an.allergy.replaces.the.no.known' | tr }}</p>
              <label class="field"><span class="label">{{ 'feature.dietary.restrictions.and.food.preferences.optional' | tr }}</span>
                <textarea formControlName="foodPreferences" maxlength="1000"></textarea>
              </label>
              <div class="actions actions--tall">
                <button type="submit" class="action filled" [disabled]="form.invalid">
                  {{ saving() ? ('feature.saving' | tr) : conflict() ? ('feature.save.my.draft' | tr) : ('feature.save' | tr) }}
                </button>
                <button type="button" class="action" (click)="cancel()">{{ 'feature.cancel' | tr }}</button>
              </div>
            </fieldset>
          </form>
        } @else {
          <ng-container *ngTemplateOutlet="values; context: { $implicit: saved.values, current: true }" />
          @if (saved.recordedAt; as recordedAt) {
            <p class="small">{{ 'feature.recorded.by' | tr }} {{ saved.recordedBy }} · <time [attr.datetime]="recordedAt">{{ recordedAt | appDate: 'medium' }}</time></p>
          }
          <div class="actions">
            <button type="button" class="action" (click)="edit(saved)">{{ 'feature.edit' | tr }}<span class="visually-hidden"> {{ 'feature.allergies.food' | tr }}</span></button>
            <button type="button" class="action" [attr.aria-expanded]="historyOpen()" aria-controls="allergies-food-history"
              (click)="toggleHistory()">{{ 'feature.history' | tr }}</button>
          </div>
          <p role="status">{{ notice() }}</p>
        }
        <div id="allergies-food-history" class="history" [hidden]="!historyOpen() || editing()">
          <h4>{{ 'feature.allergies.food.history' | tr }}</h4>
          @if (historyError()) {
            <p role="alert" class="small">{{ 'feature.history.couldn.t.be.loaded' | tr }}</p>
            <button type="button" class="action" (click)="loadHistory(nextRevision())">{{ 'feature.try.again' | tr }}</button>
          } @else if (historyLoading()) {
            <p role="status" class="small">{{ 'feature.loading.history' | tr }}</p>
          } @else if (!history().length) {
            <p class="small">{{ 'feature.no.changes.yet' | tr }}</p>
          }
          @for (entry of history(); track entry.revision) {
            <article>
              <h5>{{ entry.editedBy }} · <time [attr.datetime]="entry.editedAt">{{ entry.editedAt | appDate: 'medium' }}</time></h5>
              <div class="comparison">
                <div><h6 class="caption">{{ 'feature.previous.values' | tr }}</h6>
                  <ng-container *ngTemplateOutlet="values; context: { $implicit: entry.previous }" />
                </div>
                <div><h6 class="caption">{{ 'feature.saved.values' | tr }}</h6>
                  <ng-container *ngTemplateOutlet="values; context: { $implicit: entry.current }" />
                </div>
              </div>
            </article>
          }
          @if (nextRevision() !== null && !historyLoading() && !historyError()) {
            <button type="button" class="action" (click)="loadHistory(nextRevision())">{{ 'feature.show.older.changes' | tr }}</button>
          }
        </div>
      } @else if (error()) {
        <button type="button" class="action" (click)="load()">{{ 'feature.try.again' | tr }}</button>
      } @else {
        <p role="status">{{ 'feature.loading.allergies.food' | tr }}</p>
      }
    </section>
    <!-- Each row is its label over its value (Figma 331:84). An explicit No known allergies and nothing recorded read
      differently; allergy text always wins over the status. -->
    <ng-template #values let-entry let-current="current">
      <dl class="panel panel--stacked">
        <div class="row" [class.row--updated]="current && marks.updated('allergies', 'noKnownAllergies')"
          (appOnScreen)="current && marks.rowOnScreen('allergies', 'noKnownAllergies')">
          <dt><span class="label">{{ 'feature.allergies.and.notes' | tr }}</span>
            @if (current && marks.updated('allergies', 'noKnownAllergies')) { <span class="updated">{{ 'feature.updated' | tr }}</span> }
          </dt>
          <dd>{{ entry.allergies ?? (entry.noKnownAllergies ? ('essentials.copy.noKnownAllergies' | tr) : ('essentials.copy.noAllergies' | tr)) }}</dd>
        </div>
        <div class="row" [class.row--updated]="current && marks.updated('foodPreferences')"
          (appOnScreen)="current && marks.rowOnScreen('foodPreferences')">
          <dt><span class="label">{{ 'feature.dietary.restrictions.and.food.preferences' | tr }}</span>
            @if (current && marks.updated('foodPreferences')) { <span class="updated">{{ 'feature.updated' | tr }}</span> }
          </dt>
          <dd>{{ entry.foodPreferences ?? ('essentials.copy.notSet' | tr) }}</dd>
        </div>
      </dl>
    </ng-template>
  `,
  styleUrls: ['../../redesigned-section.css', './allergies-food-section.component.css'],
})
export class AllergiesFoodSection extends RevisionedSection<AllergiesFoodView, AllergiesFoodView['values'], AllergiesFoodHistoryPage['entries'][number]> {
  readonly children = input<readonly Child[]>([]);
  protected readonly marks = sectionUpdates('allergiesFood', this.childId);
  protected readonly savedNoticeKey = 'essentials.allergies.saved';
  private readonly document = inject(DOCUMENT);
  protected readonly exportOpen = signal(false);
  protected readonly exporting = signal(false);
  protected readonly exportNotice = localizedMessage();
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
        this.exportNotice.set('essentials.allergies.pdfReady');
      } finally {
        setTimeout(() => URL.revokeObjectURL(url), 1000);
      }
    } catch {
      this.exportNotice.set('essentials.allergies.pdfError');
    } finally {
      this.exporting.set(false);
    }
  }

  protected async load(): Promise<void> {
    this.error.set('');
    try {
      this.current.set(await this.api.allergiesFood(this.familyId(), this.childId()));
    } catch {
      this.error.set('feedback.allergies.food.couldn.t.be.loaded');
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
