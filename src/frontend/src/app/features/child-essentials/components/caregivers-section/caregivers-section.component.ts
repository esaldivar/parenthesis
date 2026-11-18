import { localizedMessage } from '../../localized-message';
import { LocaleService } from '../../../../core/i18n/locale.service';
import { AppCurrencyPipe } from '../../../../core/i18n/locale-formatting';
import { TranslatePipe, translate } from '../../../../core/i18n/translations';
import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, ElementRef, computed, effect, inject, input, signal, viewChild } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { OnScreen, sectionUpdates } from '../../essentials-updates';
import { Icon } from '../../../../shared/components/icon/icon';
import { dashedPhone } from '../../phone-display';
import { Api, Caregiver, CaregiverDetails, CaregiverList, Child } from '../../../../core/api/api';

@Component({
  selector: 'app-caregivers-section',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [TranslatePipe, AppCurrencyPipe, ReactiveFormsModule, OnScreen, Icon],
  styleUrl: './caregivers-section.component.css',
  template: `
    <!-- The approved artworks behind the content (#664): the full landscape on desktop, the mirrored portrait on phones. -->
    <img class="art art--wide" src="art/child-essentials/caregivers-landscape.webp" alt="" />
    <img class="art art--narrow" src="art/child-essentials/caregivers-portrait.webp" alt="" />
    <section aria-labelledby="caregivers-heading">
      <h3 id="caregivers-heading" class="visually-hidden">{{ 'feature.shared.caregivers' | tr }}</h3>
      @if (error() && !sheetOpen()) { <p role="alert" class="message">{{ error() }}</p> }
      <p role="status" class="message">{{ notice() }}</p>
      @if (list(); as current) {
        @if (!current.caregivers.length) { <p class="empty">{{ 'feature.no.shared.caregivers.yet' | tr }}</p> }
        @for (caregiver of current.caregivers; track caregiver.id) {
          <article class="card" [class.row--updated]="marks.updated(caregiver.id)" (appOnScreen)="marks.rowOnScreen(caregiver.id)">
            <h4 class="heading">
              <span class="caregiver-name">{{ caregiver.details.name }}</span>
              <span class="stars" role="img"
                    [attr.aria-label]="caregiver.averageRating === null ? ('feature.unrated' | tr) : ratingLabel(caregiver.averageRating)">
                @for (star of [0, 1, 2]; track star) {
                  <span class="star" aria-hidden="true">☆<span class="filled" [style.width.%]="fill(caregiver.averageRating, star)">★</span></span>
                }
              </span>
              @if (marks.updated(caregiver.id)) { <span class="updated">· {{ 'feature.updated' | tr }}</span> }
            </h4>
            @if (caregiver.details.role) { <p class="role">{{ caregiver.details.role }}</p> }
            <p>
              {{ 'feature.hourly.rate' | tr }}
              {{ caregiver.details.hourlyRate === null ? ('essentials.caregiver.notProvided' | tr)
                : ('essentials.caregiver.perHour' | tr: { amount: (caregiver.details.hourlyRate | appCurrency: 'USD') ?? '' }) }}
              <span aria-hidden="true">&nbsp;·&nbsp;</span>
              {{ 'feature.city' | tr }} {{ caregiver.details.city ?? ('essentials.caregiver.notProvided' | tr) }}
            </p>
            @if (caregiver.details.schoolPickup) { <p class="tag">{{ 'feature.school.pickup' | tr }}</p> }
            <div class="contact-line">
              <span class="phone">{{ displayPhone(caregiver.details.phone) }}</span>
              <a class="action primary call" [href]="phoneLink(caregiver.details.phone)"
                [attr.aria-label]="('feature.call.14e218' | tr) + caregiver.details.name"><app-icon name="phone" [size]="18" />{{ 'feature.call' | tr }}</a>
            </div>
            @if (caregiver.details.notes) { <p class="notes">{{ caregiver.details.notes }}</p> }
            <p>{{ 'feature.added.by' | tr }} {{ caregiver.addedBy }}</p>
            <div class="manage">
              <button type="button" [disabled]="busy()" (click)="edit(caregiver)">{{ 'feature.edit' | tr }}</button>
              <button type="button" [disabled]="busy()" (click)="startRemove(caregiver)">{{ 'feature.remove' | tr }}</button>
              <button type="button" [disabled]="busy()" (click)="ratingId.set(caregiver.id)" aria-label="{{ 'feature.rate.caregiver' | tr }}">{{ 'feature.rate' | tr }}</button>
            </div>
            @if (ratingId() === caregiver.id) {
              <div class="rating">
                <label class="field"><span class="field-label">{{ 'feature.your.rating.for' | tr }} {{ caregiver.details.name }}</span>
                  <select #rating [value]="caregiver.myRating?.toString() ?? ''" [disabled]="busy()">
                    <option value="">{{ 'feature.unrated' | tr }}</option>
                    <option value="1">{{ 'feature.1.star' | tr }}</option>
                    <option value="2">{{ 'feature.2.stars' | tr }}</option>
                    <option value="3">{{ 'feature.3.stars' | tr }}</option>
                  </select>
                </label>
                <div class="actions">
                  <button type="button" class="action primary" [disabled]="busy()" (click)="rate(caregiver.id, rating.value)">{{ 'feature.save.rating' | tr }}</button>
                  <button type="button" class="action secondary" [disabled]="busy()" (click)="ratingId.set(null)">{{ 'feature.cancel.rating' | tr }}</button>
                </div>
              </div>
            }
          </article>
        }
        <button #addButton type="button" class="action primary add" [disabled]="busy() || current.caregivers.length >= 30" (click)="edit(null)">{{ 'feature.add.caregiver' | tr }}</button>
      } @else if (error()) {
        <button type="button" class="action primary add" (click)="load()">{{ 'feature.retry' | tr }}</button>
      } @else {
        <p role="status" class="empty">{{ 'feature.loading.caregivers' | tr }}</p>
      }
    </section>

    <!-- The side sheet (desktop) / full-screen sheet (phones) for adding, editing and removing (frames 635:1060-1763). -->
    <dialog #sheet class="sheet" aria-labelledby="caregiver-sheet-title" (cancel)="$event.preventDefault(); closeSheet()">
      @if (removingCaregiver(); as caregiver) {
        <div class="sheet-body">
          <h4 id="caregiver-sheet-title" class="sheet-title">{{ 'essentials.caregiver.removeTitle' | tr }}</h4>
          <p class="sheet-text">{{ 'feature.remove' | tr }} {{ caregiver.details.name }} {{ 'feature.from.this.child.s.caregiver.list' | tr }}</p>
          @if (error()) { <p role="alert" class="sheet-text">{{ error() }}</p> }
          <button type="button" class="action primary block" [disabled]="busy()" (click)="remove(caregiver.id)">{{ 'feature.confirm.removal' | tr }}</button>
          <button type="button" class="text-button" [disabled]="busy()" (click)="closeSheet()">{{ 'feature.cancel.removal' | tr }}</button>
        </div>
      } @else if (editing()) {
        <form class="sheet-form" [formGroup]="form" (ngSubmit)="save()" novalidate>
          <div class="sheet-body">
            <h4 id="caregiver-sheet-title" class="sheet-title">{{ editId() ? ('feature.edit.caregiver' | tr) : ('feature.add.caregiver' | tr) }}</h4>
            <fieldset [disabled]="busy()">
              <legend class="visually-hidden">{{ editId() ? ('feature.edit.caregiver' | tr) : ('feature.add.caregiver' | tr) }}</legend>
              <label class="field"><span class="field-label">{{ 'feature.name' | tr }}</span>
                <input formControlName="name" maxlength="100" required autocomplete="off" [placeholder]="'essentials.caregiver.namePlaceholder' | tr"
                  [attr.aria-invalid]="showInvalid() && form.controls.name.invalid" /></label>
              <label class="field"><span class="field-label">{{ 'essentials.caregiver.role' | tr }}</span>
                <input formControlName="role" maxlength="60" autocomplete="off" [placeholder]="'essentials.caregiver.rolePlaceholder' | tr" /></label>
              <label class="field"><span class="field-label">{{ 'feature.phone' | tr }}</span>
                <input type="tel" formControlName="phone" maxlength="32" required autocomplete="off" [placeholder]="'essentials.caregiver.phonePlaceholder' | tr"
                  [attr.aria-invalid]="showInvalid() && form.controls.phone.invalid" /></label>
              <label class="field"><span class="field-label">{{ 'essentials.caregiver.city' | tr }}</span>
                <input formControlName="city" maxlength="100" autocomplete="off" [placeholder]="'essentials.caregiver.city' | tr" /></label>
              <label class="field"><span class="field-label">{{ 'essentials.caregiver.rate' | tr }}</span>
                <input type="number" min="0" max="10000" step="0.01" formControlName="hourlyRate" [placeholder]="'essentials.caregiver.ratePlaceholder' | tr" /></label>
              @if (!editId() && children().length > 1) {
                <fieldset class="field children">
                  <legend class="field-label">{{ 'essentials.caregiver.children' | tr }}</legend>
                  @for (child of children(); track child.id) {
                    <label class="check"><input type="checkbox" [checked]="chosen().includes(child.id)" (change)="toggleChild(child.id)" />
                      <span>{{ child.firstName }}</span></label>
                  }
                </fieldset>
              }
              <label class="field"><span class="field-label">{{ 'essentials.caregiver.notes' | tr }}</span>
                <textarea formControlName="notes" maxlength="1000" [placeholder]="'essentials.caregiver.notesPlaceholder' | tr"></textarea></label>
              <label class="check"><input type="checkbox" formControlName="schoolPickup" /><span>{{ 'feature.school.pickup' | tr }}</span></label>
              @if (showInvalid() && form.invalid) { <p role="alert" class="sheet-text">{{ 'essentials.caregiver.invalid' | tr }}</p> }
              @if (error()) { <p role="alert" class="sheet-text">{{ error() }}</p> }
              @if (duplicate()) {
                <p role="alert" class="sheet-text">{{ duplicate() }} {{ 'feature.already.uses.that.number' | tr }}</p>
                <button type="button" class="text-button" [disabled]="form.invalid" (click)="save(true)">{{ 'feature.continue.for.a.different.person' | tr }}</button>
              }
              @if (discarding()) { <p role="alert" class="discard">{{ 'essentials.caregiver.discard' | tr }}</p> }
            </fieldset>
          </div>
          <div class="sheet-actions">
            <button type="submit" class="action primary" [disabled]="busy()">{{ failed() ? ('feature.retry' | tr) : ('feature.save' | tr) }}</button>
            <button type="button" class="action secondary" [disabled]="busy()" (click)="cancelEdit()">{{ 'feature.cancel' | tr }}</button>
          </div>
        </form>
      }
    </dialog>
  `,
})
export class CaregiversSection {
  private readonly locale = inject(LocaleService);
  readonly familyId = input.required<string>();
  readonly childId = input.required<string>();
  readonly children = input<readonly Child[]>([]);
  protected readonly otherChildren = computed(() => this.children().filter(child => child.id !== this.childId()));
  protected readonly marks = sectionUpdates('caregivers', this.childId);
  private readonly api = inject(Api);
  protected readonly list = signal<CaregiverList | null>(null);
  protected readonly error = localizedMessage();
  protected readonly notice = localizedMessage();
  protected readonly busy = signal(false);
  protected readonly editing = signal(false);
  protected readonly editId = signal<string | null>(null);
  protected readonly duplicate = signal('');
  protected readonly removing = signal<string | null>(null);
  protected readonly removingCaregiver = computed(() =>
    this.list()?.caregivers.find(caregiver => caregiver.id === this.removing()) ?? null);
  /** The children a new caregiver is added for (#664): this child to start with, then any the parent ticks. */
  protected readonly chosen = signal<readonly string[]>([]);
  /** Save was pressed with a missing name or phone: say so in the sheet (frame 635:1340). */
  protected readonly showInvalid = signal(false);
  /** The last save failed: Save becomes Retry, with the draft kept (frame 635:1622). */
  protected readonly failed = signal(false);
  /** Cancel was pressed with changes: ask before discarding them (frame 635:1481). */
  protected readonly discarding = signal(false);
  protected readonly sheetOpen = computed(() => this.editing() || this.removing() !== null);
  private readonly sheet = viewChild.required<ElementRef<HTMLDialogElement>>('sheet');
  private readonly addButton = viewChild<ElementRef<HTMLButtonElement>>('addButton');
  private opener: HTMLElement | null = null;
  protected readonly ratingId = signal<string | null>(null);
  protected readonly form = new FormGroup({
    name: new FormControl('', { nonNullable: true, validators: Validators.required }),
    phone: new FormControl('', { nonNullable: true, validators: Validators.required }),
    city: new FormControl('', { nonNullable: true }),
    hourlyRate: new FormControl<number | null>(null, [Validators.min(0), Validators.max(10000)]),
    schoolPickup: new FormControl(false, { nonNullable: true }),
    role: new FormControl('', { nonNullable: true }),
    notes: new FormControl('', { nonNullable: true }),
  });

