import { localizedMessage } from './localized-message';
import { AppDatePipe } from '../../core/i18n/locale-formatting';
import { TranslatePipe } from '../../core/i18n/translations';
import { NgTemplateOutlet } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import {
  ChangeDetectionStrategy, Component, ElementRef, Injector, afterNextRender, computed, effect, inject, input, signal, untracked,
} from '@angular/core';
import { AbstractControl, FormControl, FormGroup, ReactiveFormsModule, ValidationErrors, Validators } from '@angular/forms';
import { EssentialsUpdatesStore } from '../../core/essentials/essentials-updates.store';
import { Icon } from '../../shared/icon/icon';
import { OnScreen, sectionUpdates } from './essentials-updates';
import { RevisionedSection } from './revisioned-section';
import { Child, HouseholdRoutine, RoutineEntry, RoutinesHistoryPage, RoutinesValues, RoutinesView } from '../../core/api/api';

/** Which list a routine is added to or edited in: Shared, or the signed-in parent's own household list. */
type RoutineList = 'shared' | 'mine';

const TITLE_LIMIT = 100;
const DETAILS_LIMIT = 1000;

function notBlank(control: AbstractControl<string>): ValidationErrors | null {
  return control.value.trim() ? null : { required: true };
}

function routineForm() {
  return new FormGroup({
    title: new FormControl('', { nonNullable: true, validators: [notBlank, Validators.maxLength(TITLE_LIMIT)] }),
    details: new FormControl('', { nonNullable: true, validators: Validators.maxLength(DETAILS_LIMIT) }),
  });
}

/** A list with one routine changed: replaced where it is, or added at the end if it isn't there any more. */
function withEntry(values: RoutinesValues, entry: RoutineEntry): RoutinesValues {
  const found = values.entries.some((item) => item.id === entry.id);
  return { entries: found ? values.entries.map((item) => item.id === entry.id ? entry : item) : [...values.entries, entry] };
}

function entryFrom(id: string, title: string, details: string): RoutineEntry {
  return { id, title: title.trim(), details: details.trim() || null };
}

/** The base class saves {@link form}'s values: the Shared list with the routine being edited changed. */
class SharedEditForm {
  constructor(private readonly group: ReturnType<typeof routineForm>, private readonly values: () => RoutinesValues) {}
  get invalid(): boolean { return this.group.invalid; }
  getRawValue(): RoutinesValues { return this.values(); }
}

/**
 * Routines (#498): only the routines parents add, such as brushing teeth, in the Shared list both homes use or in each
 * parent's own list. A parent adds one routine to one or more children in one save, and edits a saved routine. Shared
 * keeps history and saves against the revision the parent saw; each parent's own list keeps the agreement rules
 * (use in both homes, stop sharing). Update notices name routines by id only.
 */
