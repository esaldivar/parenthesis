import { LocaleService } from '../../core/i18n/locale.service';
import { AppDatePipe } from '../../core/i18n/locale-formatting';
import { TranslatePipe, translate } from '../../core/i18n/translations';
import { NgTemplateOutlet } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, computed, effect, inject, signal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { EssentialsUpdatesStore } from '../../core/essentials/essentials-updates.store';
import { Icon } from '../../shared/icon/icon';
import { OnScreen, sectionUpdates } from './essentials-updates';
import { RevisionedSection } from './revisioned-section';
import { HouseholdRoutine, RoutinesHistoryPage, RoutinesView } from '../../core/api/api';

@Component({
  selector: 'app-routines-section',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [TranslatePipe, AppDatePipe, NgTemplateOutlet, ReactiveFormsModule, OnScreen, Icon],
  template: `
    <section aria-labelledby="routines-heading">
      <h3 id="routines-heading">{{ 'feature.routines' | tr }}
      </h3>
      <div class="actions" role="group" aria-label="{{ 'feature.routine.views' | tr }}">
        <button type="button" [attr.aria-pressed]="selectedOwner() === null" (click)="openHousehold(null)">{{ 'feature.shared' | tr }}</button>
        @for (home of households(); track home.ownerId) {
          <button type="button" [attr.aria-pressed]="selectedOwner() === home.ownerId"
            (click)="openHousehold(home)">{{ home.isMine ? ('feature.my.routines' | tr) : home.ownerName + ('feature.s.routines' | tr) }}@if (
              !home.isMine && updates.unopened(childId(), 'householdRoutines')
            ) {<span class="visually-hidden">{{ 'feature.updated.8b35ce' | tr }}</span><span class="updated-dot tab-dot" aria-hidden="true"></span>}</button>
        }
      </div>
      @if (householdError()) {
        <p role="alert">{{ householdError() }}</p>
        <button type="button" (click)="loadHouseholds()">{{ 'feature.refresh.household.routines' | tr }}</button>
      }
      @if (selectedHousehold(); as home) {
        @if (home.isMine) {
          <fieldset [disabled]="householdSaving()">
            <legend>{{ 'feature.my.household.routine' | tr }}</legend>
            <label>{{ 'feature.bedtime' | tr }}
              <textarea maxlength="1000" [value]="householdBedtime()" (input)="householdBedtime.set($any($event.target).value)"></textarea>
            </label>
            <label>{{ 'feature.naps' | tr }}
              <textarea maxlength="1000" [value]="householdNaps()" (input)="householdNaps.set($any($event.target).value)"></textarea>
            </label>
            <button type="button" (click)="updateHousehold(home, 'save')">{{ 'feature.save.my.routines' | tr }}</button>
          </fieldset>
          @if (householdConflict()) {
            <p>{{ 'feature.latest.saved.values' | tr }}</p>
            <ng-container *ngTemplateOutlet="values; context: { $implicit: home.latest.values }" />
          }
        } @else {
          <ng-container *ngTemplateOutlet="values; context: { $implicit: home.latest.values, rowMarks: homeMarks }" />
          @if (home.canAccept) {
            <button type="button" [disabled]="householdSaving()" (click)="updateHousehold(home, 'accept')">{{ 'feature.use.in.both.homes' | tr }}</button>
          }
        }
        @if (home.shared) {
          <button type="button" [disabled]="householdSaving()" (click)="updateHousehold(home, 'stop')">{{ 'feature.stop.sharing' | tr }}</button>
        }
      } @else {
        @for (home of households(); track home.ownerId) {
          @if (home.shared; as agreed) {
            <h4>{{ home.isMine ? ('feature.my.shared.routine' | tr) : home.ownerName + ('feature.s.shared.routine' | tr) }}</h4>
            <ng-container *ngTemplateOutlet="values; context: { $implicit: agreed.values }" />
            <button type="button" [disabled]="householdSaving()" (click)="updateHousehold(home, 'stop')">{{ 'feature.stop.sharing' | tr }}</button>
          }
        }
      <p>{{ 'feature.shared.routines.for.both.homes' | tr }}</p>
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
              <legend>{{ 'feature.shared.bedtime.and.naps' | tr }}</legend>
              <label>{{ 'feature.bedtime' | tr }} <textarea formControlName="bedtime" maxlength="1000"></textarea></label>
              <label>{{ 'feature.naps.optional' | tr }} <textarea formControlName="naps" maxlength="1000"></textarea></label>
              <div class="actions">
                <button type="submit" [disabled]="form.invalid">
                  {{ saving() ? ('feature.saving' | tr) : conflict() ? ('feature.save.my.draft' | tr) : ('feature.save' | tr) }}
                </button>
                <button type="button" (click)="cancel()">{{ 'feature.cancel' | tr }}</button>
              </div>
            </fieldset>
          </form>
        } @else {
          <ng-container *ngTemplateOutlet="values; context: { $implicit: saved.values, rowMarks: marks }" />
          <div class="actions">
            <button type="button" class="pill" (click)="edit(saved)"><app-icon name="pencil" [size]="18" />{{ 'feature.edit' | tr }}<span class="visually-hidden"> {{ 'feature.routines' | tr }}</span></button>
            <button type="button" class="pill" [attr.aria-expanded]="historyOpen()" aria-controls="routines-history"
              (click)="toggleHistory()"><app-icon name="history" [size]="18" />{{ 'feature.history' | tr }}</button>
          </div>
          <p role="status">{{ notice() }}</p>
        }
        <div id="routines-history" [hidden]="!historyOpen() || editing()">
          <h4>{{ 'feature.routines.history' | tr }}</h4>
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
        <p role="status">{{ 'feature.loading.routines' | tr }}</p>
      }
      }
    </section>
    <ng-template #values let-entry let-rowMarks="rowMarks">
      <dl>
        <div class="row" [class.row--updated]="rowMarks?.updated('bedtime')" (appOnScreen)="rowMarks?.rowOnScreen('bedtime')">
          <dt>{{ 'feature.bedtime' | tr }}@if (rowMarks?.updated('bedtime')) { <span class="updated-pill">{{ 'feature.updated' | tr }}</span> }</dt><dd>{{ entry.bedtime ?? 'Not set' }}</dd>
        </div>
        <div class="row" [class.row--updated]="rowMarks?.updated('naps')" (appOnScreen)="rowMarks?.rowOnScreen('naps')">
          <dt>{{ 'feature.naps' | tr }}@if (rowMarks?.updated('naps')) { <span class="updated-pill">{{ 'feature.updated' | tr }}</span> }</dt><dd>{{ entry.naps ?? 'Not set' }}</dd>
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
  private readonly locale = inject(LocaleService);
  protected readonly updates = inject(EssentialsUpdatesStore);
  /** The shared routine's changes, and the co-parent's own routine's changes shown in their tab (#128). */
  protected readonly marks = sectionUpdates('routines', this.childId);
  protected get savedNotice(): string {
    return translate('essentials.routines.saved', this.locale.locale());
  }
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
      this.householdError.set(translate('essentials.routines.loadError', this.locale.locale()));
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
        this.householdError.set(translate('essentials.routines.conflict', this.locale.locale()));
      } else {
        this.householdError.set(translate('essentials.routines.saveError', this.locale.locale()));
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
      this.error.set(translate('feedback.routines.couldn.t.be.loaded', this.locale.locale()));
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