  constructor() {
    effect(() => { void this.load(); });
    // The sheet is a modal dialog: it keeps focus inside, and closing it returns focus to what opened it.
    effect(() => {
      const dialog = this.sheet().nativeElement;
      if (this.sheetOpen() && !dialog.open) {
        this.opener = document.activeElement as HTMLElement | null;
        dialog.showModal?.();
      } else if (!this.sheetOpen() && dialog.open) {
        dialog.close();
        (this.opener?.isConnected ? this.opener : this.addButton()?.nativeElement)?.focus();
      }
    });
    this.form.valueChanges.subscribe(() => this.duplicate.set(''));
  }

  protected async load(): Promise<void> {
    try {
      this.list.set(await this.api.caregivers(this.familyId(), this.childId()));
      this.error.set('');
    } catch {
      this.error.set('feedback.shared.caregivers.couldn.t.be.loaded');
    }
  }

  protected edit(caregiver: Caregiver | null): void {
    const details = caregiver?.details;
    this.form.reset({
      name: details?.name ?? '', phone: details?.phone ?? '', city: details?.city ?? '',
      hourlyRate: details?.hourlyRate ?? null, schoolPickup: details?.schoolPickup ?? false,
      role: details?.role ?? '', notes: details?.notes ?? '',
    });
    this.error.set('');
    this.editId.set(caregiver?.id ?? null);
    this.chosen.set([this.childId()]);
    this.showInvalid.set(false);
    this.failed.set(false);
    this.discarding.set(false);
    this.duplicate.set('');
    this.editing.set(true);
  }