@Component({
  selector: 'app-routines-section',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [TranslatePipe, AppDatePipe, NgTemplateOutlet, ReactiveFormsModule, OnScreen, Icon],
  template: `
    <section aria-labelledby="routines-heading">
      <h3 id="routines-heading">{{ 'feature.routines' | tr }}
      </h3>
      <div class="actions" role="group" aria-label="{{ 'feature.routine.views' | tr }}">
        <button type="button" data-routine-view [attr.aria-pressed]="selectedOwner() === null" (click)="openHousehold(null)">{{ 'feature.shared' | tr }}</button>
        @for (home of households(); track home.ownerId) {
          <button type="button" data-routine-view [attr.aria-pressed]="selectedOwner() === home.ownerId"
            (click)="openHousehold(home)">{{ home.isMine ? ('feature.my.routines' | tr) : ('essentials.copy.ownerRoutines' | tr: { name: home.ownerName }) }}@if (
              !home.isMine && updates.unopened(childId(), 'householdRoutines')
            ) {<span class="visually-hidden">{{ 'feature.updated.8b35ce' | tr }}</span><span class="updated-dot tab-dot" aria-hidden="true"></span>}</button>
        }
      </div>
      <p role="status">{{ householdNotice() }}</p>
      @if (householdError()) {
        <p role="alert">{{ householdError() }}</p>
        <button type="button" (click)="loadHouseholds()">{{ 'feature.refresh.household.routines' | tr }}</button>
      }
      @if (selectedHousehold(); as home) {
        @if (home.isMine) {
          <p>{{ 'essentials.routines.mineIntro' | tr }}</p>
          @if (homeEditingId()) {
            <form (submit)="$event.preventDefault(); updateHousehold(home, 'save')">
              <fieldset [disabled]="householdSaving()">
                <legend>{{ 'essentials.routines.edit' | tr }}</legend>
                <label>{{ 'essentials.routines.name' | tr }}
                  <input name="title" data-routine-start required [maxLength]="titleLimit" [value]="homeTitle()" (input)="homeTitle.set($any($event.target).value)" />
                </label>
                <label>{{ 'essentials.routines.details' | tr }}
                  <textarea name="details" [maxLength]="detailsLimit" [value]="homeDetails()" (input)="homeDetails.set($any($event.target).value)"></textarea>
                </label>
                <div class="actions">
                  <button type="submit" [disabled]="!homeTitle().trim()">{{ householdSaving() ? ('feature.saving' | tr) : ('essentials.routines.save' | tr) }}</button>
                  <button type="button" (click)="cancelHomeEdit()">{{ 'feature.cancel' | tr }}</button>
                </div>
              </fieldset>
            </form>
            @if (householdConflict()) {
              <div class="latest">
                <h4>{{ 'feature.latest.saved.values' | tr }}</h4>
                <ng-container *ngTemplateOutlet="list; context: { $implicit: home.latest.values }" />
              </div>
            }
          } @else if (adding() === 'mine') {
            <ng-container *ngTemplateOutlet="addRoutine" />
          } @else {
            <ng-container *ngTemplateOutlet="list; context: { $implicit: home.latest.values, editable: 'mine' }" />
            <p role="status">{{ notice() }}</p>
            <button type="button" data-routine-add (click)="startAdd('mine')">{{ 'essentials.routines.add' | tr }}</button>
          }
        } @else {
          <ng-container *ngTemplateOutlet="list; context: { $implicit: home.latest.values, rowMarks: homeMarks }" />
          @if (home.canAccept) {
            <button type="button" data-routine-share [disabled]="householdSaving()" (click)="updateHousehold(home, 'accept')">{{ 'feature.use.in.both.homes' | tr }}<span class="visually-hidden">{{ home.isMine ? ('essentials.routines.ofMine' | tr) : ('essentials.routines.ofOwner' | tr: { name: home.ownerName }) }}</span></button>
          }
        }
        @if (home.shared) {
          <button type="button" data-routine-share [disabled]="householdSaving()" (click)="updateHousehold(home, 'stop')">{{ 'feature.stop.sharing' | tr }}<span class="visually-hidden">{{ home.isMine ? ('essentials.routines.ofMine' | tr) : ('essentials.routines.ofOwner' | tr: { name: home.ownerName }) }}</span></button>
        }
      } @else {
        @for (home of households(); track home.ownerId) {
          @if (home.shared; as agreed) {
            <h4>{{ home.isMine ? ('feature.my.shared.routine' | tr) : ('essentials.copy.ownerSharedRoutine' | tr: { name: home.ownerName }) }}</h4>
            <ng-container *ngTemplateOutlet="list; context: { $implicit: agreed.values }" />
            <button type="button" data-routine-share [disabled]="householdSaving()" (click)="updateHousehold(home, 'stop')">{{ 'feature.stop.sharing' | tr }}<span class="visually-hidden">{{ home.isMine ? ('essentials.routines.ofMine' | tr) : ('essentials.routines.ofOwner' | tr: { name: home.ownerName }) }}</span></button>
          }
        }
      <p>{{ 'feature.shared.routines.for.both.homes' | tr }}</p>
      @if (error()) {
        <p role="alert">{{ error() }}</p>
      }
      @if (current(); as saved) {
        @if (editing()) {
          <form [formGroup]="entryForm" (ngSubmit)="save()">
            @if (conflict(); as latest) {
              <div class="latest">
                <p role="alert">{{ 'feature.your.co.parent.saved.changes.first.review' | tr }}</p>
                <h4>{{ 'feature.latest.saved.values' | tr }}</h4>
                <ng-container *ngTemplateOutlet="list; context: { $implicit: latest.values }" />
              </div>
            }
            <fieldset [disabled]="saving()">
              <legend>{{ 'essentials.routines.edit' | tr }}</legend>
              <label>{{ 'essentials.routines.name' | tr }} <input formControlName="title" data-routine-start required [maxLength]="titleLimit" /></label>
              <label>{{ 'essentials.routines.details' | tr }} <textarea formControlName="details" [maxLength]="detailsLimit"></textarea></label>
              <div class="actions">
                <button type="submit" [disabled]="entryForm.invalid">
                  {{ saving() ? ('feature.saving' | tr) : conflict() ? ('feature.save.my.draft' | tr) : ('essentials.routines.save' | tr) }}
                </button>
                <button type="button" (click)="cancel()">{{ 'feature.cancel' | tr }}</button>
              </div>
            </fieldset>
          </form>
        } @else if (adding() === 'shared') {
          <ng-container *ngTemplateOutlet="addRoutine" />
        } @else {
          <ng-container *ngTemplateOutlet="list; context: { $implicit: saved.values, rowMarks: marks, editable: 'shared' }" />
          <div class="actions">
            <button type="button" class="pill" [attr.aria-expanded]="historyOpen()" aria-controls="routines-history"
              (click)="toggleHistory()"><app-icon name="history" [size]="18" />{{ 'feature.history' | tr }}</button>
          </div>
          <p role="status">{{ notice() }}</p>
          <button type="button" data-routine-add (click)="startAdd('shared')">{{ 'essentials.routines.add' | tr }}</button>
        }
        <div id="routines-history" [hidden]="!historyOpen() || editing() || adding() !== null">
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
                  <ng-container *ngTemplateOutlet="list; context: { $implicit: entry.previous }" />
                </div>
                <div><strong>{{ 'feature.saved.values' | tr }}</strong>
                  <ng-container *ngTemplateOutlet="list; context: { $implicit: entry.current }" />
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
    <ng-template #list let-values let-rowMarks="rowMarks" let-editable="editable">
      @if (values.entries.length) {
        <ul class="routines">
          @for (entry of values.entries; track entry.id) {
            <li class="row" [class.row--updated]="rowMarks?.updated(entry.id)" (appOnScreen)="rowMarks?.rowOnScreen(entry.id)">
              <div class="routine">
                <strong>{{ entry.title }}</strong>@if (rowMarks?.updated(entry.id)) { <span class="updated-pill">{{ 'feature.updated' | tr }}</span> }
                @if (entry.details) { <p>{{ entry.details }}</p> }
              </div>
              @if (editable) {
                <button type="button" class="edit" [attr.data-routine-edit]="entry.id" (click)="startEdit(editable, entry)"><app-icon name="pencil" [size]="18" />{{ 'feature.edit' | tr }}<span class="visually-hidden"> {{ entry.title }}</span></button>
              }
            </li>
          }
        </ul>
      } @else {
        <p class="empty">{{ 'essentials.routines.empty' | tr }}</p>
      }
    </ng-template>
    <ng-template #addRoutine>
      <form [formGroup]="addForm" (ngSubmit)="submitAdd()">
        <fieldset [disabled]="addSaving()">
          <legend>{{ 'essentials.routines.add' | tr }}</legend>
          <p>{{ (adding() === 'mine' ? 'essentials.routines.addMine' : 'essentials.routines.addShared') | tr }}</p>
          <label>{{ 'essentials.routines.name' | tr }} <input formControlName="title" data-routine-start required [maxLength]="titleLimit" /></label>
          <label>{{ 'essentials.routines.details' | tr }} <textarea formControlName="details" [maxLength]="detailsLimit"></textarea></label>
          <fieldset class="child-picker">
            <legend>{{ 'feature.add.to.children' | tr }}</legend>
            <p>{{ 'feature.choose.one.or.more.children' | tr }}</p>
            <div>
              @for (child of pickable(); track child.id) {
                <label>
                  <input type="checkbox" [checked]="addTargets().includes(child.id)" (change)="toggleAddTarget(child.id)" />
                  {{ child.firstName ?? ('essentials.copy.thisChild' | tr) }}
                </label>
              }
            </div>
          </fieldset>
          @if (addError()) {
            <p role="alert">{{ addError() }}</p>
          }
          <div class="actions">
            <button type="submit" [disabled]="addForm.invalid || !addTargets().length">
              {{ addSaving() ? ('feature.saving' | tr) : ('essentials.routines.save' | tr) }}
            </button>
            <button type="button" (click)="cancelAdd()">{{ 'feature.cancel' | tr }}</button>
          </div>
        </fieldset>
      </form>
    </ng-template>
  `,
  styleUrl: './essentials-section.css',
  styles: `
    :host {
      display: block;
      --essentials-section-bg: var(--color-calendar-family-bg);
      --essentials-section-fg: var(--color-calendar-family-fg);
    }
    /* The routines as a card of rows, like the other sections' saved values. */
    .routines {
      display: grid;
      margin: 0;
      padding: 0;
      list-style: none;
      border-radius: 0.875rem;
      background: var(--color-surface);
      color: var(--color-text);
      box-shadow: inset 0 0 0 1px var(--color-outline);
      overflow: hidden;
    }
    .routine { display: grid; gap: 0.25rem; flex: 1 1 12rem; min-inline-size: 0; }
    .routine p { margin: 0; white-space: pre-wrap; overflow-wrap: anywhere; }
    .edit { display: inline-flex; align-items: center; gap: 0.375rem; min-height: 44px; border-radius: 999px; }
    .empty { margin: 0; }
    .child-picker { margin: 0.75rem 0; }
    .child-picker legend { font-weight: 600; }
    .child-picker p { margin: 0; }
    .child-picker > div { display: flex; flex-wrap: wrap; gap: 0.75rem; }
    .child-picker label {
      flex: 1 1 8rem;
      padding: 0 0.75rem;
      border: 1px solid var(--color-outline);
      border-radius: 0.75rem;
    }
    .child-picker label:has(:checked) { background: var(--color-selected); }
  `,
})
export class RoutinesSection extends RevisionedSection<RoutinesView, RoutinesValues, RoutinesHistoryPage['entries'][number]> {
  /** The family's children, to add a routine to several at once; this child alone when not given. */
  readonly children = input<readonly Child[]>([]);
  protected readonly updates = inject(EssentialsUpdatesStore);
  /** The shared routines' changes, and the co-parent's own routines' changes shown in their tab (#128). */
  protected readonly marks = sectionUpdates('routines', this.childId);
  protected readonly homeMarks = sectionUpdates('householdRoutines', this.childId);
  protected readonly savedNoticeKey = 'essentials.routines.saved';
  protected readonly titleLimit = TITLE_LIMIT;
  protected readonly detailsLimit = DETAILS_LIMIT;

