import { AppDatePipe } from '../../../../core/i18n/locale-formatting';
import { TranslatePipe, TranslationKey } from '../../../../core/i18n/translations';
import { NgTemplateOutlet } from '@angular/common';
import { ChangeDetectionStrategy, Component, ElementRef, afterNextRender, effect, inject, Injector, viewChild } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { OnScreen, sectionUpdates } from '../../essentials-updates';
import { RevisionedSection } from '../../revisioned-section';
import { LocaleService } from '../../../../core/i18n/locale.service';
import { WhatHelpsHistoryPage, WhatHelpsView } from '../../../../core/api/api';

type WhatHelpsField = 'comfortItems' | 'calmingStrategies';

/** The two reference fields in the approved order (#667). */
const FIELDS: readonly { readonly key: WhatHelpsField; readonly label: TranslationKey }[] = [
  { key: 'comfortItems', label: 'feature.comfort.items' },
  { key: 'calmingStrategies', label: 'feature.calming.strategies' },
];
const LIMIT = 1000;

@Component({
  selector: 'app-what-helps-section',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [TranslatePipe, AppDatePipe, NgTemplateOutlet, ReactiveFormsModule, OnScreen],
  template: `
    <!-- The approved cleaned bunny, centered and faint behind the translucent panels (#667). Decorative. -->
    <img class="art" src="art/child-essentials/what-helps-cutout.webp" alt="" />
    <section aria-labelledby="what-helps-heading">
      <h3 id="what-helps-heading" class="visually-hidden">{{ 'feature.what.helps' | tr }}</h3>
      @if (current(); as saved) {
        @if (editing()) {
          <form class="state" [formGroup]="form" (ngSubmit)="save()" aria-labelledby="what-helps-form-heading">
            <h4 id="what-helps-form-heading" class="state-heading">{{ 'feature.comfort.items.and.calming.strategies' | tr }}</h4>
            @if (conflict(); as latest) {
              <p role="alert" class="message">{{ 'feature.your.co.parent.saved.changes.first.review' | tr }}</p>
              <ng-container *ngTemplateOutlet="inset; context: { $implicit: latest.values, title: 'feature.latest.saved.values' }" />
            } @else if (error()) {
              <p role="alert" class="message">{{ error() }}</p>
            }
            <fieldset [disabled]="saving()">
              <legend class="visually-hidden">{{ 'feature.comfort.items.and.calming.strategies' | tr }}</legend>
              <ng-container *ngTemplateOutlet="limit; context: { $implicit: 'comfortItems', label: 'feature.comfort.items' }" />
              <ng-container *ngTemplateOutlet="limit; context: { $implicit: 'calmingStrategies', label: 'feature.calming.strategies.optional' }" />
              <div class="actions">
                <button type="submit" class="action primary" [class.wide]="!!conflict()" [disabled]="form.invalid">
                  {{ saving() ? ('feature.saving' | tr) : conflict() ? ('feature.save.my.draft' | tr) : error() ? ('feature.retry' | tr) : ('feature.save' | tr) }}
                </button>
                <button type="button" class="action secondary" (click)="cancel()">{{ 'feature.cancel' | tr }}</button>
              </div>
            </fieldset>
          </form>
        } @else if (historyOpen()) {
          <div id="what-helps-history" class="state">
            <h4 class="state-heading">{{ 'feature.what.helps.history' | tr }}</h4>
            @if (historyError()) {
              <p role="alert" class="muted">{{ 'feature.history.couldn.t.be.loaded' | tr }}</p>
              <div class="actions">
                <button type="button" class="action primary" (click)="loadHistory(nextRevision())">{{ 'feature.retry' | tr }}</button>
              </div>
            } @else if (historyLoading() && !history().length) {
              <p role="status" class="muted">{{ 'feature.loading.history' | tr }}</p>
            } @else if (!history().length) {
              <p class="muted">{{ 'feature.no.changes.yet' | tr }}</p>
            }
            @for (entry of history(); track entry.revision) {
              <article class="change">
                <h5 class="muted">{{ entry.editedBy }} · <time [attr.datetime]="entry.editedAt">{{ entry.editedAt | appDate: 'medium' }}</time></h5>
                <ng-container *ngTemplateOutlet="inset; context: { $implicit: entry.previous, title: 'feature.previous.values' }" />
                <ng-container *ngTemplateOutlet="inset; context: { $implicit: entry.current, title: 'feature.saved.values' }" />
              </article>
            }
            <div class="actions">
              @if (nextRevision() !== null && !historyLoading() && !historyError()) {
                <button type="button" class="action secondary" (click)="loadHistory(nextRevision())">{{ 'feature.show.older.changes' | tr }}</button>
              }
              <button #closeHistory type="button" class="action secondary wide" aria-controls="what-helps-history"
                [attr.aria-expanded]="true" (click)="hideHistory()">{{ 'essentials.history.close' | tr }}</button>
            </div>
          </div>
        } @else {
          <dl class="panel">
            @for (field of fields; track field.key) {
              <div class="row" [class.row--updated]="marks.updated(field.key)" (appOnScreen)="marks.rowOnScreen(field.key)">
                <dt><span class="label">{{ field.label | tr }}</span>
                  @if (marks.updated(field.key)) { <span class="updated">{{ 'feature.updated' | tr }}</span> }
                </dt>
                <dd>{{ saved.values[field.key] ?? ('essentials.copy.notSet' | tr) }}</dd>
              </div>
            }
          </dl>
          <div class="actions">
            <button type="button" class="action primary" (click)="edit(saved)">{{ 'feature.edit' | tr }}<span class="visually-hidden"> {{ 'feature.what.helps' | tr }}</span></button>
            <button #openHistory type="button" class="action secondary outlined wide" [attr.aria-expanded]="false" aria-controls="what-helps-history"
              (click)="toggleHistory()">{{ 'feature.history' | tr }}</button>
          </div>
          <p role="status">{{ notice() }}</p>
        }
      } @else if (error()) {
        <div class="state">
          <p role="alert" class="muted body">{{ error() }}</p>
          <div class="actions"><button type="button" class="action primary" (click)="load()">{{ 'feature.retry' | tr }}</button></div>
        </div>
      } @else {
        <div class="state"><p role="status" class="muted body">{{ 'feature.loading.what.helps' | tr }}</p></div>
      }
    </section>
    <!-- A field: label, translucent textarea, and the over-limit message with its count (frame 882:2457). -->
    <ng-template #limit let-key let-label="label">
      <div class="field" [formGroup]="form">
        <label class="field-label" [for]="key + '-field'">{{ label | tr }}</label>
        @if (key === 'comfortItems') {
          <textarea id="comfortItems-field" formControlName="comfortItems" [attr.aria-invalid]="tooLong(key)"
            [attr.aria-describedby]="tooLong(key) ? key + '-limit' : null"></textarea>
        } @else {
          <textarea id="calmingStrategies-field" formControlName="calmingStrategies" [attr.aria-invalid]="tooLong(key)"
            [attr.aria-describedby]="tooLong(key) ? key + '-limit' : null"></textarea>
        }
        @if (tooLong(key)) {
          <span [id]="key + '-limit'" class="invalid">
            <span>{{ 'essentials.whatHelps.tooLong' | tr }}</span>
            <span>{{ 'essentials.whatHelps.count' | tr: { count: count(key) } }}</span>
          </span>
        }
      </div>
    </ng-template>
    <!-- Latest, previous or saved values in a compact inset: "Label: value" lines (frames 882:1061, 882:3245). -->
    <ng-template #inset let-values let-title="title">
      <div class="inset">
        <h6>{{ title | tr }}</h6>
        @for (field of fields; track field.key) {
          <p>{{ field.label | tr }}: {{ values[field.key] ?? ('essentials.copy.notSet' | tr) }}</p>
        }
      </div>
    </ng-template>
  `,
  styleUrl: './what-helps-section.component.css',
})
export class WhatHelpsSection extends RevisionedSection<WhatHelpsView, WhatHelpsView['values'], WhatHelpsHistoryPage['entries'][number]> {
  protected readonly fields = FIELDS;
  protected readonly marks = sectionUpdates('whatHelps', this.childId);
  private readonly injector = inject(Injector);
  private readonly locale = inject(LocaleService);
  private readonly openHistory = viewChild<ElementRef<HTMLButtonElement>>('openHistory');
  protected readonly savedNoticeKey = 'essentials.whatHelps.saved';
  protected readonly form = new FormGroup({
    comfortItems: new FormControl('', { nonNullable: true, validators: Validators.maxLength(LIMIT) }),
    calmingStrategies: new FormControl('', { nonNullable: true, validators: Validators.maxLength(LIMIT) }),
  });

  constructor() {
    super();
    effect(() => { void this.load(); });
  }

  /** Over the 1,000-character limit: the field shows the message and its count, and Save stays off (frame 882:2457). */
  protected tooLong(field: WhatHelpsField): boolean {
    return this.length(field) > LIMIT;
  }

  protected length(field: WhatHelpsField): number {
    return this.form.controls[field].value.length;
  }

  /** The field's length in the reader's number format, for the "1,012 / 1,000 characters" counter. */
  protected count(field: WhatHelpsField): string {
    return new Intl.NumberFormat(this.locale.locale()).format(this.length(field));
  }

  /** Close history and put focus back on the History button it replaced. */
  protected hideHistory(): void {
    this.toggleHistory();
    afterNextRender(() => this.openHistory()?.nativeElement.focus(), { injector: this.injector });
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
