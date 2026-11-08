import { CurrencyPipe } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, computed, effect, inject, input, signal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { OnScreen, sectionUpdates } from './essentials-updates';
import { Api, Caregiver, CaregiverDetails, CaregiverList, Child } from '../../core/api/api';

@Component({
  selector: 'app-caregivers-section',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CurrencyPipe, ReactiveFormsModule, OnScreen],
  styleUrl: './essentials-section.css',
  styles: `
    :host { display: block; margin-block-start: 1rem; }
    h4 { display: flex; align-items: center; flex-wrap: wrap; gap: .375rem; }
    .caregiver-name { min-inline-size: 0; overflow-wrap: anywhere; }
    .stars { display: inline-flex; color: light-dark(#9a6b00, #f2c14e); font-size: 1.25rem; }
    .star { position: relative; }
    .filled { position: absolute; inset-inline-start: 0; overflow: hidden; }
  `,
  template: `
    <section aria-labelledby="caregivers-heading">
      <h3 id="caregivers-heading">Shared Caregivers
      </h3>
      @if (error()) { <p role="alert">{{ error() }}</p> }
      <p role="status">{{ notice() }}</p>
      @if (list(); as current) {
        @if (!current.caregivers.length) { <p>No shared caregivers yet.</p> }
        @for (caregiver of current.caregivers; track caregiver.id) {
          <article class="entry" [class.row--updated]="marks.updated(caregiver.id)" (appOnScreen)="marks.rowOnScreen(caregiver.id)">
            <h4>
              <span class="caregiver-name">{{ caregiver.details.name }}</span>
              <span class="stars" role="img"
                    [attr.aria-label]="caregiver.averageRating === null ? 'Unrated' : caregiver.averageRating + ' out of 3 stars'">
                @for (star of [0, 1, 2]; track star) {
                  <span class="star" aria-hidden="true">☆<span class="filled" [style.width.%]="fill(caregiver.averageRating, star)">★</span></span>
                }
              </span>
              @if (marks.updated(caregiver.id)) { <span class="updated-pill">Updated</span> }
            </h4>
            @if (caregiver.details.schoolPickup) { <p><span class="tag">School pickup</span></p> }
            <p>{{ displayPhone(caregiver.details.phone) }}
              <a class="call" [href]="phoneLink(caregiver.details.phone)" [attr.aria-label]="'Call ' + caregiver.details.name">Call</a>
            </p>
            <details>
              <summary>Details for {{ caregiver.details.name }}</summary>
              @if (caregiver.details.city) { <p>Town or city: {{ caregiver.details.city }}</p> }
              @if (caregiver.details.hourlyRate !== null) {
                <p>Hourly rate: {{ caregiver.details.hourlyRate | currency: 'USD' }}</p>
              }
              <p>Added by {{ caregiver.addedBy }}</p>
            </details>
            <div class="actions">
              <button type="button" [disabled]="busy()" (click)="edit(caregiver)">Edit</button>
              <button type="button" [disabled]="busy()" (click)="removing.set(caregiver.id)">Remove</button>
              <button type="button" [disabled]="busy()" (click)="ratingId.set(caregiver.id)">Rate caregiver</button>
            </div>
            @if (removing() === caregiver.id) {
              <p>Remove {{ caregiver.details.name }} from this child’s caregiver list?</p>
              <button type="button" [disabled]="busy()" (click)="remove(caregiver.id, current.version)">Confirm removal</button>
              <button type="button" [disabled]="busy()" (click)="removing.set(null)">Cancel removal</button>
            }
            @if (ratingId() === caregiver.id) {
              <label>Your rating for {{ caregiver.details.name }}
                <select #rating [value]="caregiver.myRating?.toString() ?? ''" [disabled]="busy()">
                  <option value="">Unrated</option>
                  <option value="1">1 star</option>
                  <option value="2">2 stars</option>
                  <option value="3">3 stars</option>
                </select>
              </label>
              <button type="button" [disabled]="busy()" (click)="rate(caregiver.id, rating.value)">Save rating</button>
              <button type="button" [disabled]="busy()" (click)="ratingId.set(null)">Cancel rating</button>
            }
          </article>
        }
        @if (!editing()) {
          <button type="button" [disabled]="busy() || current.caregivers.length >= 30" (click)="edit(null)">Add caregiver</button>
        } @else {
          <form [formGroup]="form" (ngSubmit)="save()">
            <fieldset [disabled]="busy()">
              <legend>{{ editId() ? 'Edit caregiver' : 'Add caregiver' }}</legend>
              <label>Name <input formControlName="name" maxlength="100" required /></label>
              <label>Phone <input type="tel" formControlName="phone" maxlength="32" required /></label>
              <label>Town or city (optional) <input formControlName="city" maxlength="100" /></label>
              <label>Hourly rate in USD (optional) <input type="number" min="0" max="10000" step="0.01" formControlName="hourlyRate" /></label>
              <label><input type="checkbox" formControlName="schoolPickup" /> School pickup</label>
              @if (!editId() && otherChildren().length) {
                <label><input type="checkbox" formControlName="addToAll" /> Add to all children</label>
              }
              @if (duplicate()) {
                <p role="alert">{{ duplicate() }} already uses that number.</p>
                <button type="button" [disabled]="form.invalid" (click)="save(true)">Continue for a different person</button>
              }
              <div class="actions">
                <button type="submit" [disabled]="form.invalid">Save caregiver</button>
                <button type="button" (click)="editing.set(false)">Cancel</button>
              </div>
            </fieldset>
          </form>
        }
      } @else if (error()) {
        <button type="button" (click)="load()">Try again</button>
      } @else {
        <p role="status">Loading caregivers…</p>
      }
    </section>
  `,
})
export class CaregiversSection {
  readonly familyId = input.required<string>();
  readonly childId = input.required<string>();
  readonly children = input<readonly Child[]>([]);
  protected readonly otherChildren = computed(() => this.children().filter(child => child.id !== this.childId()));
  protected readonly marks = sectionUpdates('caregivers', this.childId);
  private readonly api = inject(Api);
  protected readonly list = signal<CaregiverList | null>(null);
  protected readonly error = signal('');
  protected readonly notice = signal('');
  protected readonly busy = signal(false);
  protected readonly editing = signal(false);
  protected readonly editId = signal<string | null>(null);
  protected readonly duplicate = signal('');
  protected readonly removing = signal<string | null>(null);
  protected readonly ratingId = signal<string | null>(null);
  protected readonly form = new FormGroup({
    name: new FormControl('', { nonNullable: true, validators: Validators.required }),
    phone: new FormControl('', { nonNullable: true, validators: Validators.required }),
    city: new FormControl('', { nonNullable: true }),
    hourlyRate: new FormControl<number | null>(null, [Validators.min(0), Validators.max(10000)]),
    schoolPickup: new FormControl(false, { nonNullable: true }),
    addToAll: new FormControl(false, { nonNullable: true }),
  });