  /** Editing one Shared routine: the base class saves the whole list against the revision the parent saw. */
  protected readonly entryForm = routineForm();
  private readonly editingId = signal<string | null>(null);
  protected readonly form = new SharedEditForm(this.entryForm, () => this.editedSharedValues());

  protected readonly adding = signal<RoutineList | null>(null);
  protected readonly addForm = routineForm();
  protected readonly addTargets = signal<readonly string[]>([]);
  protected readonly addSaving = signal(false);
  protected readonly addError = localizedMessage();
  protected readonly pickable = computed<readonly { id: string; firstName: string | null }[]>(() =>
    this.children().length ? this.children() : [{ id: this.childId(), firstName: null }]);

  protected readonly households = signal<readonly HouseholdRoutine[]>([]);
  protected readonly selectedOwner = signal<string | null>(null);
  protected readonly selectedHousehold = computed(() => this.households().find((home) => home.ownerId === this.selectedOwner()));
  /** Editing one of my own routines. The draft stays while the parent looks at another tab. */
  protected readonly homeEditingId = signal<string | null>(null);
  protected readonly homeTitle = signal('');
  protected readonly homeDetails = signal('');
  protected readonly householdSaving = signal(false);
  protected readonly householdError = localizedMessage();
  protected readonly householdConflict = signal(false);
  /** Announces "use in both homes" and "stop sharing", whose buttons are replaced when they're used. */
  protected readonly householdNotice = localizedMessage();
  private homeDraftRevision = 0;
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly injector = inject(Injector);
  /** The family and child whose lists are on screen. */
  private shownFor = '';

