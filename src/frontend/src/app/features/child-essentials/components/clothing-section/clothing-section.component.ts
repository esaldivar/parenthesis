import { NgTemplateOutlet } from '@angular/common';
import { ChangeDetectionStrategy, Component, effect } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { ClothingHistoryPage, ClothingValues, ClothingView } from '../../../../core/api/api';
import { AppDatePipe } from '../../../../core/i18n/locale-formatting';
import { TranslatePipe, TranslationKey } from '../../../../core/i18n/translations';
import { OnScreen, sectionUpdates } from '../../essentials-updates';
import { RevisionedSection } from '../../revisioned-section';

type ClothingField = keyof ClothingValues;

/**
 * The Clothing & Shoes rows in the approved order (#660). The notes field shows as "Clothing notes" but is still
 * stored as fitNotes, so notes saved before the redesign keep showing and saving unchanged.
 */
const FIELDS: readonly { readonly key: ClothingField; readonly label: TranslationKey }[] = [
  { key: 'topSize', label: 'feature.top.size' },
  { key: 'bottomSize', label: 'feature.bottom.size' },
  { key: 'shoeSize', label: 'feature.shoe.size' },
  { key: 'fitNotes', label: 'essentials.clothing.notes' },
];

@Component({
  selector: 'app-clothing-section',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [TranslatePipe, AppDatePipe, NgTemplateOutlet, ReactiveFormsModule, OnScreen],
  template: `
    <!-- The original clothing illustration, large and faint behind the panels and fields (#660). Decorative. -->
    <img class="art" src="art/child-essentials/clothing.webp" alt="" />
    <section aria-labelledby="clothing-heading">
      <h3 id="clothing-heading" class="visually-hidden">{{ 'feature.clothing.shoes' | tr }}</h3>
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
              <legend class="visually-hidden">{{ 'essentials.clothing.legend' | tr }}</legend>
              <label class="field"><span class="label">{{ 'feature.top.size' | tr }}</span>
                <input formControlName="topSize" maxlength="64" autocomplete="off" />
              </label>
              <label class="field"><span class="label">{{ 'feature.bottom.size' | tr }}</span>
                <input formControlName="bottomSize" maxlength="64" autocomplete="off" />
              </label>
              <label class="field"><span class="label">{{ 'feature.shoe.size' | tr }}</span>
                <input formControlName="shoeSize" maxlength="64" autocomplete="off" />
              </label>
              <label class="field"><span class="label">{{ 'essentials.clothing.notesOptional' | tr }}</span>
                <span id="clothing-notes-help" class="help">{{ 'essentials.clothing.notesHelp' | tr }}</span>
                <textarea formControlName="fitNotes" maxlength="1000" aria-describedby="clothing-notes-help"></textarea>
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
          <div class="actions">
            <button type="button" class="action" (click)="edit(saved)">{{ 'feature.edit' | tr }}<span class="visually-hidden"> {{ 'feature.clothing.and.shoes' | tr }}</span></button>
            <button type="button" class="action" [attr.aria-expanded]="historyOpen()" aria-controls="clothing-history"
              (click)="toggleHistory()">{{ 'feature.history' | tr }}</button>
          </div>
          <p role="status">{{ notice() }}</p>
        }
        <div id="clothing-history" class="history" [hidden]="!historyOpen() || editing()">
          <h4>{{ 'feature.clothing.shoes.history' | tr }}</h4>
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
        <p role="status">{{ 'feature.loading.clothing.and.shoes' | tr }}</p>
      }
    </section>
    <ng-template #values let-entry let-current="current">
      <dl class="panel">
        @for (field of fields; track field.key) {
          <!-- Notes with text sit under their label, full width (Figma populated frames); everything else is label | value. -->
          <div class="row" [class.row--stacked]="field.key === 'fitNotes' && !!entry[field.key]"
            [class.row--updated]="current && marks.updated(field.key)"
            (appOnScreen)="current && marks.rowOnScreen(field.key)">
            <dt><span class="label">{{ field.label | tr }}</span>
              @if (current && marks.updated(field.key)) { <span class="updated">{{ 'feature.updated' | tr }}</span> }
            </dt>
            <dd>{{ entry[field.key] || ('essentials.copy.notSet' | tr) }}</dd>
          </div>
        }
      </dl>
    </ng-template>
  `,
  styleUrl: './clothing-section.component.css',
})
export class ClothingSection extends RevisionedSection<ClothingView, ClothingValues, ClothingHistoryPage['entries'][number]> {
  protected readonly fields = FIELDS;
  protected readonly marks = sectionUpdates('clothing', this.childId);
  protected readonly savedNoticeKey = 'essentials.clothing.saved';
  protected readonly form = new FormGroup({
    topSize: new FormControl('', { nonNullable: true, validators: Validators.maxLength(64) }),
    bottomSize: new FormControl('', { nonNullable: true, validators: Validators.maxLength(64) }),
    shoeSize: new FormControl('', { nonNullable: true, validators: Validators.maxLength(64) }),
    fitNotes: new FormControl('', { nonNullable: true, validators: Validators.maxLength(1000) }),
  });

  constructor() {
    super();
    effect(() => { void this.load(); });
  }

  protected async load(): Promise<void> {
    this.error.set('');
    try {
      this.current.set(await this.api.clothing(this.familyId(), this.childId()));
    } catch {
      this.error.set('feedback.clothing.and.shoes.couldn.t.be.loaded');
    }
  }

  protected edit(saved: ClothingView): void {
    const { topSize, bottomSize, shoeSize, fitNotes } = saved.values;
    this.form.reset({
      topSize: topSize ?? '', bottomSize: bottomSize ?? '', shoeSize: shoeSize ?? '', fitNotes: fitNotes ?? '',
    });
    this.historyOpen.set(false);
    this.notice.set('');
    this.editing.set(true);
  }

  protected store(revision: number, values: ClothingValues): Promise<ClothingView> {
    return this.api.saveClothing(this.familyId(), this.childId(), { revision, values });
  }

  protected historyPage(beforeRevision: number | null) {
    return this.api.clothingHistory(this.familyId(), this.childId(), beforeRevision);
  }
}
