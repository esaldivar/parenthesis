import { NgTemplateOutlet } from '@angular/common';
import { ChangeDetectionStrategy, Component, effect, inject } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, ValidationErrors, Validators } from '@angular/forms';
import { SchoolHistoryPage, SchoolValues, SchoolView } from '../../../../core/api/api';
import { AppDatePipe } from '../../../../core/i18n/locale-formatting';
import { LocaleService } from '../../../../core/i18n/locale.service';
import { TranslatePipe, TranslationKey } from '../../../../core/i18n/translations';
import { essentialsOption } from '../../essentials-options';
import { OnScreen, sectionUpdates } from '../../essentials-updates';
import { RevisionedSection } from '../../revisioned-section';
import { teacherPhoneDisplay } from './teacher-phone';

type SchoolField = keyof SchoolValues;

/** The School rows in the approved order (#655), with their labels. */
const FIELDS: readonly { readonly key: SchoolField; readonly label: TranslationKey }[] = [
  { key: 'schoolName', label: 'essentials.school.name' },
  { key: 'schoolAddress', label: 'essentials.school.address' },
  { key: 'grade', label: 'feature.grade' },
  { key: 'homeroomTeacher', label: 'feature.homeroom.teacher' },
  { key: 'teacherEmail', label: 'essentials.school.teacherEmail' },
  { key: 'teacherPhone', label: 'essentials.school.teacherPhone' },
  { key: 'parentConcerns', label: 'feature.parent.concerns' },
];

/** Fields every School save has had; the ones added in #655 show in history only when that save had them. */
const ORIGINAL_FIELDS: ReadonlySet<SchoolField> = new Set(['grade', 'homeroomTeacher', 'parentConcerns']);

/** One @ with text on both sides and no spaces, like the server: catches typos without rejecting real addresses. */
function teacherEmail(control: { value: string }): ValidationErrors | null {
  const value = control.value.trim();
  if (!value) return null;
  const at = value.indexOf('@');
  return at > 0 && at === value.lastIndexOf('@') && at < value.length - 1 && !/\s/.test(value) ? null : { email: true };
}