  protected async save(allowDuplicate = false): Promise<void> {
    const current = this.list();
    if (!current || this.busy()) return;
    if (this.form.invalid) {
      this.showInvalid.set(true);
      return;
    }
    const raw = this.form.getRawValue();
    const details: CaregiverDetails = { ...raw, role: raw.role.trim() || null, notes: raw.notes.trim() || null };
    this.discarding.set(false);
    if (!this.editId() && this.chosen().some(id => id !== this.childId())) {
      await this.addForAll(details, allowDuplicate);
      return;
    }
    if (await this.change(() => this.api.saveCaregiver(this.familyId(), this.childId(), this.editId(), {
      version: current.version, details, allowDuplicate,
    }))) this.editing.set(false);
  }

  private async addForAll(details: CaregiverDetails, allowDuplicate: boolean): Promise<void> {
    const familyId = this.familyId();
    const currentId = this.childId();
    const chosen = this.chosen();
    const targets = [
      ...(chosen.includes(currentId)
        ? [this.children().find(child => child.id === currentId) ?? { id: currentId, firstName: translate('essentials.copy.thisChild', this.locale.locale()) }]
        : []),
      ...this.otherChildren().filter(child => chosen.includes(child.id)),
    ];
    const name = details.name.trim().toLowerCase();
    const phone = details.phone.replace(/\D/g, '');
    this.busy.set(true);
    this.error.set('');
    this.notice.set('');
    this.duplicate.set('');
    try {
      const results = await Promise.allSettled(targets.map(async child => {
        const list = await this.api.caregivers(familyId, child.id);
        const exists = list.caregivers.some(item =>
          item.details.name.trim().toLowerCase() === name && item.details.phone.replace(/\D/g, '') === phone,
        );
        if (!exists) {
          await this.api.saveCaregiver(familyId, child.id, null, { version: list.version, details, allowDuplicate });
        }
      }));
      const failed = targets.filter((_, index) => results[index].status === 'rejected');
      await this.load();
      if (failed.length) {
        for (const result of results) {
          if (result.status === 'rejected' && result.reason instanceof HttpErrorResponse &&
              result.reason.status === 409 && typeof result.reason.error?.duplicateName === 'string') {
            this.duplicate.set(result.reason.error.duplicateName);
            break;
          }
        }
        this.error.set('essentials.copy.caregiverPartial', { names: failed.map(child => child.firstName).join(', ') });
        return;
      }
      this.notice.set('essentials.caregiver.savedAll');
      this.editing.set(false);
    } finally {
      this.busy.set(false);
    }
  }

