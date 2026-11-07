import { DatePipe, NgTemplateOutlet } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import {
  ChangeDetectionStrategy, Component, computed, DestroyRef, effect, inject, input, signal,
} from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { EssentialsUpdatesStore } from '../../core/essentials/essentials-updates.store';
import { OnScreen, sectionUpdates } from './essentials-updates';
import { Api, HouseholdRoutine, RoutinesHistoryPage, RoutinesView } from '../../core/api/api';

@Component({
  selector: 'app-routines-section',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DatePipe, NgTemplateOutlet, ReactiveFormsModule, OnScreen],
  template: `
    <section aria-labelledby="routines-heading" (appOnScreen)="marks.sectionOnScreen()">
      <h3 id="routines-heading">Routines
        @if (marks.dot()) {
          <span class="updated-badge"><span class="updated-dot" aria-hidden="true"></span>Updated</span>
        }
      </h3>
      <div class="actions" role="group" aria-label="Routine views">
        <button type="button" [attr.aria-pressed]="selectedOwner() === null" (click)="openHousehold(null)">Shared</button>
        @for (home of households(); track home.ownerId) {
          <button type="button" [attr.aria-pressed]="selectedOwner() === home.ownerId"
            (click)="openHousehold(home)">{{ home.isMine ? 'My routines' : home.ownerName + '’s routines' }}@if (
              !home.isMine && updates.unopened(childId(), 'householdRoutines')
            ) {<span class="visually-hidden">, updated</span><span class="updated-dot tab-dot" aria-hidden="true"></span>}</button>
        }
      </div>
      @if (householdError()) {
        <p role="alert">{{ householdError() }}</p>
        <button type="button" (click)="loadHouseholds()">Refresh household routines</button>
      }
      @if (selectedHousehold(); as home) {
        @if (home.isMine) {
          <fieldset [disabled]="householdSaving()">
            <legend>My household routine</legend>
            <label>Bedtime
              <textarea maxlength="1000" [value]="householdBedtime()" (input)="householdBedtime.set($any($event.target).value)"></textarea>
            </label>
            <label>Naps
              <textarea maxlength="1000" [value]="householdNaps()" (input)="householdNaps.set($any($event.target).value)"></textarea>
            </label>
            <button type="button" (click)="updateHousehold(home, 'save')">Save my routines</button>
          </fieldset>
          @if (householdConflict()) {
            <p>Latest saved values</p>
            <ng-container *ngTemplateOutlet="values; context: { $implicit: home.latest.values }" />
          }
        } @else {
          <ng-container *ngTemplateOutlet="values; context: { $implicit: home.latest.values, rowMarks: homeMarks }" />
          @if (home.canAccept) {
            <button type="button" [disabled]="householdSaving()" (click)="updateHousehold(home, 'accept')">Use in both homes</button>
          }
        }
        @if (home.shared) {
          <button type="button" [disabled]="householdSaving()" (click)="updateHousehold(home, 'stop')">Stop sharing</button>
        }
      } @else {
        @for (home of households(); track home.ownerId) {
          @if (home.shared; as agreed) {
            <h4>{{ home.isMine ? 'My shared routine' : home.ownerName + '’s shared routine' }}</h4>
            <ng-container *ngTemplateOutlet="values; context: { $implicit: agreed.values }" />
            <button type="button" [disabled]="householdSaving()" (click)="updateHousehold(home, 'stop')">Stop sharing</button>
          }
        }
      <p>Shared routines for both homes.</p>
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
              <legend>Shared bedtime and naps</legend>
              <label>Bedtime <textarea formControlName="bedtime" maxlength="1000"></textarea></label>
              <label>Naps (optional) <textarea formControlName="naps" maxlength="1000"></textarea></label>
              <div class="actions">
                <button type="submit" [disabled]="form.invalid">
                  {{ saving() ? 'Saving…' : conflict() ? 'Save my draft' : 'Save' }}
                </button>
                <button type="button" (click)="cancel()">Cancel</button>
              </div>
            </fieldset>
          </form>
        } @else {
          <ng-container *ngTemplateOutlet="values; context: { $implicit: saved.values, rowMarks: marks }" />
          <div class="actions">
            <button type="button" (click)="edit(saved)">Edit Routines</button>
            <button type="button" [attr.aria-expanded]="historyOpen()" aria-controls="routines-history"
              (click)="toggleHistory()">History</button>
          </div>
          <p role="status">{{ notice() }}</p>
        }
        <div id="routines-history" [hidden]="!historyOpen() || editing()">
          <h4>Routines history</h4>
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
        <p role="status">Loading Routines…</p>
      }
      }
    </section>
    <ng-template #values let-entry let-rowMarks="rowMarks">
      <dl>
        <div class="row" [class.row--updated]="rowMarks?.updated('bedtime')" (appOnScreen)="rowMarks?.rowOnScreen('bedtime')">
          <dt>Bedtime@if (rowMarks?.updated('bedtime')) { <span class="updated-pill">Updated</span> }</dt><dd>{{ entry.bedtime ?? 'Not set' }}</dd>
        </div>
        <div class="row" [class.row--updated]="rowMarks?.updated('naps')" (appOnScreen)="rowMarks?.rowOnScreen('naps')">
          <dt>Naps@if (rowMarks?.updated('naps')) { <span class="updated-pill">Updated</span> }</dt><dd>{{ entry.naps ?? 'Not set' }}</dd>
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
export class RoutinesSection {
  readonly familyId = input.required<string>();
  readonly childId = input.required<string>();
  protected readonly updates = inject(EssentialsUpdatesStore);
  /** The shared routine's changes, and the co-parent's own routine's changes shown in their tab (#128). */
  protected readonly marks = sectionUpdates('routines', this.childId);
  protected readonly homeMarks = sectionUpdates('householdRoutines', this.childId);
  private readonly api = inject(Api);
  private readonly destroyRef = inject(DestroyRef);
  protected readonly current = signal<RoutinesView | null>(null);
  protected readonly conflict = signal<RoutinesView | null>(null);
  protected readonly editing = signal(false);
  protected readonly saving = signal(false);
  protected readonly error = signal('');
  protected readonly notice = signal('');
  protected readonly historyOpen = signal(false);
  protected readonly historyLoading = signal(false);
  protected readonly historyError = signal(false);
  protected readonly history = signal<RoutinesHistoryPage['entries']>([]);
  protected readonly nextRevision = signal<number | null>(null);
  protected readonly form = new FormGroup({
    bedtime: new FormControl('', { nonNullable: true, validators: Validators.maxLength(1000) }),
    naps: new FormControl('', { nonNullable: true, validators: Validators.maxLength(1000) }),
  });

  protected readonly households = signal<readonly HouseholdRoutine[]>([]);
  protected readonly selectedOwner = signal<string | null>(null);
  protected readonly selectedHousehold = computed(() => this.households().find((home) => home.ownerId === this.selectedOwner()));
  protected readonly householdBedtime = signal('');
  protected readonly householdNaps = signal('');
  protected readonly householdSaving = signal(false);
  protected readonly householdError = signal('');
  protected readonly householdConflict = signal(false);

  protected openHousehold(home: HouseholdRoutine | null): void {
    if (this.householdSaving() || this.selectedOwner() === (home?.ownerId ?? null)) return;
    this.selectedOwner.set(home?.ownerId ?? null);
    // Opening the co-parent's tab clears its dot; its changed rows stay highlighted until on screen (#128).
    if (home && !home.isMine) this.updates.sectionOpened(this.childId(), 'householdRoutines');
    this.householdBedtime.set(home?.latest.values.bedtime ?? '');
    this.householdNaps.set(home?.latest.values.naps ?? '');
    this.householdConflict.set(false);
  }

  protected async loadHouseholds(): Promise<void> {
    try {
      this.households.set(await this.api.householdRoutines(this.familyId(), this.childId()));
      this.householdError.set('');
    } catch {
      this.householdError.set('Household routines couldn’t be loaded.');
    }
  }

  protected async updateHousehold(home: HouseholdRoutine, action: 'save' | 'accept' | 'stop'): Promise<void> {
    if (this.householdSaving()) return;
    this.householdSaving.set(true);
    this.householdError.set('');
    try {
      const saved = await this.api.updateHouseholdRoutine(this.familyId(), this.childId(), home.ownerId, {
        revision: home.latest.revision, action,
        ...(action === 'save' ? { values: { bedtime: this.householdBedtime(), naps: this.householdNaps() } } : {}),
      });
      if (action === 'save') {
        this.householdBedtime.set(saved.values.bedtime ?? '');
        this.householdNaps.set(saved.values.naps ?? '');
      }
      this.householdConflict.set(false);
      await this.loadHouseholds();
    } catch (error) {
      if (error instanceof HttpErrorResponse && error.status === 409) {
        await this.loadHouseholds();
        this.householdConflict.set(action === 'save');
        this.householdError.set('The routine was updated. Review the latest values before trying again.');
      } else {
        this.householdError.set('The routine couldn’t be updated. Try again.');
      }
    } finally {
      this.householdSaving.set(false);
    }
  }

  constructor() {
    effect(() => { void this.load(); void this.loadHouseholds(); });
  }

  protected async load(): Promise<void> {
    this.error.set('');
    try {
      this.current.set(await this.api.routines(this.familyId(), this.childId()));
    } catch {
      this.error.set('Routines couldn’t be loaded.');
    }
  }

  protected edit(saved: RoutinesView): void {
    const { bedtime, naps } = saved.values;
    this.form.reset({
      bedtime: bedtime ?? '', naps: naps ?? '',
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
    this.saving.set(true);
    this.error.set('');
    try {
      const saved = await this.api.saveRoutines(this.familyId(), this.childId(), {
        revision: base.revision, values: this.form.getRawValue(),
      });
      if (this.destroyRef.destroyed) return;
      this.current.set(saved);
      this.conflict.set(null);
      this.editing.set(false);
      this.notice.set('Routines saved.');
    } catch (error) {
      if (error instanceof HttpErrorResponse && error.status === 409) {
        this.conflict.set(error.error as RoutinesView);
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
      const page = await this.api.routinesHistory(this.familyId(), this.childId(), beforeRevision);
      this.history.update((entries) => [...entries, ...page.entries]);
      this.nextRevision.set(page.beforeRevision);
    } catch {
      this.historyError.set(true);
    } finally {
      this.historyLoading.set(false);
    }
  }
}