  constructor() {
    effect(() => { void this.load(); });
    this.form.valueChanges.subscribe(() => this.duplicate.set(''));
  }

  protected async load(): Promise<void> {
    try {
      this.list.set(await this.api.caregivers(this.familyId(), this.childId()));
      this.error.set('');
    } catch {
      this.error.set('Shared caregivers couldn’t be loaded.');
    }
  }

  protected edit(caregiver: Caregiver | null): void {
    const details = caregiver?.details;
    this.form.reset({
      name: details?.name ?? '', phone: details?.phone ?? '', city: details?.city ?? '',
      hourlyRate: details?.hourlyRate ?? null, schoolPickup: details?.schoolPickup ?? false, addToAll: false,
    });
    this.error.set('');
    this.editId.set(caregiver?.id ?? null);
    this.editing.set(true);
  }

  protected async save(allowDuplicate = false): Promise<void> {
    const current = this.list();
    if (!current || this.form.invalid || this.busy()) return;
    const { addToAll, ...details } = this.form.getRawValue();
    if (!this.editId() && addToAll && this.otherChildren().length) {
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
    const targets = [
      this.children().find(child => child.id === currentId) ?? { id: currentId, firstName: 'this child' },
      ...this.otherChildren(),
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
        this.error.set(`Couldn’t save for ${failed.map(child => child.firstName).join(', ')}. Retry to add the missing caregiver.`);
        return;
      }
      this.notice.set('Shared caregiver saved for all children.');
      this.editing.set(false);
    } finally {
      this.busy.set(false);
    }
  }

  protected async remove(id: string, version: number): Promise<void> {
    if (await this.change(() => this.api.removeCaregiver(this.familyId(), this.childId(), id, version))) this.removing.set(null);
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
      this.notice.set('Shared caregivers updated.');
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
          this.error.set('The caregiver list was updated. Review the current list before trying again.');
        }
      } else {
        const errors = error instanceof HttpErrorResponse && error.status === 400
          ? error.error?.errors as Record<string, string[]> | undefined : undefined;
        this.error.set(errors ? Object.values(errors).flat().join(' ') : 'The caregiver update couldn’t be saved.');
      }
      return false;
    } finally {
      this.busy.set(false);
    }
  }

  protected fill(average: number | null, star: number): number {
    return Math.min(1, Math.max(0, (average ?? 0) - star)) * 100;
  }

  protected displayPhone(phone: string): string {
    const value = phone.trim();
    if (!/^(?:\+1|1)?[\d(). -]+$/.test(value)) return phone;
    const digits = value.replace(/\D/g, '');
    if (value.startsWith('+') && digits.length !== 11) return phone;
    const usNumber = /^(?:1)?(\d{3})(\d{3})(\d{4})$/.exec(digits);
    return usNumber ? usNumber.slice(1).join('-') : phone;
  }

  protected phoneLink(phone: string): string {
    return 'tel:' + (phone.startsWith('+') ? '+' : '') + phone.replace(/\D/g, '');
  }
}
