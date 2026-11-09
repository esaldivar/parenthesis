import { LocaleService } from '../../core/i18n/locale.service';
import { TranslatePipe, translate } from '../../core/i18n/translations';
import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, computed, effect, inject, input, signal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { OnScreen, sectionUpdates } from './essentials-updates';
import { Api, Child, EmergencyContact, EmergencyContactsView } from '../../core/api/api';

/** The relationships offered for an emergency contact, closest family first. */
export const RELATIONSHIPS = [
  'Grandparent', 'Aunt', 'Uncle', 'Sibling', 'Other relative', 'Family friend', 'Neighbor',
] as const;

@Component({
  selector: 'app-emergency-contacts-section',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [TranslatePipe, ReactiveFormsModule, OnScreen],
  styleUrl: './essentials-section.css',
  styles: ':host { display: block; margin-block-start: 1rem; }',
  template: `
    <section aria-labelledby="emergency-contacts-heading">
      <h3 id="emergency-contacts-heading">{{ 'feature.emergency.contacts' | tr }}
      </h3>
      @if (error()) { <p role="alert">{{ error() }}</p> }
      <p role="status">{{ notice() }}</p>
      @if (view(); as saved) {
        @if (!saved.contacts.length) { <p>{{ 'feature.no.emergency.contacts.yet' | tr }}</p> }
        @for (contact of saved.contacts; track contact.id ?? contact.phone; let index = $index) {
          <article class="entry" [class.row--updated]="marks.updated(contact.id ?? 'contact-' + index)"
            (appOnScreen)="marks.rowOnScreen(contact.id ?? 'contact-' + index)">
            <h4>@if (contact.callFirst) { <span class="call-first">{{ 'feature.call.first' | tr }}</span> }{{ contact.name }}
              @if (marks.updated(contact.id ?? 'contact-' + index)) { <span class="updated-pill">{{ 'feature.updated' | tr }}</span> }</h4>
            <p>{{ contact.relationship }} · {{ contact.phone }}</p>
            <div class="actions">
              <a class="call" [href]="phoneLink(contact.phone)" [attr.aria-label]="'Call ' + contact.name">{{ 'feature.call' | tr }}</a>
              @if (contact.address; as address) {
                <a [href]="mapLink(address)" target="_blank" rel="noopener noreferrer">{{ 'feature.open.in.maps' | tr }}</a>
              }
              <button type="button" [disabled]="busy() || editing() !== null" (click)="edit(index)">{{ 'feature.edit' | tr }}</button>
              <button type="button" [disabled]="busy() || editing() !== null" (click)="confirmRemove.set(index)">{{ 'feature.remove' | tr }}</button>
            </div>
            @if (confirmRemove() === index) {
              <p>Remove {{ contact.name }} from this child’s emergency contacts?</p>
              <button type="button" [disabled]="busy()" (click)="remove(index)">{{ 'feature.confirm.removal' | tr }}</button>
              <button type="button" [disabled]="busy()" (click)="confirmRemove.set(null)">{{ 'feature.cancel.removal' | tr }}</button>
            }
            @if (otherChildren().length) {
              <label>Copy {{ contact.name }} to
                <select #target [disabled]="busy()">
                  @for (child of otherChildren(); track child.id) {
                    <option [value]="child.id">{{ child.firstName }}</option>
                  }
                </select>
              </label>
              <button type="button" [disabled]="busy()" (click)="copy(contact, target.value)">{{ 'feature.copy.contact' | tr }}</button>
            }
          </article>
        }
        @if (editing() === null) {
          <button type="button" [disabled]="busy() || saved.contacts.length >= 30" (click)="edit(-1)">{{ 'feature.add.emergency.contact' | tr }}</button>
        } @else {
          <form [formGroup]="form" (ngSubmit)="save()">
            <fieldset [disabled]="busy()">
              <legend>{{ editing() === -1 ? 'Add emergency contact' : 'Edit emergency contact' }}</legend>
              <label>{{ 'feature.name' | tr }} <input formControlName="name" maxlength="100" required /></label>
              <label>{{ 'feature.relationship' | tr }}
                <select formControlName="relationshipKind" required>
                  <option value="" disabled>{{ 'feature.choose.a.relationship' | tr }}</option>
                  @for (kind of relationships; track kind) { <option [value]="kind">{{ kind }}</option> }
                  <option [value]="other">{{ other }}</option>
                </select>
              </label>
              @if (form.controls.relationshipKind.value === other) {
                <label>{{ 'feature.describe.the.relationship' | tr }} <input formControlName="relationship" maxlength="100" required /></label>
              }
              <label>{{ 'feature.phone' | tr }} <input type="tel" formControlName="phone" maxlength="32" required /></label>
              <label>{{ 'feature.address.optional' | tr }} <input formControlName="address" maxlength="300" /></label>
              <label><input type="checkbox" formControlName="callFirst" /> {{ 'feature.call.first' | tr }}</label>
              @if (editing() === -1 && otherChildren().length) {
                <label><input type="checkbox" formControlName="addToAll" /> {{ 'feature.add.to.all.children' | tr }}</label>
              }
              <div class="actions">
                <button type="submit" [disabled]="form.invalid">{{ 'feature.save.contact' | tr }}</button>
                <button type="button" (click)="editing.set(null)">{{ 'feature.cancel' | tr }}</button>
              </div>
            </fieldset>
          </form>
        }
      } @else if (error()) {
        <button type="button" (click)="load()">{{ 'feature.try.again' | tr }}</button>
      } @else {
        <p role="status">{{ 'feature.loading.emergency.contacts' | tr }}</p>
      }
    </section>
  `,
})
export class EmergencyContactsSection {
  private readonly locale = inject(LocaleService);
  readonly familyId = input.required<string>();
  readonly childId = input.required<string>();
  protected readonly marks = sectionUpdates('emergencyContacts', this.childId);
  readonly children = input<readonly Child[]>([]);
  private readonly api = inject(Api);
  protected readonly view = signal<EmergencyContactsView | null>(null);
  protected readonly error = signal('');
  protected readonly notice = signal('');
  protected readonly busy = signal(false);
  protected readonly editing = signal<number | null>(null);
  protected readonly confirmRemove = signal<number | null>(null);
  protected readonly otherChildren = computed(() => this.children().filter((child) => child.id !== this.childId()));
  /** Common relationships to pick from; Other takes the parent's own words (a godparent, a coach). */
  protected readonly relationships = RELATIONSHIPS;
  protected readonly other = 'Other';
  protected readonly form = new FormGroup({
    name: new FormControl('', { nonNullable: true, validators: Validators.required }),
    relationshipKind: new FormControl('', { nonNullable: true, validators: Validators.required }),
    relationship: new FormControl('', { nonNullable: true }),
    phone: new FormControl('', { nonNullable: true, validators: Validators.required }),
    address: new FormControl('', { nonNullable: true }),
    callFirst: new FormControl(false, { nonNullable: true }),
    addToAll: new FormControl(false, { nonNullable: true }),
  }, {
    // Other needs the parent's own description.
    validators: (group) => group.get('relationshipKind')?.value === 'Other' && !group.get('relationship')?.value.trim()
      ? { relationship: true } : null,
  });

