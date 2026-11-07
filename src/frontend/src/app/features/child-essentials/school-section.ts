import { DatePipe, NgTemplateOutlet } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import {
  ChangeDetectionStrategy, Component, DestroyRef, effect, inject, input, signal,
} from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { OnScreen, sectionUpdates } from './essentials-updates';
import { Api, SchoolHistoryPage, SchoolView } from '../../core/api/api';

@Component({
  selector: 'app-school-section',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DatePipe, NgTemplateOutlet, ReactiveFormsModule, OnScreen],
  template: `
    <section aria-labelledby="school-heading">
      <h3 id="school-heading">School
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
              <legend>School information</legend>
              <label>Grade <select formControlName="grade">
                <option value="">Not set</option>
                @for (grade of grades; track grade) {
                  <option [value]="grade">{{ grade }}</option>
                }
              </select></label>
              @if (canSetHomeroom()) {
                <label>Homeroom teacher (optional)
                  <input formControlName="homeroomTeacher" maxlength="1000" />
                </label>
              }
              <label>Parent concerns (optional) <textarea formControlName="parentConcerns" maxlength="1000"></textarea></label>
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
            <button type="button" (click)="edit(saved)">Edit School</button>
            <button type="button" [attr.aria-expanded]="historyOpen()" aria-controls="school-history"
              (click)="toggleHistory()">History</button>
          </div>
          <p role="status">{{ notice() }}</p>
        }
        <div id="school-history" [hidden]="!historyOpen() || editing()">
          <h4>School history</h4>
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
        <p role="status">Loading School…</p>
      }
    </section>
    <ng-template #values let-entry let-current="current">
      <dl>
        <div class="row" [class.row--updated]="current && marks.updated('grade')" (appOnScreen)="current && marks.rowOnScreen('grade')">
          <dt>Grade@if (current && marks.updated('grade')) { <span class="updated-pill">Updated</span> }</dt><dd>{{ entry.grade ?? 'Not set' }}</dd>
        </div>
        <div class="row" [class.row--updated]="current && marks.updated('homeroomTeacher')" (appOnScreen)="current && marks.rowOnScreen('homeroomTeacher')">
          <dt>Homeroom teacher@if (current && marks.updated('homeroomTeacher')) { <span class="updated-pill">Updated</span> }</dt><dd>{{ entry.homeroomTeacher ?? 'Not set' }}</dd>
        </div>
        <div class="row" [class.row--updated]="current && marks.updated('parentConcerns')" (appOnScreen)="current && marks.rowOnScreen('parentConcerns')">
          <dt>Parent concerns@if (current && marks.updated('parentConcerns')) { <span class="updated-pill">Updated</span> }</dt><dd>{{ entry.parentConcerns ?? 'Not set' }}</dd>
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
export class SchoolSection {
  readonly familyId = input.required<string>();
  readonly childId = input.required<string>();
  protected readonly marks = sectionUpdates('school', this.childId);
  private readonly api = inject(Api);
  private readonly destroyRef = inject(DestroyRef);
  protected readonly current = signal<SchoolView | null>(null);
  protected readonly conflict = signal<SchoolView | null>(null);
  protected readonly editing = signal(false);
  protected readonly saving = signal(false);
  protected readonly error = signal('');
  protected readonly notice = signal('');
  protected readonly historyOpen = signal(false);
  protected readonly historyLoading = signal(false);
  protected readonly historyError = signal(false);
  protected readonly history = signal<SchoolHistoryPage['entries']>([]);
  protected readonly nextRevision = signal<number | null>(null);
  protected readonly grades = ['Pre-K', 'Kindergarten', '1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12'];
  protected readonly form = new FormGroup({
    homeroomTeacher: new FormControl('', { nonNullable: true, validators: Validators.maxLength(1000) }),
    grade: new FormControl('', { nonNullable: true, validators: Validators.maxLength(1000) }),
    parentConcerns: new FormControl('', { nonNullable: true, validators: Validators.maxLength(1000) }),
  });

  constructor() {
    effect(() => { void this.load(); });
  }

  protected async load(): Promise<void> {
    this.error.set('');
    try {
      this.current.set(await this.api.school(this.familyId(), this.childId()));
    } catch {
      this.error.set('School couldn’t be loaded.');
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

  protected cancel(): void {
    if (this.conflict() !== null) {
      this.current.set(this.conflict());
    }
    this.conflict.set(null);
    this.error.set('');
    this.editing.set(false);
  }

  protected async save(): Promise<void> {
    const base = this.conflict() ?? this.current();
    if (!base || this.saving() || this.form.invalid) return;
    const values = this.form.getRawValue();
    this.saving.set(true);
    this.error.set('');
    try {
      const saved = await this.api.saveSchool(this.familyId(), this.childId(), {
        revision: base.revision, values: { ...values, homeroomTeacher: this.canSetHomeroom() ? values.homeroomTeacher : null },
      });
      if (this.destroyRef.destroyed) return;
      this.current.set(saved);
      this.conflict.set(null);
      this.editing.set(false);
      this.notice.set('School saved.');
    } catch (error) {
      if (error instanceof HttpErrorResponse && error.status === 409) {
        this.conflict.set(error.error as SchoolView);
      } else {
        this.error.set('Changes couldn’t be saved. Your draft is still here.');
      }
    } finally {
      this.saving.set(false);
    }
  }

  protected toggleHistory(): void {
    const open = !this.historyOpen();
    this.historyOpen.set(open);
    if (open) void this.loadHistory(null);
  }

  protected async loadHistory(beforeRevision: number | null): Promise<void> {
    if (this.historyLoading()) return;
    this.historyLoading.set(true);
    this.historyError.set(false);
    if (beforeRevision === null) {
      this.history.set([]);
      this.nextRevision.set(null);
    }
    try {
      const page = await this.api.schoolHistory(this.familyId(), this.childId(), beforeRevision);
      this.history.update((entries) => [...entries, ...page.entries]);
      this.nextRevision.set(page.beforeRevision);
    } catch {
      this.historyError.set(true);
    } finally {
      this.historyLoading.set(false);
    }
  }
}