  constructor() {
    super();
    effect(() => {
      const family = this.familyId();
      const child = this.childId();
      untracked(() => {
        // Another child: drop the last one's lists so nothing of theirs shows or saves while this one loads.
        if (`${family}/${child}` !== this.shownFor) {
          this.shownFor = `${family}/${child}`;
          this.current.set(null);
          this.conflict.set(null);
          this.households.set([]);
        }
        void this.load();
        void this.loadHouseholds();
      });
    });
  }

  protected openHousehold(home: HouseholdRoutine | null): void {
    if (this.householdSaving() || this.selectedOwner() === (home?.ownerId ?? null)) return;
    this.selectedOwner.set(home?.ownerId ?? null);
    this.adding.set(null);
    this.notice.set('');
    this.householdNotice.set('');
    // Opening the co-parent's tab clears its dot; its changed rows stay highlighted until on screen (#128).
    if (home && !home.isMine) this.updates.sectionOpened(this.childId(), 'householdRoutines');
  }

  protected startEdit(list: RoutineList, entry: RoutineEntry): void {
    this.adding.set(null);
    this.notice.set('');
    if (list === 'mine') {
      const mine = this.households().find((home) => home.isMine);
      this.homeEditingId.set(entry.id);
      this.homeTitle.set(entry.title);
      this.homeDetails.set(entry.details ?? '');
      this.homeDraftRevision = mine?.latest.revision ?? 0;
      this.householdConflict.set(false);
      this.focusAfterRender('[data-routine-start]');
      return;
    }
    this.editingId.set(entry.id);
    this.entryForm.reset({ title: entry.title, details: entry.details ?? '' });
    this.historyOpen.set(false);
    this.editing.set(true);
    this.focusAfterRender('[data-routine-start]');
  }