  protected startRemove(caregiver: Caregiver): void {
    this.error.set('');
    this.removing.set(caregiver.id);
  }

  protected async remove(id: string): Promise<void> {
    const version = this.list()?.version ?? 0;
    if (await this.change(() => this.api.removeCaregiver(this.familyId(), this.childId(), id, version))) this.removing.set(null);
  }

  protected toggleChild(id: string): void {
    this.chosen.update(ids => ids.includes(id) ? ids.filter(item => item !== id) : [...ids, id]);
    this.form.markAsDirty();
  }

  /** Cancel closes at once when nothing changed; with changes it first asks, and a second Cancel discards them. */
  protected cancelEdit(): void {
    if (this.form.dirty && !this.discarding()) {
      this.discarding.set(true);
      return;
    }
    this.closeSheet();
  }

  protected closeSheet(): void {
    if (this.editing() && this.form.dirty && !this.discarding()) {
      this.discarding.set(true);
      return;
    }
    this.discarding.set(false);
    this.editing.set(false);
    this.removing.set(null);
    this.error.set('');
  }

  protected async rate(id: string, value: string): Promise<void> {
    if (await this.change(() => this.api.rateCaregiver(this.familyId(), this.childId(), id, value ? Number(value) : null))) {
      this.ratingId.set(null);
    }
  }

