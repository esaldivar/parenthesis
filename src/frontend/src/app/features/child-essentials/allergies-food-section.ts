import { LocaleService } from '../../core/i18n/locale.service';
import { AppDatePipe } from '../../core/i18n/locale-formatting';
import { TranslatePipe, translate } from '../../core/i18n/translations';
import { DOCUMENT, NgTemplateOutlet } from '@angular/common';
import { ChangeDetectionStrategy, Component, effect, inject, input, signal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { Icon } from '../../shared/icon/icon';
import { OnScreen, sectionUpdates } from './essentials-updates';
import { RevisionedSection } from './revisioned-section';
import { AllergiesFoodHistoryPage, AllergiesFoodView, Child } from '../../core/api/api';

@Component({
  selector: 'app-allergies-food-section',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [TranslatePipe, AppDatePipe, NgTemplateOutlet, ReactiveFormsModule, OnScreen, Icon],
  template: `
    <section aria-labelledby="allergies-food-heading">
      <h3 id="allergies-food-heading">{{ 'feature.allergies.food' | tr }}
      </h3>
      <button type="button" [attr.aria-expanded]="exportOpen()" aria-controls="allergy-pdf-options"
        (click)="exportOpen.set(!exportOpen())">{{ 'feature.download.allergy.pdf' | tr }}</button>
      <div id="allergy-pdf-options" [hidden]="!exportOpen()">
        <label>{{ 'feature.include.in.the.allergy.pdf' | tr }}
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
        <button type="button" [disabled]="exporting()" (click)="downloadPdf(exportChild.value)">
          {{ exporting() ? ('feature.preparing.pdf' | tr) : ('feature.download.pdf' | tr) }}
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
                <p role="alert">{{ 'feature.your.co.parent.saved.changes.first.review' | tr }}</p>
                <h4>{{ 'feature.latest.saved.values' | tr }}</h4>
                <ng-container *ngTemplateOutlet="values; context: { $implicit: latest.values }" />
              </div>
            }
            <fieldset [disabled]="saving()">
              <legend>{{ 'feature.allergies.and.food' | tr }}</legend>
              <label>{{ 'feature.allergies.and.notes' | tr }} <textarea formControlName="allergies" maxlength="1000"></textarea></label>
              <label>
                <input type="checkbox" formControlName="noKnownAllergies" />
                {{ 'feature.no.known.allergies' | tr }}
              </label>
              <p>{{ 'feature.entering.an.allergy.replaces.the.no.known' | tr }}</p>
              <label>{{ 'feature.dietary.restrictions.and.food.preferences.optional' | tr }} <textarea formControlName="foodPreferences" maxlength="1000"></textarea></label>
              <div class="actions">
                <button type="submit" [disabled]="form.invalid">
                  {{ saving() ? ('feature.saving' | tr) : conflict() ? ('feature.save.my.draft' | tr) : ('feature.save' | tr) }}
                </button>
                <button type="button" (click)="cancel()">{{ 'feature.cancel' | tr }}</button>
              </div>
            </fieldset>
          </form>
        } @else {
          <ng-container *ngTemplateOutlet="values; context: { $implicit: saved.values, current: true }" />
          @if (saved.recordedAt; as recordedAt) {
            <p>{{ 'feature.recorded.by' | tr }} {{ saved.recordedBy }} · <time [attr.datetime]="recordedAt">{{ recordedAt | appDate: 'medium' }}</time></p>
          }
          <div class="actions">
            <button type="button" class="pill" (click)="edit(saved)"><app-icon name="pencil" [size]="18" />{{ 'feature.edit' | tr }}<span class="visually-hidden"> {{ 'feature.allergies.food' | tr }}</span></button>
            <button type="button" class="pill" [attr.aria-expanded]="historyOpen()" aria-controls="allergies-food-history"
              (click)="toggleHistory()"><app-icon name="history" [size]="18" />{{ 'feature.history' | tr }}</button>
          </div>
          <p role="status">{{ notice() }}</p>
        }
        <div id="allergies-food-history" [hidden]="!historyOpen() || editing()">
          <h4>{{ 'feature.allergies.food.history' | tr }}</h4>
          @if (historyError()) {
            <p role="alert">{{ 'feature.history.couldn.t.be.loaded' | tr }}</p>
            <button type="button" (click)="loadHistory(nextRevision())">{{ 'feature.try.again' | tr }}</button>
          } @else if (historyLoading()) {
            <p role="status">{{ 'feature.loading.history' | tr }}</p>
          } @else if (!history().length) {
            <p>{{ 'feature.no.changes.yet' | tr }}</p>
          }
          @for (entry of history(); track entry.revision) {
            <article>
              <h5>{{ entry.editedBy }} · <time [attr.datetime]="entry.editedAt">{{ entry.editedAt | appDate: 'medium' }}</time></h5>
              <div class="comparison">
                <div><strong>{{ 'feature.previous.values' | tr }}</strong>
                  <ng-container *ngTemplateOutlet="values; context: { $implicit: entry.previous }" />
                </div>
                <div><strong>{{ 'feature.saved.values' | tr }}</strong>
                  <ng-container *ngTemplateOutlet="values; context: { $implicit: entry.current }" />
                </div>
              </div>
            </article>
          }
          @if (nextRevision() !== null && !historyLoading() && !historyError()) {
            <button type="button" (click)="loadHistory(nextRevision())">{{ 'feature.show.older.changes' | tr }}</button>
          }
        </div>
      } @else if (error()) {
        <button type="button" (click)="load()">{{ 'feature.try.again' | tr }}</button>
      } @else {
        <p role="status">{{ 'feature.loading.allergies.food' | tr }}</p>
      }
    </section>
    <ng-template #values let-entry let-current="current">
      <dl>
        <div class="row" [class.row--updated]="current && marks.updated('allergies', 'noKnownAllergies')" (appOnScreen)="current && marks.rowOnScreen('allergies', 'noKnownAllergies')">
          <dt>{{ 'feature.allergies.and.notes' | tr }}@if (current && marks.updated('allergies', 'noKnownAllergies')) { <span class="updated-pill">{{ 'feature.updated' | tr }}</span> }</dt><dd>{{ entry.allergies ?? (entry.noKnownAllergies ? 'No known allergies' : 'No allergies listed') }}</dd>
        </div>
        <div class="row" [class.row--updated]="current && marks.updated('foodPreferences')" (appOnScreen)="current && marks.rowOnScreen('foodPreferences')">
          <dt>{{ 'feature.dietary.restrictions.and.food.preferences' | tr }}@if (current && marks.updated('foodPreferences')) { <span class="updated-pill">{{ 'feature.updated' | tr }}</span> }</dt><dd>{{ entry.foodPreferences ?? 'Not set' }}</dd>
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
  private readonly locale = inject(LocaleService);
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
      this.error.set(translate('feedback.allergies.food.couldn.t.be.loaded', this.locale.locale()));
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