  protected cancelHomeEdit(): void {
    const id = this.homeEditingId();
    this.homeEditingId.set(null);
    this.householdConflict.set(false);
    this.householdError.set('');
    this.focusEditButton(id);
  }

  /** Back to the list after a Shared edit: focus returns to that routine's Edit button. */
  protected override async save(): Promise<void> {
    const id = this.editingId();
    await super.save();
    if (!this.editing()) this.focusEditButton(id);
  }

  protected override cancel(): void {
    const id = this.editingId();
    super.cancel();
    this.focusEditButton(id);
  }

  protected startAdd(list: RoutineList): void {
    this.addForm.reset({ title: '', details: '' });
    this.addTargets.set([]);
    this.addError.set('');
    this.notice.set('');
    this.historyOpen.set(false);
    this.adding.set(list);
    this.focusAfterRender('[data-routine-start]');
  }

  protected cancelAdd(): void {
    this.adding.set(null);
    this.addError.set('');
    this.focusAfterRender('[data-routine-add]');
  }

  protected toggleAddTarget(id: string): void {
    this.addTargets.update((ids) => ids.includes(id) ? ids.filter((target) => target !== id) : [...ids, id]);
  }

  protected async submitAdd(): Promise<void> {
    const list = this.adding();
    if (!list || this.addSaving() || this.addForm.invalid || !this.addTargets().length) return;
    const { title, details } = this.addForm.getRawValue();
    this.addSaving.set(true);
    this.addError.set('');
    try {
      await this.api.addRoutine(this.familyId(), {
        routine: { title: title.trim(), details: details.trim() || null },
        childIds: this.addTargets(),
        visibility: list,
      });
      if (this.destroyRef.destroyed) return;
      this.adding.set(null);
      this.notice.set('essentials.routines.added');
      this.focusAfterRender('[data-routine-add]');
      await (list === 'shared' ? this.load() : this.loadHouseholds());
    } catch {
      this.addError.set('essentials.routines.addError');
    } finally {
      this.addSaving.set(false);
    }
  }

  protected async loadHouseholds(): Promise<void> {
    const family = this.familyId();
    const child = this.childId();
    try {
      const households = await this.api.householdRoutines(family, child);
      if (!this.stillShowing(family, child)) return;
      this.households.set(households);
      this.householdError.set('');
    } catch {
      if (this.stillShowing(family, child)) this.householdError.set('essentials.routines.loadError');
    }
  }

