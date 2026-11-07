import { DatePipe, NgTemplateOutlet } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import {
  ChangeDetectionStrategy, Component, computed, DestroyRef, effect, inject, input, signal,
} from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { Api, HouseholdRoutine, RoutinesHistoryPage, RoutinesView } from '../../core/api/api';

@Component({
  selector: 'app-routines-section',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DatePipe, NgTemplateOutlet, ReactiveFormsModule],
  template: `
    <section aria-labelledby="routines-heading">
      <h3 id="routines-heading">Routines</h3>
      <div class="actions" role="group" aria-label="Routine views">
        <button type="button" [attr.aria-pressed]="selectedOwner() === null" (click)="openHousehold(null)">Shared</button>
        @for (home of households(); track home.ownerId) {
          <button type="button" [attr.aria-pressed]="selectedOwner() === home.ownerId"
            (click)="openHousehold(home)">{{ home.isMine ? 'My routines' : home.ownerName + '’s routines' }}</button>
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
          <ng-container *ngTemplateOutlet="values; context: { $implicit: home.latest.values }" />
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
          <ng-container *ngTemplateOutlet="values; context: { $implicit: saved.values }" />
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
    <ng-template #values let-entry>
      <dl>
        <dt>Bedtime</dt><dd>{{ entry.bedtime ?? 'Not set' }}</dd>
        <dt>Naps</dt><dd>{{ entry.naps ?? 'Not set' }}</dd>
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
  private readonly householdDrafts = new Map<string, {
    bedtime: string; naps: string; revision: number; conflict: boolean;
  }>();
  private householdDraftRevision = 0;

  protected openHousehold(home: HouseholdRoutine | null): void {
    if (this.householdSaving() || this.selectedOwner() === (home?.ownerId ?? null)) return;
    const previous = this.selectedHousehold();
    if (previous?.isMine) {
      this.householdDrafts.set(previous.ownerId, {
        bedtime: this.householdBedtime(), naps: this.householdNaps(),
        revision: this.householdDraftRevision, conflict: this.householdConflict(),
      });
    }
    const draft = home ? this.householdDrafts.get(home.ownerId) : undefined;
    this.selectedOwner.set(home?.ownerId ?? null);
    this.householdDraftRevision = draft?.revision ?? home?.latest.revision ?? 0;
    this.householdBedtime.set(draft?.bedtime ?? home?.latest.values.bedtime ?? '');
    this.householdNaps.set(draft?.naps ?? home?.latest.values.naps ?? '');
    this.householdConflict.set(draft?.conflict ?? false);
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
        revision: action === 'save' ? this.householdDraftRevision : home.latest.revision, action,
        ...(action === 'save' ? { values: { bedtime: this.householdBedtime(), naps: this.householdNaps() } } : {}),
      });
      if (action === 'save') {
        this.householdBedtime.set(saved.values.bedtime ?? '');
        this.householdNaps.set(saved.values.naps ?? '');
        this.householdDraftRevision = saved.revision;
        this.householdDrafts.delete(home.ownerId);
      }
      this.householdConflict.set(false);
      await this.loadHouseholds();
    } catch (error) {
      if (error instanceof HttpErrorResponse && error.status === 409) {
        await this.loadHouseholds();
        if (action === 'save') {
          const latest = this.households().find((household) => household.ownerId === home.ownerId);
          this.householdDraftRevision = latest?.latest.revision ?? this.householdDraftRevision;
        }
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