@Component({
  selector: 'app-school-section',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [TranslatePipe, AppDatePipe, NgTemplateOutlet, ReactiveFormsModule, OnScreen],
  template: `
    <!-- The original School illustration, large and faint behind the panels (#655). Decorative. -->
    <img class="art" src="art/child-essentials/school.webp" alt="" />
    <section aria-labelledby="school-heading">
      <h3 id="school-heading" class="visually-hidden">{{ 'feature.school' | tr }}</h3>
      @if (error()) {
        <p role="alert">{{ error() }}</p>
      }
      @if (current(); as saved) {
        @if (editing()) {
          <form [formGroup]="form" (ngSubmit)="save()" novalidate>
            @if (conflict(); as latest) {
              <div class="latest">
                <p role="alert">{{ 'feature.your.co.parent.saved.changes.first.review' | tr }}</p>
                <h4>{{ 'feature.latest.saved.values' | tr }}</h4>
                <ng-container *ngTemplateOutlet="values; context: { $implicit: latest.values }" />
              </div>
            }
            <fieldset [disabled]="saving()">
              <legend class="visually-hidden">{{ 'feature.school.information' | tr }}</legend>
              <label class="field"><span class="label">{{ 'essentials.school.name' | tr }}</span>
                <input formControlName="schoolName" maxlength="1000" autocomplete="off" />
              </label>
              <label class="field"><span class="label">{{ 'essentials.school.address' | tr }}</span>
                <input formControlName="schoolAddress" maxlength="1000" autocomplete="off" />
              </label>
              <label class="field"><span class="label">{{ 'feature.grade' | tr }}</span>
                <select formControlName="grade">
                  <option value="">{{ 'feature.not.set' | tr }}</option>
                  @for (grade of grades; track grade) {
                    <option [value]="grade">{{ optionLabel(grade, locale.locale()) }}</option>
                  }
                </select>
              </label>
              @if (canSetHomeroom()) {
                <label class="field"><span class="label">{{ 'feature.homeroom.teacher.optional' | tr }}</span>
                  <input formControlName="homeroomTeacher" maxlength="1000" autocomplete="off" />
                </label>
              }
              <label class="field"><span class="label">{{ 'essentials.school.teacherEmail' | tr }}</span>
                <input formControlName="teacherEmail" type="email" inputmode="email" maxlength="254" autocomplete="off"
                  spellcheck="false" [attr.aria-invalid]="emailInvalid()" [attr.aria-describedby]="emailInvalid() ? 'school-email-error' : null" />
                @if (emailInvalid()) {
                  <span id="school-email-error" class="field-error">{{ 'essentials.school.emailInvalid' | tr }}</span>
                }
              </label>
              <label class="field"><span class="label">{{ 'essentials.school.teacherPhone' | tr }}</span>
                <input formControlName="teacherPhone" type="tel" inputmode="tel" maxlength="64" autocomplete="off" />
              </label>
              <label class="field"><span class="label">{{ 'feature.parent.concerns.optional' | tr }}</span>
                <textarea formControlName="parentConcerns" maxlength="1000"></textarea>
              </label>
              <div class="actions">
                <button type="submit" class="action">
                  {{ saving() ? ('feature.saving' | tr) : conflict() ? ('feature.save.my.draft' | tr) : ('feature.save' | tr) }}
                </button>
                <button type="button" class="action" (click)="cancel()">{{ 'feature.cancel' | tr }}</button>
              </div>
            </fieldset>
          </form>
        } @else {
          <ng-container *ngTemplateOutlet="values; context: { $implicit: saved.values, current: true }" />
          <div class="actions">
            <button type="button" class="action" (click)="edit(saved)">{{ 'feature.edit' | tr }}<span class="visually-hidden"> {{ 'feature.school' | tr }}</span></button>
            <button type="button" class="action" [attr.aria-expanded]="historyOpen()" aria-controls="school-history"
              (click)="toggleHistory()">{{ 'feature.history' | tr }}</button>
          </div>
          <p role="status">{{ notice() }}</p>
        }
        <div id="school-history" class="history" [hidden]="!historyOpen() || editing()">
          <h4>{{ 'feature.school.history' | tr }}</h4>
          @if (historyError()) {
            <p role="alert">{{ 'feature.history.couldn.t.be.loaded' | tr }}</p>
            <button type="button" class="action" (click)="loadHistory(nextRevision())">{{ 'feature.try.again' | tr }}</button>
          } @else if (historyLoading()) {
            <p role="status">{{ 'feature.loading.history' | tr }}</p>
          } @else if (!history().length) {
            <p>{{ 'feature.no.changes.yet' | tr }}</p>
          }
          @for (entry of history(); track entry.revision) {
            <article>
              <h5>{{ entry.editedBy }} · <time [attr.datetime]="entry.editedAt">{{ entry.editedAt | appDate: 'medium' }}</time></h5>
              <div class="comparison">
                <div><h6>{{ 'feature.previous.values' | tr }}</h6>
                  <ng-container *ngTemplateOutlet="values; context: { $implicit: entry.previous, also: entry.current }" />
                </div>
                <div><h6>{{ 'feature.saved.values' | tr }}</h6>
                  <ng-container *ngTemplateOutlet="values; context: { $implicit: entry.current, also: entry.previous }" />
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
        <p role="status">{{ 'feature.loading.school' | tr }}</p>
      }
    </section>
    <ng-template #values let-entry let-current="current" let-also="also">
      <dl class="panel">
        @for (field of shownFields(entry, also); track field.key) {
          <div class="row" (appOnScreen)="current && marks.rowOnScreen(field.key)">
            <dt><span class="label">{{ field.label | tr }}</span>
              @if (current && marks.updated(field.key)) { <span class="updated">{{ 'feature.updated' | tr }}</span> }
            </dt>
            <dd>{{ display(field.key, entry[field.key]) ?? ('essentials.copy.notSet' | tr) }}</dd>
          </div>
        }
      </dl>
    </ng-template>
  `,
  styleUrl: './school-section.component.css',
})
export class SchoolSection extends RevisionedSection<SchoolView, SchoolValues, SchoolHistoryPage['entries'][number]> {
  protected readonly locale = inject(LocaleService);
  protected readonly optionLabel = essentialsOption;
  protected readonly marks = sectionUpdates('school', this.childId);
  protected readonly savedNoticeKey = 'essentials.school.saved';
  protected readonly grades = ['Pre-K', 'Kindergarten', '1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12'];
  protected readonly form = new FormGroup({
    schoolName: new FormControl('', { nonNullable: true, validators: Validators.maxLength(1000) }),
    schoolAddress: new FormControl('', { nonNullable: true, validators: Validators.maxLength(1000) }),
    grade: new FormControl('', { nonNullable: true, validators: Validators.maxLength(1000) }),
    homeroomTeacher: new FormControl('', { nonNullable: true, validators: Validators.maxLength(1000) }),
    teacherEmail: new FormControl('', { nonNullable: true, validators: [Validators.maxLength(254), teacherEmail] }),
    teacherPhone: new FormControl('', { nonNullable: true, validators: Validators.maxLength(64) }),
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
      this.error.set('feedback.school.couldn.t.be.loaded');
    }
  }

