import { inject } from '@angular/core';
import { LocaleService } from '../../core/i18n/locale.service';
import { AppDatePipe } from '../../core/i18n/locale-formatting';
import { TranslatePipe, translate } from '../../core/i18n/translations';
import { NgTemplateOutlet } from '@angular/common';
import { ChangeDetectionStrategy, Component, effect } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { Icon } from '../../shared/icon/icon';
import { OnScreen, sectionUpdates } from './essentials-updates';
import { RevisionedSection } from './revisioned-section';
import { SchoolHistoryPage, SchoolView } from '../../core/api/api';

@Component({
  selector: 'app-school-section',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [TranslatePipe, AppDatePipe, NgTemplateOutlet, ReactiveFormsModule, OnScreen, Icon],
  template: `
    <section aria-labelledby="school-heading">
      <h3 id="school-heading">{{ 'feature.school' | tr }}
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
              <legend>{{ 'feature.school.information' | tr }}</legend>
              <label>{{ 'feature.grade' | tr }} <select formControlName="grade">
                <option value="">{{ 'feature.not.set' | tr }}</option>
                @for (grade of grades; track grade) {
                  <option [value]="grade">{{ grade }}</option>
                }
              </select></label>
              @if (canSetHomeroom()) {
                <label>{{ 'feature.homeroom.teacher.optional' | tr }}
                  <input formControlName="homeroomTeacher" maxlength="1000" />
                </label>
              }
              <label>{{ 'feature.parent.concerns.optional' | tr }} <textarea formControlName="parentConcerns" maxlength="1000"></textarea></label>
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
            <button type="button" class="pill" (click)="edit(saved)"><app-icon name="pencil" [size]="18" />{{ 'feature.edit' | tr }}<span class="visually-hidden"> {{ 'feature.school' | tr }}</span></button>
            <button type="button" class="pill" [attr.aria-expanded]="historyOpen()" aria-controls="school-history"
              (click)="toggleHistory()"><app-icon name="history" [size]="18" />{{ 'feature.history' | tr }}</button>
          </div>
          <p role="status">{{ notice() }}</p>
        }
        <div id="school-history" [hidden]="!historyOpen() || editing()">
          <h4>{{ 'feature.school.history' | tr }}</h4>
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
        <p role="status">{{ 'feature.loading.school' | tr }}</p>
      }
    </section>
    <ng-template #values let-entry let-current="current">
      <dl>
        <div class="row" [class.row--updated]="current && marks.updated('grade')" (appOnScreen)="current && marks.rowOnScreen('grade')">
          <dt>{{ 'feature.grade' | tr }}@if (current && marks.updated('grade')) { <span class="updated-pill">{{ 'feature.updated' | tr }}</span> }</dt><dd>{{ entry.grade ?? 'Not set' }}</dd>
        </div>
        <div class="row" [class.row--updated]="current && marks.updated('homeroomTeacher')" (appOnScreen)="current && marks.rowOnScreen('homeroomTeacher')">
          <dt>{{ 'feature.homeroom.teacher' | tr }}@if (current && marks.updated('homeroomTeacher')) { <span class="updated-pill">{{ 'feature.updated' | tr }}</span> }</dt><dd>{{ entry.homeroomTeacher ?? 'Not set' }}</dd>
        </div>
        <div class="row" [class.row--updated]="current && marks.updated('parentConcerns')" (appOnScreen)="current && marks.rowOnScreen('parentConcerns')">
          <dt>{{ 'feature.parent.concerns' | tr }}@if (current && marks.updated('parentConcerns')) { <span class="updated-pill">{{ 'feature.updated' | tr }}</span> }</dt><dd>{{ entry.parentConcerns ?? 'Not set' }}</dd>
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
export class SchoolSection extends RevisionedSection<SchoolView, SchoolView['values'], SchoolHistoryPage['entries'][number]> {
  private readonly locale = inject(LocaleService);
  protected readonly marks = sectionUpdates('school', this.childId);
  protected readonly savedNotice = 'School saved.';
  protected readonly grades = ['Pre-K', 'Kindergarten', '1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12'];
  protected readonly form = new FormGroup({
    homeroomTeacher: new FormControl('', { nonNullable: true, validators: Validators.maxLength(1000) }),
    grade: new FormControl('', { nonNullable: true, validators: Validators.maxLength(1000) }),
    parentConcerns: new FormControl('', { nonNullable: true, validators: Validators.maxLength(1000) }),
  });

  constructor() {
    super();
    effect(() => { void this.load(); });
  }

  protected async load(): Promise<void> {
    this.error.set('');
    try {
      this.current.set(await this.api.school(this.familyId(), this.childId()));
    } catch {
      this.error.set(translate('feedback.school.couldn.t.be.loaded', this.locale.locale()));
    }
  }

  protected canSetHomeroom(): boolean {
    const index = this.grades.indexOf(this.form.controls.grade.value);
    return index >= 0 && index < 7;
  }

  protected edit(saved: SchoolView): void {
    const { grade, homeroomTeacher, parentConcerns } = saved.values;
    this.form.reset({
      grade: grade ?? '', homeroomTeacher: homeroomTeacher ?? '', parentConcerns: parentConcerns ?? '',
    });
    this.historyOpen.set(false);
    this.notice.set('');
    this.editing.set(true);
  }

  protected store(revision: number, values: SchoolView['values']): Promise<SchoolView> {
    return this.api.saveSchool(this.familyId(), this.childId(), { revision, values });
  }

  protected historyPage(beforeRevision: number | null) {
    return this.api.schoolHistory(this.familyId(), this.childId(), beforeRevision);
  }

  /** A homeroom teacher only goes with pre-K through fifth grade. */
  protected override valuesToSave(): SchoolView['values'] {
    const values = this.form.getRawValue();
    return { ...values, homeroomTeacher: this.canSetHomeroom() ? values.homeroomTeacher : null };
  }
}
