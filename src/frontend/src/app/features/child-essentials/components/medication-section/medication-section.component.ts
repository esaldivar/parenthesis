import { DOCUMENT, NgTemplateOutlet } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import {
  ChangeDetectionStrategy, Component, DestroyRef, ElementRef, Injector, afterNextRender, computed, effect, inject, input,
  signal, viewChild,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormControl, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { Api, Child, MedicationHistoryEntry, MedicationItem, MedicationValues, MedicationView } from '../../../../core/api/api';
import { AppDatePipe } from '../../../../core/i18n/locale-formatting';
import { TranslatePipe } from '../../../../core/i18n/translations';
import { Icon } from '../../../../shared/icon/icon';
import { localizedMessage } from '../../localized-message';

export const MEDICATION_LIMITS = { name: 100, dose: 100, schedule: 200, instructions: 1000 } as const;

/** What a parent is doing: editing an entry (null id for a new one), changing its status, or deleting it. */
type Step =
  | { readonly kind: 'edit'; readonly entry: MedicationItem | null }
  | { readonly kind: 'status'; readonly entry: MedicationItem }
  | { readonly kind: 'delete'; readonly entry: MedicationItem };

/** History shows a permanent delete as a save that changed nothing it can still show. */
export function isDeletion(entry: MedicationHistoryEntry): boolean {
  return JSON.stringify(entry.previous) === JSON.stringify(entry.current);
}

/**
 * A child's parent-entered medication reference (#127, docs/privacy/medication-preflight-127.md): name, prescribed
 * dose, schedule and instructions, current first and discontinued below. Reference only: no dose calculations,
 * reminders or tracking. Each parent confirms the notice once before their first change. Discontinue keeps an entry
 * in history; Delete permanently removes it from history too.
 */
@Component({
  selector: 'app-medication-section',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [TranslatePipe, AppDatePipe, Icon, NgTemplateOutlet, ReactiveFormsModule],
  styleUrls: ['../../essentials-section.css', './medication-section.component.css'],
  template: `
    <section aria-labelledby="medication-heading">
      <div class="heading-row">
        <h2 id="medication-heading">{{ 'medication.heading' | tr }}</h2>
        <button type="button" [attr.aria-expanded]="exportOpen()" aria-controls="medication-pdf-options"
          (click)="exportOpen.set(!exportOpen())">{{ 'medication.pdf.open' | tr }}</button>
      </div>
      <p class="reference">{{ 'medication.reference' | tr }}</p>
      <div id="medication-pdf-options" class="pdf-options" [hidden]="!exportOpen()">
        <label>{{ 'medication.pdf.include' | tr }}
          <select #exportChild [disabled]="exporting()">
            <option [value]="childId()">{{ 'feature.current.child' | tr }}</option>
            @for (child of children(); track child.id) {
              @if (child.id !== childId()) { <option [value]="child.id">{{ child.firstName }}</option> }
            }
            <option value="">{{ 'feature.all.children' | tr }}</option>
          </select>
        </label>
        <label class="check"><input type="checkbox" #currentOnly [disabled]="exporting()" /> {{ 'medication.pdf.currentOnly' | tr }}</label>
        <button type="button" [disabled]="exporting()" (click)="downloadPdf(exportChild.value, currentOnly.checked)">
          {{ exporting() ? ('feature.preparing.pdf' | tr) : ('feature.download.pdf' | tr) }}
        </button>
        <p role="status">{{ exportNotice() }}</p>
      </div>

      @if (error()) { <p role="alert">{{ error() }}</p> }
      <p role="status">{{ notice() }}</p>

      @if (view(); as saved) {
        @if (step(); as active) {
          <div class="editor">
            <h3 tabindex="-1" #stepHeading>
              @switch (active.kind) {
                @case ('edit') { {{ (active.entry ? 'medication.edit' : 'medication.add') | tr }} }
                @case ('status') { {{ (active.entry.discontinued ? 'medication.resume' : 'medication.discontinue') | tr }} }
                @case ('delete') { {{ 'medication.delete' | tr }} }
              }
            </h3>
            @if (conflict()) { <p role="alert">{{ 'medication.conflict' | tr }}</p> }
            <form [formGroup]="form" (ngSubmit)="submit()">
              <fieldset [disabled]="saving()">
                @switch (active.kind) {
                  @case ('edit') {
                    <label>{{ 'medication.field.name' | tr }}
                      <input formControlName="name" [maxLength]="limits.name" required autocomplete="off" />
                    </label>
                    @if (form.controls.name.touched && form.controls.name.invalid) {
                      <p role="alert">{{ 'medication.nameRequired' | tr }}</p>
                    }
                    <label>{{ 'medication.field.dose' | tr }} {{ 'feature.optional' | tr }}
                      <input formControlName="dose" [maxLength]="limits.dose" autocomplete="off" />
                    </label>
                    <label>{{ 'medication.field.schedule' | tr }} {{ 'feature.optional' | tr }}
                      <input formControlName="schedule" [maxLength]="limits.schedule" autocomplete="off" />
                    </label>
                    <label>{{ 'medication.field.instructions' | tr }} {{ 'feature.optional' | tr }}
                      <textarea formControlName="instructions" rows="3" [maxLength]="limits.instructions"></textarea>
                    </label>
                  }
                  @case ('status') {
                    <p>{{ (active.entry.discontinued ? 'medication.resume.explain' : 'medication.discontinue.explain') | tr: { name: active.entry.name } }}</p>
                  }
                  @case ('delete') {
                    <p>{{ 'medication.delete.explain' | tr: { name: active.entry.name } }}</p>
                  }
                }
                @if (active.kind !== 'delete' && !saved.acknowledged) {
                  <div class="acknowledge">
                    <p>{{ 'medication.ack.text' | tr }}</p>
                    <label class="check"><input type="checkbox" formControlName="acknowledge" required /> {{ 'medication.ack.label' | tr }}</label>
                  </div>
                }
                <div class="actions">
                  <button type="submit" class="primary" [class.danger]="active.kind === 'delete'" [disabled]="!canSubmit()">
                    @if (saving()) { {{ 'feature.saving' | tr }} } @else {
                      @switch (active.kind) {
                        @case ('edit') { {{ 'medication.save' | tr }} }
                        @case ('status') { {{ (active.entry.discontinued ? 'medication.resume' : 'medication.discontinue') | tr }} }
                        @case ('delete') { {{ 'medication.delete.confirm' | tr }} }
                      }
                    }
                  </button>
                  <button type="button" (click)="cancel()">{{ 'feature.cancel' | tr }}</button>
                </div>
              </fieldset>
            </form>
          </div>
        } @else {
          <h3>{{ 'medication.current' | tr }}</h3>
          @for (entry of currentEntries(); track entry.id) {
            <ng-container *ngTemplateOutlet="row; context: { $implicit: entry }" />
          } @empty {
            <p>{{ 'medication.current.empty' | tr }}</p>
          }
          <div class="actions">
            <button type="button" class="primary" #addButton (click)="open({ kind: 'edit', entry: null })">
              <app-icon name="plus" [size]="20" /> {{ 'medication.add' | tr }}
            </button>
            <button type="button" [attr.aria-expanded]="historyOpen()" (click)="toggleHistory()">{{ 'feature.history' | tr }}</button>
          </div>
          @if (discontinuedEntries().length) {
            <h3>{{ 'medication.discontinued' | tr }}</h3>
            @for (entry of discontinuedEntries(); track entry.id) {
              <ng-container *ngTemplateOutlet="row; context: { $implicit: entry }" />
            }
          }
        }

        @if (historyOpen() && !step()) {
          <h3>{{ 'medication.history' | tr }}</h3>
          @if (historyError()) {
            <p role="alert">{{ 'feature.history.couldn.t.be.loaded' | tr }}</p>
            <button type="button" (click)="loadHistory(nextRevision())">{{ 'feature.try.again' | tr }}</button>
          } @else if (historyLoading()) {
            <p role="status">{{ 'feature.loading.history' | tr }}</p>
          } @else if (!history().length) {
            <p>{{ 'feature.no.changes.yet' | tr }}</p>
          }
          @for (change of history(); track change.revision) {
            <article class="history">
              <h4>{{ change.editedBy }} · <time [attr.datetime]="change.editedAt">{{ change.editedAt | appDate:'medium' }}</time></h4>
              @if (deletion(change)) {
                <p>{{ 'medication.history.deleted' | tr }}</p>
              } @else {
                <div class="comparison">
                  <div><strong>{{ 'medication.history.before' | tr }}</strong>
                    <ng-container *ngTemplateOutlet="summary; context: { $implicit: change.previous }" /></div>
                  <div><strong>{{ 'medication.history.after' | tr }}</strong>
                    <ng-container *ngTemplateOutlet="summary; context: { $implicit: change.current }" /></div>
                </div>
              }
            </article>
          }
          @if (nextRevision() !== null && !historyLoading() && !historyError()) {
            <button type="button" (click)="loadHistory(nextRevision())">{{ 'feature.show.older.changes' | tr }}</button>
          }
        }
      } @else if (error()) {
        <button type="button" (click)="load()">{{ 'feature.try.again' | tr }}</button>
      } @else {
        <p role="status">{{ 'medication.loading' | tr }}</p>
      }
    </section>

    <ng-template #row let-entry>
      <article class="entry medication" [class.discontinued]="entry.discontinued">
        <h4>{{ entry.name }}</h4>
        <dl>
          @if (entry.dose) { <div class="row"><dt>{{ 'medication.field.dose' | tr }}</dt><dd>{{ entry.dose }}</dd></div> }
          @if (entry.schedule) { <div class="row"><dt>{{ 'medication.field.schedule' | tr }}</dt><dd>{{ entry.schedule }}</dd></div> }
          @if (entry.instructions) { <div class="row"><dt>{{ 'medication.field.instructions' | tr }}</dt><dd>{{ entry.instructions }}</dd></div> }
        </dl>
        <p class="updated">{{ 'medication.updatedBy' | tr: { name: entry.updatedBy } }}
          <time [attr.datetime]="entry.updatedAt">{{ entry.updatedAt | appDate:'medium' }}</time></p>
        <div class="actions management">
          @if (!entry.discontinued) {
            <button type="button" [attr.aria-label]="('medication.edit.for' | tr: { name: entry.name })" (click)="open({ kind: 'edit', entry })">{{ 'feature.edit' | tr }}</button>
          }
          <button type="button" [attr.aria-label]="((entry.discontinued ? 'medication.resume.for' : 'medication.discontinue.for') | tr: { name: entry.name })"
            (click)="open({ kind: 'status', entry })">{{ (entry.discontinued ? 'medication.resume' : 'medication.discontinue') | tr }}</button>
          <button type="button" [attr.aria-label]="('medication.delete.for' | tr: { name: entry.name })" (click)="open({ kind: 'delete', entry })">{{ 'medication.delete' | tr }}</button>
        </div>
      </article>
    </ng-template>

    <ng-template #summary let-entries>
      @if (entries.length) {
        <ul>
          @for (entry of entries; track entry.id) {
            <li>{{ entry.name }}@if (entry.dose) { · {{ entry.dose }} }@if (entry.schedule) { · {{ entry.schedule }} }@if (entry.instructions) { · {{ entry.instructions }} }@if (entry.discontinued) { · {{ 'medication.discontinued.short' | tr }} }</li>
          }
        </ul>
      } @else { <p>{{ 'medication.history.none' | tr }}</p> }
    </ng-template>
  `,
})
export class MedicationSection {
  readonly familyId = input.required<string>();
  readonly childId = input.required<string>();
  readonly children = input.required<readonly Child[]>();
  private readonly api = inject(Api);
  private readonly destroyRef = inject(DestroyRef);
  private readonly injector = inject(Injector);
  private readonly document = inject(DOCUMENT);
  private readonly addButton = viewChild<ElementRef<HTMLElement>>('addButton');
  private readonly stepHeading = viewChild<ElementRef<HTMLElement>>('stepHeading');
  protected readonly limits = MEDICATION_LIMITS;
  protected readonly deletion = isDeletion;

  protected readonly view = signal<MedicationView | null>(null);
  protected readonly step = signal<Step | null>(null);
  protected readonly conflict = signal(false);
  protected readonly saving = signal(false);
  protected readonly error = localizedMessage();
  protected readonly notice = localizedMessage();
  protected readonly exportOpen = signal(false);
  protected readonly exporting = signal(false);
  protected readonly exportNotice = localizedMessage();
  protected readonly historyOpen = signal(false);
  protected readonly historyLoading = signal(false);
  protected readonly historyError = signal(false);
  protected readonly history = signal<readonly MedicationHistoryEntry[]>([]);
  protected readonly nextRevision = signal<number | null>(null);
  private readonly formState = signal(0);

  protected readonly currentEntries = computed(() => this.view()?.entries.filter(entry => !entry.discontinued) ?? []);
  protected readonly discontinuedEntries = computed(() => this.view()?.entries.filter(entry => entry.discontinued) ?? []);

  protected readonly form = new FormGroup({
    name: new FormControl('', { nonNullable: true }),
    dose: new FormControl('', { nonNullable: true }),
    schedule: new FormControl('', { nonNullable: true }),
    instructions: new FormControl('', { nonNullable: true }),
    acknowledge: new FormControl(false, { nonNullable: true }),
  });

  protected readonly canSubmit = computed(() => {
    this.formState();
    const active = this.step();
    if (!active || this.saving()) return false;
    if (active.kind === 'edit' && !this.form.controls.name.value.trim()) return false;
    return active.kind === 'delete' || this.view()?.acknowledged === true || this.form.controls.acknowledge.value;
  });

  constructor() {
    effect(() => { void this.load(); });
    this.form.valueChanges.pipe(takeUntilDestroyed()).subscribe(() => this.formState.update(value => value + 1));
  }

  /**
   * Loads the selected child's medication. Switching children clears what was shown first, and an answer for a child
   * who is no longer selected is ignored, so one child's medication never shows under another child.
   */
  protected async load(): Promise<void> {
    const childId = this.childId();
    this.error.set('');
    this.view.set(null);
    this.step.set(null);
    this.historyOpen.set(false);
    try {
      const saved = await this.api.medication(this.familyId(), childId);
      if (!this.destroyRef.destroyed && childId === this.childId()) this.view.set(saved);
    } catch {
      if (childId === this.childId()) this.error.set('medication.loadError');
    }
  }

  protected open(step: Step): void {
    this.step.set(step);
    this.conflict.set(false);
    this.error.set('');
    this.notice.set('');
    const entry = step.entry;
    this.form.reset({
      name: entry?.name ?? '', dose: entry?.dose ?? '', schedule: entry?.schedule ?? '',
      instructions: entry?.instructions ?? '', acknowledge: false,
    });
    this.focusAfterRender(this.stepHeading);
  }

  protected cancel(): void {
    this.step.set(null);
    this.conflict.set(false);
    this.error.set('');
    this.focusAfterRender(this.addButton);
  }

  protected async submit(): Promise<void> {
    const active = this.step();
    const base = this.view();
    if (!active || !base || !this.canSubmit()) return;
    this.saving.set(true);
    this.error.set('');
    try {
      const saved = active.kind === 'delete'
        ? await this.api.deleteMedication(this.familyId(), this.childId(), active.entry.id)
        : await this.api.saveMedication(this.familyId(), this.childId(), base.revision, this.nextEntries(active, base),
          !base.acknowledged);
      if (this.destroyRef.destroyed) return;
      this.view.set(saved);
      this.step.set(null);
      this.conflict.set(false);
      this.notice.set(active.kind === 'delete' ? 'medication.deleted' : 'medication.saved');
      if (this.historyOpen()) void this.loadHistory(null);
      this.focusAfterRender(this.addButton);
    } catch (error) {
      if (error instanceof HttpErrorResponse && error.status === 409) {
        // The co-parent saved first: show their version and keep this parent's draft to save again.
        this.view.set(error.error as MedicationView);
        this.conflict.set(true);
      } else if (error instanceof HttpErrorResponse && error.status === 404 && active.kind === 'delete') {
        this.step.set(null);
        void this.load();
      } else {
        this.error.set('essentials.changes.error');
      }
    } finally {
      this.saving.set(false);
    }
  }

  private nextEntries(active: Step, base: MedicationView): MedicationValues[] {
    const values = (entry: MedicationValues): MedicationValues => ({
      id: entry.id, name: entry.name, dose: entry.dose, schedule: entry.schedule,
      instructions: entry.instructions, discontinued: entry.discontinued,
    });
    const entries = base.entries.map(values);
    if (active.kind === 'status') {
      return entries.map(entry => entry.id === active.entry.id ? { ...entry, discontinued: !active.entry.discontinued } : entry);
    }

    const raw = this.form.getRawValue();
    const edited: MedicationValues = {
      id: active.kind === 'edit' && active.entry ? active.entry.id : crypto.randomUUID(),
      name: raw.name.trim(), dose: raw.dose.trim() || null, schedule: raw.schedule.trim() || null,
      instructions: raw.instructions.trim() || null, discontinued: false,
    };
    return entries.some(entry => entry.id === edited.id)
      ? entries.map(entry => entry.id === edited.id ? edited : entry)
      : [...entries, edited];
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
      const page = await this.api.medicationHistory(this.familyId(), this.childId(), beforeRevision);
      this.history.update(entries => [...entries, ...page.entries]);
      this.nextRevision.set(page.beforeRevision);
    } catch {
      this.historyError.set(true);
    } finally {
      this.historyLoading.set(false);
    }
  }

  protected async downloadPdf(childId: string, currentOnly: boolean): Promise<void> {
    if (this.exporting()) return;
    this.exporting.set(true);
    this.exportNotice.set('');
    try {
      const { pdf, fileName } = await this.api.downloadMedicationPdf(this.familyId(), childId || null, currentOnly);
      if (this.destroyRef.destroyed) return;
      const url = URL.createObjectURL(pdf);
      const link = this.document.createElement('a');
      link.href = url;
      // The server's dated name, so each saved copy says when it was made.
      link.download = fileName;
      try {
        link.click();
        this.exportNotice.set('medication.pdf.ready');
      } finally {
        setTimeout(() => URL.revokeObjectURL(url), 1000);
      }
    } catch {
      this.exportNotice.set('medication.pdf.error');
    } finally {
      this.exporting.set(false);
    }
  }

  private focusAfterRender(element: () => ElementRef<HTMLElement> | undefined): void {
    afterNextRender({ read: () => element()?.nativeElement.focus() }, { injector: this.injector });
  }
}