  constructor() {
    effect(() => { void this.load(); });
  }

  protected async load(): Promise<void> {
    this.error.set('');
    try {
      this.view.set(await this.api.emergencyContacts(this.familyId(), this.childId()));
    } catch {
      this.error.set(translate('feedback.emergency.contacts.couldn.t.be.loaded', this.locale.locale()));
    }
  }

  protected edit(index: number): void {
    const contact = this.view()?.contacts[index];
    // A relationship saved before the list (or typed under Other) comes back as Other with its words.
    const known = RELATIONSHIPS.find((kind) => kind === contact?.relationship);
    this.form.reset({
      name: contact?.name ?? '',
      relationshipKind: known ?? (contact ? this.other : ''),
      relationship: known ? '' : contact?.relationship ?? '',
      phone: contact?.phone ?? '', address: contact?.address ?? '', callFirst: contact?.callFirst ?? false,
      addToAll: false,
    });
    this.error.set('');
    this.notice.set('');
    this.confirmRemove.set(null);
    this.editing.set(index);
  }

  protected async save(): Promise<void> {
    const saved = this.view();
    const index = this.editing();
    if (!saved || index === null || this.form.invalid || this.busy()) return;
    const { relationshipKind, addToAll, ...raw } = this.form.getRawValue();
    const relationship = relationshipKind === this.other ? raw.relationship.trim() : relationshipKind;
    const contact = { ...raw, relationship, id: saved.contacts[index]?.id, address: raw.address.trim() || null };
    if (index === -1 && addToAll && this.otherChildren().length) {
      await this.addForAll(contact);
      return;
    }
    const contacts = saved.contacts.map((item, position) =>
      position === index ? contact : contact.callFirst ? { ...item, callFirst: false } : item,
    );
    if (index === -1) contacts.push(contact);
    if (await this.write(contacts)) this.editing.set(null);
  }

