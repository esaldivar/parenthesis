import { LocaleService } from '../../../../core/i18n/locale.service';
import { localizedMessage } from '../../localized-message';
import { essentialsOption } from '../../essentials-options';
import { TranslatePipe, translate } from '../../../../core/i18n/translations';
import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, afterNextRender, computed, effect, inject, Injector, input, signal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { OnScreen, sectionUpdates } from '../../essentials-updates';
import { Icon } from '../../../../shared/components/icon/icon';
import { dashedPhone } from '../../phone-display';
import { Api, Child, EmergencyContact, EmergencyContactsView } from '../../../../core/api/api';

/** The relationships offered for an emergency contact, closest family first. */
export const RELATIONSHIPS = [
  'Grandparent', 'Aunt', 'Uncle', 'Sibling', 'Other relative', 'Family friend', 'Neighbor',
] as const;

type Panel = { kind: 'remove' | 'copy'; index: number } | { kind: 'duplicate'; index: number };

@Component({
  selector: 'app-emergency-contacts-section',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [TranslatePipe, ReactiveFormsModule, OnScreen, Icon],
  styleUrl: './emergency-contacts-section.component.css',
  template: `
    <!-- The exact emergency telephone artwork, centered and faint behind the cards (#665). Decorative. -->
    <img class="art" src="art/child-essentials/emergency-telephone.webp" alt="" />
    <section aria-labelledby="emergency-contacts-heading">
      <h3 id="emergency-contacts-heading" class="visually-hidden">{{ 'feature.emergency.contacts' | tr }}</h3>
      @if (error() && editing() === null && !panel()) { <p role="alert" class="message">{{ error() }}</p> }
      <p role="status" class="message">{{ notice() }}</p>
      @if (view(); as saved) {
        @if (editing() !== null) {
          <form class="state" [formGroup]="form" (ngSubmit)="save()" aria-labelledby="contact-form-title">
            <h4 id="contact-form-title" class="state-heading">{{ editing() === -1 ? ('feature.add.emergency.contact' | tr) : ('feature.edit.emergency.contact' | tr) }}</h4>
            @if (duplicateOf() !== null) {
              <p role="alert" class="inset">{{ 'essentials.emergency.duplicate' | tr: { child: childName() } }}</p>
            }
            @if (error()) { <p role="alert" class="message">{{ error() }}</p> }
            <fieldset [disabled]="busy()">
              <legend class="visually-hidden">{{ editing() === -1 ? ('feature.add.emergency.contact' | tr) : ('feature.edit.emergency.contact' | tr) }}</legend>
              <label class="field"><span class="field-label">{{ 'feature.name' | tr }}</span>
                <input formControlName="name" maxlength="100" required autocomplete="off" /></label>
              <label class="field"><span class="field-label">{{ 'feature.relationship' | tr }}</span>
                <select formControlName="relationshipKind" required>
                  <option value="" disabled>{{ 'feature.choose.a.relationship' | tr }}</option>
                  @for (kind of relationships; track kind) { <option [value]="kind">{{ optionLabel(kind, locale.locale()) }}</option> }
                  <option [value]="other">{{ 'essentials.option.Other' | tr }}</option>
                </select>
              </label>
              @if (form.controls.relationshipKind.value === other) {
                <label class="field"><span class="field-label">{{ 'feature.describe.the.relationship' | tr }}</span>
                  <input formControlName="relationship" maxlength="100" required autocomplete="off" /></label>
              }
              <label class="field"><span class="field-label">{{ 'feature.phone' | tr }}</span>
                <input type="tel" formControlName="phone" maxlength="32" required autocomplete="off" /></label>
              <label class="field"><span class="field-label">{{ 'feature.address.optional' | tr }}</span>
                <input formControlName="address" maxlength="300" autocomplete="off" /></label>
              <label class="check"><input type="checkbox" formControlName="callFirst" aria-describedby="call-first-help" />
                <span>{{ 'essentials.emergency.callFirstFor' | tr: { name: childName() } }}</span></label>
              <p id="call-first-help" class="help">{{ 'essentials.emergency.callFirstHelp' | tr: { name: childName() } }}</p>
              @if (editing() === -1 && otherChildren().length) {
                <label class="check"><input type="checkbox" formControlName="addToAll" /><span>{{ 'feature.add.to.all.children' | tr }}</span></label>
              }
              <div class="actions">
                @if (duplicateOf() !== null) {
                  <button type="button" class="action primary" (click)="review(duplicateOf()!)">{{ 'essentials.emergency.reviewContact' | tr }}</button>
                } @else {
                  <button type="submit" class="action primary" [disabled]="form.invalid">{{ failed() ? ('feature.retry' | tr) : ('feature.save' | tr) }}</button>
                }
                <button type="button" class="action secondary" (click)="closeForm()">{{ 'feature.cancel' | tr }}</button>
              </div>
            </fieldset>
          </form>
        } @else if (panel(); as open) {
          @let contact = saved.contacts[open.index];
          <div class="state" role="group" aria-labelledby="contact-panel-title">
            @if (open.kind === 'remove') {
              <h4 id="contact-panel-title" class="state-heading">{{ 'essentials.emergency.removeContact' | tr }}</h4>
              <p>{{ 'essentials.emergency.removeQuestion' | tr: { contact: contact.name, child: childName() } }}</p>
              @if (error()) { <p role="alert" class="message">{{ error() }}</p> }
              <div class="actions">
                <button type="button" class="action primary" [disabled]="busy()" (click)="remove(open.index)">{{ 'essentials.emergency.removeContact' | tr }}</button>
                <button type="button" class="action secondary" [disabled]="busy()" (click)="closePanel()">{{ 'feature.cancel' | tr }}</button>
              </div>
            } @else {
              <h4 id="contact-panel-title" class="state-heading">{{ 'feature.copy.contact' | tr }}</h4>
              <p>{{ 'essentials.emergency.copyIntro' | tr: { name: contact.name } }}</p>
              <label class="field"><span class="field-label">{{ 'essentials.emergency.copyToChild' | tr }}</span>
                <select class="centered" [value]="copyTarget()" (change)="copyTarget.set($any($event.target).value)" [disabled]="busy()">
                  @for (child of otherChildren(); track child.id) { <option [value]="child.id">{{ child.firstName }}</option> }
                </select>
              </label>
              <p class="help">{{ 'essentials.emergency.copyNote' | tr: { target: targetName(), child: childName() } }}</p>
              @if (error()) { <p role="alert" class="message">{{ error() }}</p> }
              <div class="actions">
                <button type="button" class="action primary" [disabled]="busy()" (click)="copy(contact)">{{ 'feature.copy.contact' | tr }}</button>
                <button type="button" class="action secondary" [disabled]="busy()" (click)="closePanel()">{{ 'feature.cancel' | tr }}</button>
              </div>
            }
          </div>
        } @else {
          @if (!saved.contacts.length) {
            <div class="state"><p class="muted">{{ 'feature.no.emergency.contacts.yet' | tr }}</p></div>
          }
          @for (contact of saved.contacts; track contact.id ?? contact.phone; let index = $index) {
            <article class="card" [id]="'contact-' + index" tabindex="-1" [class.row--updated]="marks.updated(contact.id ?? 'contact-' + index)"
              (appOnScreen)="marks.rowOnScreen(contact.id ?? 'contact-' + index)">
              <div class="identity">
                <div class="who">
                  <h4>@if (contact.callFirst) { <span class="call-first">{{ 'feature.call.first' | tr }}</span> }
                    <span class="name">{{ contact.name }}</span>
                    @if (marks.updated(contact.id ?? 'contact-' + index)) { <span class="updated">{{ 'feature.updated' | tr }}</span> }</h4>
                  <p>{{ optionLabel(contact.relationship, locale.locale()) }} · {{ displayPhone(contact.phone) }}</p>
                  @if (contact.address; as address) { <p class="address">{{ address }}</p> }
                </div>
                <div class="contact-actions">
                  <a class="action primary call" [href]="phoneLink(contact.phone)" [attr.aria-label]="('feature.call.14e218' | tr) + contact.name">
                    <app-icon name="phone" [size]="18" />{{ 'feature.call' | tr }}</a>
                  @if (contact.address; as address) {
                    <a class="action secondary" [href]="mapLink(address)" target="_blank" rel="noopener noreferrer">{{ 'feature.open.in.maps' | tr }}</a>
                  }
                </div>
              </div>
              <div class="toolbar">
                <div class="manage">
                  <button type="button" class="action secondary small" [disabled]="busy()" (click)="edit(index)">{{ 'feature.edit' | tr }}</button>
                  <button type="button" class="action secondary small" [disabled]="busy()" (click)="openPanel('remove', index)">{{ 'feature.remove' | tr }}</button>
                </div>
                @if (otherChildren().length) {
                  <div class="copy">
                    <label class="copy-label" [for]="'copy-target-' + index">{{ 'essentials.emergency.copyTo' | tr }}<span class="visually-hidden"> {{ contact.name }}</span></label>
                    <select class="centered" [id]="'copy-target-' + index" [value]="copyTarget()" (change)="copyTarget.set($any($event.target).value)" [disabled]="busy()">
                      @for (child of otherChildren(); track child.id) { <option [value]="child.id">{{ child.firstName }}</option> }
                    </select>
                    <button type="button" class="action secondary small strong" [disabled]="busy()" (click)="openPanel('copy', index)">
                      {{ 'essentials.emergency.copy' | tr }}<span class="visually-hidden"> {{ contact.name }}</span></button>
                  </div>
                }
              </div>
            </article>
          }
          <div class="add-row">
            <button #addButton type="button" class="action primary add" [disabled]="busy() || saved.contacts.length >= 30" (click)="edit(-1)">{{ 'feature.add.emergency.contact' | tr }}</button>
          </div>
        }
      } @else if (error()) {
        <div class="state"><p role="alert" class="muted">{{ error() }}</p>
          <div class="actions"><button type="button" class="action primary" (click)="load()">{{ 'feature.retry' | tr }}</button></div></div>
      } @else {
        <div class="state"><p role="status" class="muted">{{ 'feature.loading.emergency.contacts' | tr }}</p></div>
      }
    </section>
  `,
})
export class EmergencyContactsSection {
  protected readonly locale = inject(LocaleService);
  protected readonly optionLabel = essentialsOption;
  readonly familyId = input.required<string>();
  readonly childId = input.required<string>();
  protected readonly marks = sectionUpdates('emergencyContacts', this.childId);
  readonly children = input<readonly Child[]>([]);
  private readonly api = inject(Api);
  protected readonly view = signal<EmergencyContactsView | null>(null);
  protected readonly error = localizedMessage();
  protected readonly notice = localizedMessage();
  protected readonly busy = signal(false);
  protected readonly editing = signal<number | null>(null);
  /** The removal or copy confirmation open in the panel (frames 729:11246, 729:11734). */
  protected readonly panel = signal<Panel | null>(null);
  protected readonly copyTarget = signal('');
  /** The last save failed: Save becomes Retry, with the form kept (frame 729:10702). */
  protected readonly failed = signal(false);
  /** Another contact on this child's list already has the phone number being saved (frame 729:12738). */
  protected readonly duplicateOf = signal<number | null>(null);
  private readonly injector = inject(Injector);
  protected readonly childName = computed(() =>
    this.children().find(child => child.id === this.childId())?.firstName ?? translate('essentials.copy.thisChild', this.locale.locale()));
  protected readonly targetName = computed(() =>
    this.otherChildren().find(child => child.id === this.copyTarget())?.firstName ?? '');
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
    // The copy choice starts on the first other child, like the select it replaces.
    effect(() => { this.copyTarget.set(this.otherChildren()[0]?.id ?? ''); });
  }

  protected async load(): Promise<void> {
    this.error.set('');
    try {
      this.view.set(await this.api.emergencyContacts(this.familyId(), this.childId()));
    } catch {
      this.error.set('feedback.emergency.contacts.couldn.t.be.loaded');
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
    this.panel.set(null);
    this.failed.set(false);
    this.duplicateOf.set(null);
    this.editing.set(index);
  }

  protected async save(): Promise<void> {
    const saved = this.view();
    const index = this.editing();
    if (!saved || index === null || this.form.invalid || this.busy()) return;
    const { relationshipKind, addToAll, ...raw } = this.form.getRawValue();
    const relationship = relationshipKind === this.other ? raw.relationship.trim() : relationshipKind;
    const contact = { ...raw, relationship, id: saved.contacts[index]?.id, address: raw.address.trim() || null };
    // The server refuses a second contact with the same number; say so and offer the existing one to review.
    const digits = contact.phone.replace(/\D/g, '');
    // (The same name and number is the same person: retrying an add for several children skips it instead.)
    const name = contact.name.trim().toLowerCase();
    const existing = saved.contacts.findIndex((item, position) => position !== index &&
      item.phone.replace(/\D/g, '') === digits && item.name.trim().toLowerCase() !== name);
    if (existing >= 0) {
      this.duplicateOf.set(existing);
      return;
    }
    if (index === -1 && addToAll && this.otherChildren().length) {
      await this.addForAll(contact);
      return;
    }
    const contacts = saved.contacts.map((item, position) =>
      position === index ? contact : contact.callFirst ? { ...item, callFirst: false } : item,
    );
    if (index === -1) contacts.push(contact);
    if (await this.write(contacts)) this.closeForm();
  }

  protected openPanel(kind: 'remove' | 'copy', index: number): void {
    this.error.set('');
    this.notice.set('');
    this.panel.set({ kind, index });
  }

  protected closePanel(): void {
    const index = this.panel()?.index;
    this.panel.set(null);
    this.error.set('');
    this.focusCard(index);
  }

  protected closeForm(): void {
    const index = this.editing();
    this.editing.set(null);
    this.duplicateOf.set(null);
    this.failed.set(false);
    this.error.set('');
    this.focusCard(index !== null && index >= 0 ? index : undefined);
  }

  /** Review contact: close the form and take the parent to the contact that already has the number. */
  protected review(index: number): void {
    this.editing.set(null);
    this.duplicateOf.set(null);
    this.focusCard(index);
  }

  private focusCard(index: number | undefined): void {
    afterNextRender(() => {
      const host = document.getElementById(index === undefined ? '' : 'contact-' + index);
      (host ?? document.querySelector<HTMLElement>('app-emergency-contacts-section .add'))?.focus();
    }, { injector: this.injector });
  }

  protected displayPhone(phone: string): string {
    return dashedPhone(phone);
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
        this.error.set('essentials.copy.contactPartial', { names: failed.map(child => child.firstName).join(', ') });
        return;
      }
      this.notice.set('essentials.emergency.savedAll');
      this.closeForm();
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
    if (contacts && await this.write(contacts)) this.closePanel();
  }

  private async write(contacts: readonly EmergencyContact[]): Promise<boolean> {
    const saved = this.view();
    if (!saved || this.busy()) return false;
    this.busy.set(true);
    this.error.set('');
    this.notice.set('');
    try {
      this.view.set(await this.api.saveEmergencyContacts(this.familyId(), this.childId(), { version: saved.version, contacts }));
      this.notice.set('essentials.emergency.saved');
      this.failed.set(false);
      return true;
    } catch (error) {
      if (error instanceof HttpErrorResponse && error.status === 409) {
        this.view.set(error.error as EmergencyContactsView);
        this.editing.set(null);
        this.panel.set(null);
        this.error.set('essentials.emergency.conflict');
      } else {
        this.reportSaveError(error);
        this.failed.set(true);
      }
      return false;
    } finally {
      this.busy.set(false);
    }
  }

  /** Copy to the chosen child, keeping that child's own Call first; copying again adds nothing new. */
  protected async copy(contact: EmergencyContact): Promise<void> {
    const childId = this.copyTarget();
    if (this.busy() || !this.otherChildren().some((child) => child.id === childId)) return;
    this.busy.set(true);
    this.error.set('');
    this.notice.set('');
    try {
      await this.addIfMissing(this.familyId(), childId, { ...contact, id: null, callFirst: false });
      this.notice.set('essentials.emergency.copied');
      this.closePanel();
    } catch (error) {
      this.reportSaveError(error);
    } finally {
      this.busy.set(false);
    }
  }

  private reportSaveError(error: unknown): void {
    const validation = error instanceof HttpErrorResponse && error.status === 400
      ? error.error?.errors as Record<string, string[]> | undefined : undefined;
    this.error.set(validation ? 'essentials.copy.validation' : 'essentials.emergency.saveError');
  }

  protected phoneLink(phone: string): string {
    return 'tel:' + (phone.startsWith('+') ? '+' : '') + phone.replace(/\D/g, '');
  }

  protected mapLink(address: string): string {
    return 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(address);
  }
}
