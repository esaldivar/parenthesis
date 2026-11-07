import { DatePipe, NgTemplateOutlet } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, computed, effect, inject, signal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { EssentialsUpdatesStore } from '../../core/essentials/essentials-updates.store';
import { OnScreen, sectionUpdates } from './essentials-updates';
import { RevisionedSection } from './revisioned-section';
import { HouseholdRoutine, RoutinesHistoryPage, RoutinesView } from '../../core/api/api';

@Component({
  selector: 'app-routines-section',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DatePipe, NgTemplateOutlet, ReactiveFormsModule, OnScreen],
  template: `
    <section aria-labelledby="routines-heading">
      <h3 id="routines-heading">Routines
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
export class RoutinesSection extends RevisionedSection<RoutinesView, RoutinesView['values'], RoutinesHistoryPage['entries'][number]> {
  protected readonly updates = inject(EssentialsUpdatesStore);
  /** The shared routine's changes, and the co-parent's own routine's changes shown in their tab (#128). */
  protected readonly marks = sectionUpdates('routines', this.childId);
  protected readonly savedNotice = 'Routines saved.';
  protected readonly homeMarks = sectionUpdates('householdRoutines', this.childId);
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
    // Opening the co-parent's tab clears its dot; its changed rows stay highlighted until on screen (#128).
    if (home && !home.isMine) this.updates.sectionOpened(this.childId(), 'householdRoutines');
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
    super();
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

  protected store(revision: number, values: RoutinesView['values']): Promise<RoutinesView> {
    return this.api.saveRoutines(this.familyId(), this.childId(), { revision, values });
  }

  protected historyPage(beforeRevision: number | null) {
    return this.api.routinesHistory(this.familyId(), this.childId(), beforeRevision);
  }
}