  protected canSetHomeroom(): boolean {
    const index = this.grades.indexOf(this.form.controls.grade.value);
    return index >= 0 && index < 7;
  }

  /** Shown once the parent has typed in the field and moved on, or tried to save. */
  protected emailInvalid(): boolean {
    const control = this.form.controls.teacherEmail;
    return control.hasError('email') && control.touched;
  }

  /**
   * The rows to show for a set of values. Saved values show every field; a history entry made before the new fields
   * existed shows only what it had, unless the other side of the comparison has a value.
   */
  protected shownFields(entry: SchoolValues, also?: SchoolValues) {
    if (!also) return FIELDS;
    return FIELDS.filter(({ key }) => ORIGINAL_FIELDS.has(key) || !!entry[key] || !!also[key]);
  }

  /** The saved text, or null for Not set. Grades are translated and U.S. phone numbers formatted; nothing else. */
  protected display(field: SchoolField, value: string | null | undefined): string | null {
    if (!value) return null;
    if (field === 'grade') return this.optionLabel(value, this.locale.locale());
    if (field === 'teacherPhone') return teacherPhoneDisplay(value);
    return value;
  }

  protected edit(saved: SchoolView): void {
    const values = saved.values;
    this.form.reset({
      schoolName: values.schoolName ?? '', schoolAddress: values.schoolAddress ?? '', grade: values.grade ?? '',
      homeroomTeacher: values.homeroomTeacher ?? '', teacherEmail: values.teacherEmail ?? '',
      teacherPhone: values.teacherPhone ?? '', parentConcerns: values.parentConcerns ?? '',
    });
    this.historyOpen.set(false);
    this.notice.set('');
    this.editing.set(true);
  }

  protected override async save(): Promise<void> {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    await super.save();
  }

  protected store(revision: number, values: SchoolValues): Promise<SchoolView> {
    return this.api.saveSchool(this.familyId(), this.childId(), { revision, values });
  }

  protected historyPage(beforeRevision: number | null) {
    return this.api.schoolHistory(this.familyId(), this.childId(), beforeRevision);
  }

  /** A homeroom teacher only goes with pre-K through fifth grade. */
  protected override valuesToSave(): SchoolValues {
    const values = this.form.getRawValue();
    return { ...values, homeroomTeacher: this.canSetHomeroom() ? values.homeroomTeacher : null };
  }
}