  private async change(update: () => Promise<void>): Promise<boolean> {
    if (this.busy()) return false;
    this.busy.set(true);
    this.error.set('');
    this.notice.set('');
    try {
      await update();
      this.failed.set(false);
      this.notice.set('essentials.caregiver.updated');
      await this.load();
      return true;
    } catch (error) {
      if (error instanceof HttpErrorResponse && error.status === 409) {
        if (typeof error.error?.duplicateName === 'string') {
          this.duplicate.set(error.error.duplicateName);
        } else {
          await this.load();
          this.editing.set(false);
          this.removing.set(null);
          this.error.set('essentials.caregiver.conflict');
        }
      } else {
        const errors = error instanceof HttpErrorResponse && error.status === 400
          ? error.error?.errors as Record<string, string[]> | undefined : undefined;
        this.error.set(errors ? 'essentials.copy.validation' : 'essentials.caregiver.error');
        this.failed.set(!errors);
      }
      return false;
    } finally {
      this.busy.set(false);
    }
  }

  protected ratingLabel(rating: number): string {
    return translate('essentials.copy.rating', this.locale.locale(), { rating: new Intl.NumberFormat(this.locale.locale()).format(rating) });
  }

  protected fill(average: number | null, star: number): number {
    return Math.min(1, Math.max(0, (average ?? 0) - star)) * 100;
  }

  protected displayPhone(phone: string): string {
    return dashedPhone(phone);
  }

  protected phoneLink(phone: string): string {
    return 'tel:' + (phone.startsWith('+') ? '+' : '') + phone.replace(/\D/g, '');
  }
}
