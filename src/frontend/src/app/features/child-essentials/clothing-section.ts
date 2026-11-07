import { DatePipe, NgTemplateOutlet } from '@angular/common';
import { ChangeDetectionStrategy, Component, effect } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { Icon } from '../../shared/icon/icon';
import { OnScreen, sectionUpdates } from './essentials-updates';
import { RevisionedSection } from './revisioned-section';
import { ClothingHistoryPage, ClothingView } from '../../core/api/api';

@Component({
  selector: 'app-clothing-section',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DatePipe, NgTemplateOutlet, ReactiveFormsModule, OnScreen, Icon],
  template: `
    <section class="clothing" aria-labelledby="clothing-heading">
      <h3 id="clothing-heading">Clothing &amp; Shoes
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
              <legend>Sizes and fit notes</legend>
              <label>Top size <input formControlName="topSize" maxlength="64" /></label>
              <label>Bottom size <input formControlName="bottomSize" maxlength="64" /></label>
              <label>Shoe size <input formControlName="shoeSize" maxlength="64" /></label>
              <label>Fit notes (optional) <textarea formControlName="fitNotes" maxlength="1000"></textarea></label>
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
            <button type="button" class="pill" (click)="edit(saved)"><app-icon name="pencil" [size]="18" />Edit<span class="visually-hidden"> clothing and shoes</span></button>
            <button type="button" class="pill" [attr.aria-expanded]="historyOpen()" aria-controls="clothing-history"
              (click)="toggleHistory()"><app-icon name="history" [size]="18" />History</button>
          </div>
          <p role="status">{{ notice() }}</p>
        }
        <div id="clothing-history" [hidden]="!historyOpen() || editing()">
          <h4>Clothing &amp; Shoes history</h4>
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
        <p role="status">Loading clothing and shoes…</p>
      }
    </section>
    <ng-template #values let-entry let-current="current">
      <dl>
        <div class="row" [class.row--updated]="current && marks.updated('topSize')" (appOnScreen)="current && marks.rowOnScreen('topSize')">
          <dt>Top size@if (current && marks.updated('topSize')) { <span class="updated-pill">Updated</span> }</dt><dd>{{ entry.topSize ?? 'Not set' }}</dd>
        </div>
        <div class="row" [class.row--updated]="current && marks.updated('bottomSize')" (appOnScreen)="current && marks.rowOnScreen('bottomSize')">
          <dt>Bottom size@if (current && marks.updated('bottomSize')) { <span class="updated-pill">Updated</span> }</dt><dd>{{ entry.bottomSize ?? 'Not set' }}</dd>
        </div>
        <div class="row" [class.row--updated]="current && marks.updated('shoeSize')" (appOnScreen)="current && marks.rowOnScreen('shoeSize')">
          <dt>Shoe size@if (current && marks.updated('shoeSize')) { <span class="updated-pill">Updated</span> }</dt><dd>{{ entry.shoeSize ?? 'Not set' }}</dd>
        </div>
        <div class="row" [class.row--updated]="current && marks.updated('fitNotes')" (appOnScreen)="current && marks.rowOnScreen('fitNotes')">
          <dt>Fit notes@if (current && marks.updated('fitNotes')) { <span class="updated-pill">Updated</span> }</dt><dd>{{ entry.fitNotes ?? 'Not set' }}</dd>
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
