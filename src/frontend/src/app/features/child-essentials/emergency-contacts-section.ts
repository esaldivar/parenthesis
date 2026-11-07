import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, computed, effect, inject, input, signal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { Api, Child, EmergencyContact, EmergencyContactsView } from '../../core/api/api';

@Component({
  selector: 'app-emergency-contacts-section',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule],
  styleUrl: './essentials-section.css',
  styles: ':host { display: block; margin-block-start: 1rem; }',
  template: `
    <section aria-labelledby="emergency-contacts-heading">
      <h3 id="emergency-contacts-heading">Emergency Contacts</h3>
      @if (error()) { <p role="alert">{{ error() }}</p> }
      <p role="status">{{ notice() }}</p>
      @if (view(); as saved) {
        @if (!saved.contacts.length) { <p>No emergency contacts yet.</p> }
        @for (contact of saved.contacts; track contact.phone; let index = $index) {
          <article>
            <h4>{{ contact.name }} @if (contact.callFirst) { <span>· Call first</span> }</h4>
            <p>{{ contact.relationship }} · {{ contact.phone }}</p>
            <div class="actions">
              <a [href]="phoneLink(contact.phone)" [attr.aria-label]="'Call ' + contact.name">Call</a>
              @if (contact.address; as address) {
                <a [href]="mapLink(address)" target="_blank" rel="noopener noreferrer">Open in Maps</a>
              }
              <button type="button" [disabled]="busy() || editing() !== null" (click)="edit(index)">Edit</button>
              <button type="button" [disabled]="busy() || editing() !== null" (click)="confirmRemove.set(index)">Remove</button>
            </div>
            @if (confirmRemove() === index) {
              <p>Remove {{ contact.name }} from this child’s emergency contacts?</p>
              <button type="button" [disabled]="busy()" (click)="remove(index)">Confirm removal</button>
              <button type="button" [disabled]="busy()" (click)="confirmRemove.set(null)">Cancel removal</button>
            }
            @if (otherChildren().length) {
              <label>Copy {{ contact.name }} to
                <select #target [disabled]="busy()">
                  @for (child of otherChildren(); track child.id) {
                    <option [value]="child.id">{{ child.firstName }}</option>
                  }
                </select>
              </label>
              <button type="button" [disabled]="busy()" (click)="copy(contact, target.value)">Copy contact</button>
            }
          </article>
        }
        @if (editing() === null) {
          <button type="button" [disabled]="busy() || saved.contacts.length >= 30" (click)="edit(-1)">Add emergency contact</button>
        } @else {
          <form [formGroup]="form" (ngSubmit)="save()">
            <fieldset [disabled]="busy()">
              <legend>{{ editing() === -1 ? 'Add emergency contact' : 'Edit emergency contact' }}</legend>
              <label>Name <input formControlName="name" maxlength="100" required /></label>
              <label>Relationship <input formControlName="relationship" maxlength="100" required /></label>
              <label>Phone <input type="tel" formControlName="phone" maxlength="32" required /></label>
              <label>Address (optional) <input formControlName="address" maxlength="300" /></label>
              <label><input type="checkbox" formControlName="callFirst" /> Call first</label>
              <div class="actions">
                <button type="submit" [disabled]="form.invalid">Save contact</button>
                <button type="button" (click)="editing.set(null)">Cancel</button>
              </div>
            </fieldset>
          </form>
        }
      } @else if (error()) {
        <button type="button" (click)="load()">Try again</button>
      } @else {
        <p role="status">Loading emergency contacts…</p>
      }
    </section>
  `,
})
export class EmergencyContactsSection {
  readonly familyId = input.required<string>();
  readonly childId = input.required<string>();
  readonly children = input<readonly Child[]>([]);
  private readonly api = inject(Api);
  protected readonly view = signal<EmergencyContactsView | null>(null);
  protected readonly error = signal('');
  protected readonly notice = signal('');
  protected readonly busy = signal(false);
  protected readonly editing = signal<number | null>(null);
  protected readonly confirmRemove = signal<number | null>(null);
  protected readonly otherChildren = computed(() => this.children().filter((child) => child.id !== this.childId()));
  protected readonly form = new FormGroup({
    name: new FormControl('', { nonNullable: true, validators: Validators.required }),
    relationship: new FormControl('', { nonNullable: true, validators: Validators.required }),
    phone: new FormControl('', { nonNullable: true, validators: Validators.required }),
    address: new FormControl('', { nonNullable: true }),
    callFirst: new FormControl(false, { nonNullable: true }),
  });

  constructor() {
    effect(() => { void this.load(); });
  }

  protected async load(): Promise<void> {
    this.error.set('');
    try {
      this.view.set(await this.api.emergencyContacts(this.familyId(), this.childId()));
    } catch {
      this.error.set('Emergency contacts couldn’t be loaded.');
    }
  }

  protected edit(index: number): void {
    const contact = this.view()?.contacts[index];
    this.form.reset({
      name: contact?.name ?? '', relationship: contact?.relationship ?? '',
      phone: contact?.phone ?? '', address: contact?.address ?? '', callFirst: contact?.callFirst ?? false,
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
    const raw = this.form.getRawValue();
    const contact = { ...raw, address: raw.address.trim() || null };
    const contacts = saved.contacts.map((item, position) =>
      position === index ? contact : contact.callFirst ? { ...item, callFirst: false } : item,
    );
    if (index === -1) contacts.push(contact);
    if (await this.write(contacts)) this.editing.set(null);
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
        version: target.version, contacts: [...target.contacts, { ...contact, callFirst: false }],
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