  private async addForAll(contact: EmergencyContact): Promise<void> {
    const familyId = this.familyId();
    const currentId = this.childId();
    const siblings = this.otherChildren();
    this.busy.set(true);
    this.error.set('');
    this.notice.set('');
    try {
      const current = await this.addIfMissing(familyId, currentId, contact);
      this.view.set(current);
      const results = await Promise.allSettled(siblings.map(child =>
        this.addIfMissing(familyId, child.id, { ...contact, callFirst: false }),
      ));
      const failed = siblings.filter((_, index) => results[index].status === 'rejected');
      if (failed.length) {
        this.error.set(`Couldn’t save for ${failed.map(child => child.firstName).join(', ')}. Retry to add the missing contact.`);
        return;
      }
      this.notice.set('Emergency contact saved for all children.');
      this.editing.set(null);
    } catch (error) {
      this.reportSaveError(error);
    } finally {
      this.busy.set(false);
    }
  }

  private async addIfMissing(familyId: string, childId: string, contact: EmergencyContact): Promise<EmergencyContactsView> {
    const target = await this.api.emergencyContacts(familyId, childId);
    const name = contact.name.trim().toLowerCase();
    const phone = this.phoneLink(contact.phone);
    if (target.contacts.some(item => item.name.trim().toLowerCase() === name && this.phoneLink(item.phone) === phone)) {
      return target;
    }
    const contacts = contact.callFirst ? target.contacts.map(item => ({ ...item, callFirst: false })) : target.contacts;
    return this.api.saveEmergencyContacts(familyId, childId, {
      version: target.version, contacts: [...contacts, { ...contact, id: null }],
    });
  }

  protected async remove(index: number): Promise<void> {
    const contacts = this.view()?.contacts.filter((_, position) => position !== index);
    if (contacts && await this.write(contacts)) this.confirmRemove.set(null);
  }

  private async write(contacts: readonly EmergencyContact[]): Promise<boolean> {
    const saved = this.view();
    if (!saved || this.busy()) return false;
    this.busy.set(true);
    this.error.set('');
    this.notice.set('');
    try {
      this.view.set(await this.api.saveEmergencyContacts(this.familyId(), this.childId(), { version: saved.version, contacts }));
      this.notice.set('Emergency contacts saved.');
      return true;
    } catch (error) {
      if (error instanceof HttpErrorResponse && error.status === 409) {
        this.view.set(error.error as EmergencyContactsView);
        this.editing.set(null);
        this.confirmRemove.set(null);
        this.error.set('The list was updated by your co-parent. Review the current contacts before making your edit again.');
      } else {
        this.reportSaveError(error);
      }
      return false;
    } finally {
      this.busy.set(false);
    }
  }

  protected async copy(contact: EmergencyContact, childId: string): Promise<void> {
    if (this.busy() || !this.otherChildren().some((child) => child.id === childId)) return;
    this.busy.set(true);
    this.error.set('');
    this.notice.set('');
    try {
      const target = await this.api.emergencyContacts(this.familyId(), childId);
      await this.api.saveEmergencyContacts(this.familyId(), childId, {
        version: target.version, contacts: [...target.contacts, { ...contact, id: null, callFirst: false }],
      });
      this.notice.set('Emergency contact copied.');
    } catch (error) {
      this.reportSaveError(error);
    } finally {
      this.busy.set(false);
    }
  }

  private reportSaveError(error: unknown): void {
    const validation = error instanceof HttpErrorResponse && error.status === 400
      ? error.error?.errors as Record<string, string[]> | undefined : undefined;
    this.error.set(validation ? Object.values(validation).flat().join(' ') : 'The contact couldn’t be saved. Try again.');
  }

  protected phoneLink(phone: string): string {
    return 'tel:' + (phone.startsWith('+') ? '+' : '') + phone.replace(/\D/g, '');
  }

  protected mapLink(address: string): string {
    return 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(address);
  }
}
