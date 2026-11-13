import { AppDatePipe } from '../../../../core/i18n/locale-formatting';
import { TranslatePipe } from '../../../../core/i18n/translations';
import { NgTemplateOutlet } from '@angular/common';
import { ChangeDetectionStrategy, Component, effect } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { Icon } from '../../../../shared/icon/icon';
import { OnScreen, sectionUpdates } from '../../essentials-updates';
import { RevisionedSection } from '../../revisioned-section';
import { WhatHelpsHistoryPage, WhatHelpsView } from '../../../../core/api/api';

@Component({
  selector: 'app-what-helps-section',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [TranslatePipe, AppDatePipe, NgTemplateOutlet, ReactiveFormsModule, OnScreen, Icon],
  template: `
    <section aria-labelledby="what-helps-heading">
      <h3 id="what-helps-heading">{{ 'feature.what.helps' | tr }}
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
              <legend>{{ 'feature.comfort.items.and.calming.strategies' | tr }}</legend>
              <label>{{ 'feature.comfort.items' | tr }} <textarea formControlName="comfortItems" maxlength="1000"></textarea></label>
              <label>{{ 'feature.calming.strategies.optional' | tr }} <textarea formControlName="calmingStrategies" maxlength="1000"></textarea></label>
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
          <div class="actions">
            <button type="button" class="pill" (click)="edit(saved)"><app-icon name="pencil" [size]="18" />{{ 'feature.edit' | tr }}<span class="visually-hidden"> {{ 'feature.what.helps' | tr }}</span></button>
            <button type="button" class="pill" [attr.aria-expanded]="historyOpen()" aria-controls="what-helps-history"
              (click)="toggleHistory()"><app-icon name="history" [size]="18" />{{ 'feature.history' | tr }}</button>
          </div>
          <p role="status">{{ notice() }}</p>
        }
        <div id="what-helps-history" [hidden]="!historyOpen() || editing()">
          <h4>{{ 'feature.what.helps.history' | tr }}</h4>
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
        <p role="status">{{ 'feature.loading.what.helps' | tr }}</p>
      }
    </section>
    <ng-template #values let-entry let-current="current">
      <dl>
        <div class="row" [class.row--updated]="current && marks.updated('comfortItems')" (appOnScreen)="current && marks.rowOnScreen('comfortItems')">
          <dt>{{ 'feature.comfort.items' | tr }}@if (current && marks.updated('comfortItems')) { <span class="updated-pill">{{ 'feature.updated' | tr }}</span> }</dt><dd>{{ entry.comfortItems ?? ('essentials.copy.notSet' | tr) }}</dd>
        </div>
        <div class="row" [class.row--updated]="current && marks.updated('calmingStrategies')" (appOnScreen)="current && marks.rowOnScreen('calmingStrategies')">
          <dt>{{ 'feature.calming.strategies' | tr }}@if (current && marks.updated('calmingStrategies')) { <span class="updated-pill">{{ 'feature.updated' | tr }}</span> }</dt><dd>{{ entry.calmingStrategies ?? ('essentials.copy.notSet' | tr) }}</dd>
        </div>
      </dl>
    </ng-template>
  `,
  styleUrl: '../../essentials-section.css',
  styles: `
    :host {
      display: block;
      --essentials-section-bg: var(--color-calendar-family-bg);
      --essentials-section-fg: var(--color-calendar-family-fg);
    }
  `,
})
export class WhatHelpsSection extends RevisionedSection<WhatHelpsView, WhatHelpsView['values'], WhatHelpsHistoryPage['entries'][number]> {
  protected readonly marks = sectionUpdates('whatHelps', this.childId);
  protected readonly savedNoticeKey = 'essentials.whatHelps.saved';
  protected readonly form = new FormGroup({
    comfortItems: new FormControl('', { nonNullable: true, validators: Validators.maxLength(1000) }),
    calmingStrategies: new FormControl('', { nonNullable: true, validators: Validators.maxLength(1000) }),
  });

  constructor() {
    super();
    effect(() => { void this.load(); });
  }

  protected async load(): Promise<void> {
    this.error.set('');
    try {
      this.current.set(await this.api.whatHelps(this.familyId(), this.childId()));
    } catch {
      this.error.set('feedback.what.helps.couldn.t.be.loaded');
    }
  }

  protected edit(saved: WhatHelpsView): void {
    const { comfortItems, calmingStrategies } = saved.values;
    this.form.reset({
      comfortItems: comfortItems ?? '', calmingStrategies: calmingStrategies ?? '',
    });
    this.historyOpen.set(false);
    this.notice.set('');
    this.editing.set(true);
  }

  protected store(revision: number, values: WhatHelpsView['values']): Promise<WhatHelpsView> {
    return this.api.saveWhatHelps(this.familyId(), this.childId(), { revision, values });
  }

  protected historyPage(beforeRevision: number | null) {
    return this.api.whatHelpsHistory(this.familyId(), this.childId(), beforeRevision);
  }
}