  protected async updateHousehold(home: HouseholdRoutine, action: 'save' | 'accept' | 'stop'): Promise<void> {
    if (this.householdSaving()) return;
    const id = this.homeEditingId();
    if (action === 'save' && (!id || !this.homeTitle().trim())) return;
    this.householdSaving.set(true);
    this.householdError.set('');
    this.householdNotice.set('');
    try {
      await this.api.updateHouseholdRoutine(this.familyId(), this.childId(), home.ownerId, {
        revision: action === 'save' ? this.homeDraftRevision : home.latest.revision, action,
        ...(action === 'save' ? { values: withEntry(home.latest.values, entryFrom(id!, this.homeTitle(), this.homeDetails())) } : {}),
      });
      if (action === 'save') {
        this.homeEditingId.set(null);
        this.notice.set('essentials.routines.saved');
        this.focusEditButton(id);
      }
      this.householdConflict.set(false);
      await this.loadHouseholds();
      if (action !== 'save') {
        this.householdNotice.set(action === 'accept' ? 'essentials.routines.sharedNotice' : 'essentials.routines.stoppedNotice');
        this.focusShareButton();
      }
    } catch (error) {
      if (error instanceof HttpErrorResponse && error.status === 409) {
        await this.loadHouseholds();
        if (action === 'save') {
          const latest = this.households().find((household) => household.ownerId === home.ownerId);
          this.homeDraftRevision = latest?.latest.revision ?? this.homeDraftRevision;
        }
        this.householdConflict.set(action === 'save');
        this.householdError.set('essentials.routines.conflict');
      } else {
        this.householdError.set('essentials.routines.saveError');
      }
    } finally {
      this.householdSaving.set(false);
    }
  }

  protected async load(): Promise<void> {
    const family = this.familyId();
    const child = this.childId();
    this.error.set('');
    try {
      const saved = await this.api.routines(family, child);
      if (this.stillShowing(family, child)) this.current.set(saved);
    } catch {
      if (this.stillShowing(family, child)) this.error.set('feedback.routines.couldn.t.be.loaded');
    }
  }

  /**
   * Keeps keyboard and screen reader users in place when a form opens or closes: the element that had focus is removed,
   * so focus moves to the form's first field, or back to the button that opened it.
   */
  private focusAfterRender(selector: string): void {
    afterNextRender({ read: () => this.host.nativeElement.querySelector<HTMLElement>(selector)?.focus() }, { injector: this.injector });
  }

  /**
   * After "use in both homes" or "stop sharing" the button is replaced: focus moves to the one that replaced it on a
   * parent's tab, or back to the selected tab when nothing replaced it (the Shared tab, or my routines no longer shared).
   */
  private focusShareButton(): void {
    const tab = '[data-routine-view][aria-pressed="true"]';
    afterNextRender({
      read: () => {
        const host = this.host.nativeElement;
        const share = this.selectedOwner() === null ? null : host.querySelector<HTMLElement>('[data-routine-share]');
        (share ?? host.querySelector<HTMLElement>(tab))?.focus();
      },
    }, { injector: this.injector });
  }

  private focusEditButton(id: string | null): void {
    this.focusAfterRender(id ? `[data-routine-edit="${id}"]` : '[data-routine-add]');
  }

  /** Whether a response is for the child still on screen; a slow one for the previous child is dropped. */
  private stillShowing(family: string, child: string): boolean {
    return !this.destroyRef.destroyed && family === this.familyId() && child === this.childId();
  }

  /** The Shared list to save: the latest one the parent reviewed, with their edited routine in it. */
  private editedSharedValues(): RoutinesValues {
    const base = this.conflict() ?? this.current();
    const { title, details } = this.entryForm.getRawValue();
    return withEntry(base?.values ?? { entries: [] }, entryFrom(this.editingId() ?? '', title, details));
  }

  protected store(revision: number, values: RoutinesValues): Promise<RoutinesView> {
    return this.api.saveRoutines(this.familyId(), this.childId(), { revision, values });
  }

  protected historyPage(beforeRevision: number | null) {
    return this.api.routinesHistory(this.familyId(), this.childId(), beforeRevision);
  }
}
