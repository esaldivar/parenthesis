import { AppDatePipe } from '../../core/i18n/locale-formatting';
import { TranslatePipe } from '../../core/i18n/translations';
import { NgTemplateOutlet } from '@angular/common';
import { ChangeDetectionStrategy, Component, effect } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { Icon } from '../../shared/icon/icon';
import { OnScreen, sectionUpdates } from './essentials-updates';
import { RevisionedSection } from './revisioned-section';
import { ClothingHistoryPage, ClothingView } from '../../core/api/api';

@Component({
  selector: 'app-clothing-section',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [TranslatePipe, AppDatePipe, NgTemplateOutlet, ReactiveFormsModule, OnScreen, Icon],
  template: `
    <section class="clothing" aria-labelledby="clothing-heading">
      <h3 id="clothing-heading">{{ 'feature.clothing.shoes' | tr }}
      </h3>
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
              <legend>{{ 'feature.sizes.and.fit.notes' | tr }}</legend>
              <label>{{ 'feature.top.size' | tr }} <input formControlName="topSize" maxlength="64" /></label>
              <label>{{ 'feature.bottom.size' | tr }} <input formControlName="bottomSize" maxlength="64" /></label>
              <label>{{ 'feature.shoe.size' | tr }} <input formControlName="shoeSize" maxlength="64" /></label>
              <label>{{ 'feature.fit.notes.optional' | tr }} <textarea formControlName="fitNotes" maxlength="1000"></textarea></label>
              <div class="actions">
                <button type="submit" [disabled]="form.invalid">
                  {{ saving() ? 'Saving…' : conflict() ? 'Save my draft' : 'Save' }}
                </button>
                <button type="button" (click)="cancel()">{{ 'feature.cancel' | tr }}</button>
              </div>
            </fieldset>
          </form>
        } @else {
          <ng-container *ngTemplateOutlet="values; context: { $implicit: saved.values, current: true }" />
          <div class="actions">
            <button type="button" class="pill" (click)="edit(saved)"><app-icon name="pencil" [size]="18" />{{ 'feature.edit' | tr }}<span class="visually-hidden"> {{ 'feature.clothing.and.shoes' | tr }}</span></button>
            <button type="button" class="pill" [attr.aria-expanded]="historyOpen()" aria-controls="clothing-history"
              (click)="toggleHistory()"><app-icon name="history" [size]="18" />{{ 'feature.history' | tr }}</button>
          </div>
          <p role="status">{{ notice() }}</p>
        }
        <div id="clothing-history" [hidden]="!historyOpen() || editing()">
          <h4>{{ 'feature.clothing.shoes.history' | tr }}</h4>
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
        <p role="status">{{ 'feature.loading.clothing.and.shoes' | tr }}</p>
      }
    </section>
    <ng-template #values let-entry let-current="current">
      <dl>
        <div class="row" [class.row--updated]="current && marks.updated('topSize')" (appOnScreen)="current && marks.rowOnScreen('topSize')">
          <dt>{{ 'feature.top.size' | tr }}@if (current && marks.updated('topSize')) { <span class="updated-pill">{{ 'feature.updated' | tr }}</span> }</dt><dd>{{ entry.topSize ?? 'Not set' }}</dd>
        </div>
        <div class="row" [class.row--updated]="current && marks.updated('bottomSize')" (appOnScreen)="current && marks.rowOnScreen('bottomSize')">
          <dt>{{ 'feature.bottom.size' | tr }}@if (current && marks.updated('bottomSize')) { <span class="updated-pill">{{ 'feature.updated' | tr }}</span> }</dt><dd>{{ entry.bottomSize ?? 'Not set' }}</dd>
        </div>
        <div class="row" [class.row--updated]="current && marks.updated('shoeSize')" (appOnScreen)="current && marks.rowOnScreen('shoeSize')">
          <dt>{{ 'feature.shoe.size' | tr }}@if (current && marks.updated('shoeSize')) { <span class="updated-pill">{{ 'feature.updated' | tr }}</span> }</dt><dd>{{ entry.shoeSize ?? 'Not set' }}</dd>
        </div>
        <div class="row" [class.row--updated]="current && marks.updated('fitNotes')" (appOnScreen)="current && marks.rowOnScreen('fitNotes')">
          <dt>{{ 'feature.fit.notes' | tr }}@if (current && marks.updated('fitNotes')) { <span class="updated-pill">{{ 'feature.updated' | tr }}</span> }</dt><dd>{{ entry.fitNotes ?? 'Not set' }}</dd>
        </div>
      </dl>
    </ng-template>
  `,
  styleUrl: './essentials-section.css',
  styles: `
    :host {
      display: block;
      --essentials-section-bg: var(--color-calendar-task-bg);
      --essentials-section-fg: var(--color-calendar-task-fg);
    }
  `,
})
export class ClothingSection extends RevisionedSection<ClothingView, ClothingView['values'], ClothingHistoryPage['entries'][number]> {
  protected readonly marks = sectionUpdates('clothing', this.childId);
  protected readonly savedNotice = 'Clothing and shoes saved.';
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
      this.error.set('Clothing and shoes couldn’t be loaded.');
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

  protected store(revision: number, values: ClothingView['values']): Promise<ClothingView> {
    return this.api.saveClothing(this.familyId(), this.childId(), { revision, values });
  }

  protected historyPage(beforeRevision: number | null) {
    return this.api.clothingHistory(this.familyId(), this.childId(), beforeRevision);
  }
}
