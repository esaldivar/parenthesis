import { DatePipe, NgTemplateOutlet } from '@angular/common';
import { ChangeDetectionStrategy, Component, effect } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { OnScreen, sectionUpdates } from './essentials-updates';
import { RevisionedSection } from './revisioned-section';
import { WhatHelpsHistoryPage, WhatHelpsView } from '../../core/api/api';

@Component({
  selector: 'app-what-helps-section',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DatePipe, NgTemplateOutlet, ReactiveFormsModule, OnScreen],
  template: `
    <section aria-labelledby="what-helps-heading">
      <h3 id="what-helps-heading">What Helps
      </h3>
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
              <legend>Comfort items and calming strategies</legend>
              <label>Comfort items <textarea formControlName="comfortItems" maxlength="1000"></textarea></label>
              <label>Calming strategies (optional) <textarea formControlName="calmingStrategies" maxlength="1000"></textarea></label>
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
          <div class="actions">
            <button type="button" (click)="edit(saved)">Edit What Helps</button>
            <button type="button" [attr.aria-expanded]="historyOpen()" aria-controls="what-helps-history"
              (click)="toggleHistory()">History</button>
          </div>
          <p role="status">{{ notice() }}</p>
        }
        <div id="what-helps-history" [hidden]="!historyOpen() || editing()">
          <h4>What Helps history</h4>
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
        <p role="status">Loading What Helps…</p>
      }
    </section>
    <ng-template #values let-entry let-current="current">
      <dl>
        <div class="row" [class.row--updated]="current && marks.updated('comfortItems')" (appOnScreen)="current && marks.rowOnScreen('comfortItems')">
          <dt>Comfort items@if (current && marks.updated('comfortItems')) { <span class="updated-pill">Updated</span> }</dt><dd>{{ entry.comfortItems ?? 'Not set' }}</dd>
        </div>
        <div class="row" [class.row--updated]="current && marks.updated('calmingStrategies')" (appOnScreen)="current && marks.rowOnScreen('calmingStrategies')">
          <dt>Calming strategies@if (current && marks.updated('calmingStrategies')) { <span class="updated-pill">Updated</span> }</dt><dd>{{ entry.calmingStrategies ?? 'Not set' }}</dd>
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
export class WhatHelpsSection extends RevisionedSection<WhatHelpsView, WhatHelpsView['values'], WhatHelpsHistoryPage['entries'][number]> {
  protected readonly marks = sectionUpdates('whatHelps', this.childId);
  protected readonly savedNotice = 'What Helps saved.';
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
      this.error.set('What Helps couldn’t be loaded.');
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
