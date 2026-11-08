import { DatePipe, NgTemplateOutlet } from '@angular/common';
import { ChangeDetectionStrategy, Component, ElementRef, Injector, afterNextRender, effect, inject, input, output, signal, viewChild } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import {
  Child, MEDICAL_PROVIDER_TYPES, MedicalProvider, MedicalProvidersHistoryEntry, MedicalProvidersView,
} from '../../core/api/api';
import { Icon } from '../../shared/icon/icon';
import { LOCATION_MAX_LENGTH, mapsDirectionsUrl } from '../calendar/maps-link';
import { RevisionedSection } from './revisioned-section';

type ProviderFields = Omit<MedicalProvider, 'id'>;

@Component({
  selector: 'app-medical-providers-section',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DatePipe, Icon, NgTemplateOutlet, ReactiveFormsModule],
  styleUrls: ['./essentials-section.css', './medical-providers-section.css'],
  template: `
    <section aria-labelledby="medical-heading">
      <button type="button" class="back" #backButton (click)="editing() ? cancel() : back.emit()" [disabled]="saving()">
        <app-icon name="chevron-left" [size]="20" />
        {{ editing() ? 'Medical' : 'Child Essentials' }}
      </button>
      @if (!editing()) {
        <div class="hero">
          <h2 id="medical-heading">Medical</h2>
          <img src="art/child-essentials/medical.webp" alt="" />
        </div>
        <div class="actions" role="group" aria-label="Choose a child">
          @for (child of children(); track child.id) {
            <button type="button" [attr.aria-pressed]="child.id === childId()" (click)="childSelected.emit(child.id)">
              {{ child.firstName }}
            </button>
          }
        </div>
      } @else {
        <h2 id="medical-heading" tabindex="-1" #editorHeading>
          {{ removing() ? 'Remove provider' : existing() ? 'Edit provider' : 'Add provider' }}
        </h2>
      }
      @if (error()) { <p role="alert">{{ error() }}</p> }
      @if (notice()) { <p role="status">{{ notice() }}</p> }

      @if (current(); as saved) {
        @if (!editing()) {
          @if (!saved.providers.length) { <p>No medical providers added yet.</p> }
          @for (provider of saved.providers; track provider.id) {
            <article class="entry provider">
              <div>
                <span class="tag">{{ provider.specialty || provider.type }}</span>
                <h3>{{ provider.name }}</h3>
                @if (provider.practice) { <p>{{ provider.practice }}</p> }
                @if (provider.phone) { <p>{{ provider.phone }}</p> }
                @if (provider.address) { <p>{{ provider.address }}</p> }
              </div>
              <div class="contact-actions">
                @if (provider.phone) {
                  <a class="primary" [href]="callUrl(provider.phone)" [attr.aria-label]="'Call ' + provider.name"><app-icon name="phone" [size]="18" /> Call</a>
                }
                @if (directionsUrl(provider.address); as url) {
                  <a [href]="url" target="_blank" rel="noopener noreferrer"
                    [attr.aria-label]="'Directions to ' + provider.name + ' (opens in a new tab)'"><app-icon name="map-pin" [size]="18" /> Directions</a>
                }
              </div>
              <div class="actions management">
                <button type="button" [attr.aria-label]="'Edit ' + provider.name" (click)="edit(provider)">Edit</button>
                <button type="button" [attr.aria-label]="'Remove ' + provider.name" (click)="remove(provider)">Remove</button>
              </div>
            </article>
          }
        }
        @if (editing()) {
          @if (conflict(); as latest) {
            <p role="alert">Your co-parent saved changes first. Review the current providers before retrying.</p>
            <ng-container *ngTemplateOutlet="providerList; context: { $implicit: latest.providers }" />
          }
          @if (removing()) {
            <p>Remove {{ removing()?.name }} from this child’s medical providers?</p>
            <button type="button" [disabled]="saving()" (click)="save()">Confirm removal</button>
            <button type="button" [disabled]="saving()" (click)="cancel()">Cancel</button>
          } @else {
            <form [formGroup]="form" (ngSubmit)="save()">
              <fieldset [disabled]="saving()">
                <label>Provider type
                  <select formControlName="type">
                    @for (type of types; track type) { <option [value]="type">{{ type }}</option> }
                  </select>
                </label>
                @if (form.controls.type.value === 'Other') {
                  <label>Specialty or label (optional) <input formControlName="specialty" maxlength="100" /></label>
                }
                <label>Provider name <input formControlName="name" maxlength="100" required /></label>
                <label>Practice name (optional) <input formControlName="practice" maxlength="100" /></label>
                <label>Phone number {{ contactRequired() ? '(required)' : '(optional)' }}
                  <input type="tel" formControlName="phone" maxlength="32" [required]="contactRequired()" />
                </label>
                @if (form.controls.phone.touched && form.controls.phone.invalid) {
                  <p role="alert">Enter a phone number with 7 to 15 digits.</p>
                }
                <label>Practice address {{ contactRequired() ? '(required)' : '(optional)' }}
                  <input formControlName="address" [maxLength]="addressLimit" [required]="contactRequired()" />
                </label>
                @if (form.controls.address.touched && form.controls.address.invalid) {
                  <p role="alert">Enter a practice address.</p>
                }
                @if (!existing()) {
                  <fieldset class="child-picker">
                    <legend>Add to children</legend>
                    <p>Choose one or more children</p>
                    <div>
                      @for (child of children(); track child.id) {
                        <label>
                          <input type="checkbox" [checked]="targetIds().includes(child.id)"
                            (change)="toggleTarget(child.id)" />
                          {{ child.firstName }}
                        </label>
                      }
                    </div>
                  </fieldset>
                }
                <button class="primary" type="submit"
                  [disabled]="form.invalid || (!existing() && !targetIds().length)">
                  {{ saving() ? 'Saving…' : 'Save provider' }}
                </button>
              </fieldset>
            </form>
          }
        } @else {
          <button type="button" class="primary" #addButton (click)="edit(null)">
            <app-icon name="plus" [size]="20" /> Add provider
          </button>
          <button type="button" [attr.aria-expanded]="historyOpen()" (click)="toggleHistory()">History</button>
        }
        @if (historyOpen()) {
          <h3 class="history-heading">Medical provider history</h3>
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
              <h5>{{ entry.editedBy }} · <time [attr.datetime]="entry.editedAt">{{ entry.editedAt | date:'medium' }}</time></h5>
              <div class="comparison">
                <div><strong>Previous providers</strong>
                  <ng-container *ngTemplateOutlet="providerList; context: { $implicit: entry.previous }" />
                </div>
                <div><strong>Saved providers</strong>
                  <ng-container *ngTemplateOutlet="providerList; context: { $implicit: entry.current }" />
                </div>
              </div>
            </article>
          }
          @if (nextRevision() !== null && !historyLoading() && !historyError()) {
            <button type="button" (click)="loadHistory(nextRevision())">Show older changes</button>
          }
        }
      } @else if (error()) {
        <button type="button" (click)="load()">Try again</button>
      } @else {
        <p role="status">Loading medical providers…</p>
      }
    </section>
    <ng-template #providerList let-providers>
      @if (providers.length) {
        <ul>
          @for (provider of providers; track provider.id) {
            <li>{{ provider.name }} · {{ provider.specialty || provider.type }}
              @if (provider.practice) { · {{ provider.practice }} }
              @if (provider.phone) { · {{ provider.phone }} }
              @if (provider.address) { · {{ provider.address }} }
            </li>
          }
        </ul>
      } @else { <p>No medical providers.</p> }
    </ng-template>
  `,
})
export class MedicalProvidersSection extends RevisionedSection<MedicalProvidersView, ProviderFields, MedicalProvidersHistoryEntry> {
  readonly children = input.required<readonly Child[]>();
  readonly childSelected = output<string>();
  readonly back = output<void>();
  private readonly injector = inject(Injector);
  private readonly backButton = viewChild<ElementRef<HTMLButtonElement>>('backButton');
  private readonly addButton = viewChild<ElementRef<HTMLButtonElement>>('addButton');
  private readonly editorHeading = viewChild<ElementRef<HTMLElement>>('editorHeading');
  protected readonly targetIds = signal<readonly string[]>([]);
  protected readonly directionsUrl = mapsDirectionsUrl;
  protected readonly addressLimit = LOCATION_MAX_LENGTH;
  protected readonly savedNotice = 'Medical providers saved.';
  protected readonly types = MEDICAL_PROVIDER_TYPES;
  protected readonly existing = signal<MedicalProvider | null>(null);
  protected readonly removing = signal<MedicalProvider | null>(null);
  private draftId = '';
  protected readonly form = new FormGroup({
    type: new FormControl<MedicalProvider['type']>('Doctor', { nonNullable: true }),
    name: new FormControl('', { nonNullable: true, validators: [Validators.required, Validators.pattern(/\S/)] }),
    specialty: new FormControl('', { nonNullable: true }),
    practice: new FormControl('', { nonNullable: true }),
    phone: new FormControl('', {
      nonNullable: true,
      validators: Validators.pattern(/^\s*(?=(?:[^0-9]*[0-9]){7,15}[^0-9]*$)[0-9+ ().-]+\s*$/),
    }),
    address: new FormControl('', { nonNullable: true, validators: Validators.pattern(/\S/) }),
  });

  constructor() {
    super();
    effect(() => { void this.load(); });
    this.focus(this.backButton);
  }

  private focus(element: () => ElementRef<HTMLElement> | undefined): void {
    afterNextRender({ read: () => element()?.nativeElement.focus() }, { injector: this.injector });
  }

  protected contactRequired(): boolean {
    return this.form.controls.type.value === 'Doctor' || this.form.controls.type.value === 'Dentist';
  }

  protected toggleTarget(id: string): void {
    this.targetIds.update(ids => ids.includes(id) ? ids.filter(target => target !== id) : [...ids, id]);
  }

  protected callUrl(phone: string): string {
    return 'tel:' + (phone.startsWith('+') ? '+' : '') + phone.replace(/\D/g, '');
  }

  protected override cancel(): void {
    super.cancel();
    this.focus(this.addButton);
  }

  protected override async save(): Promise<void> {
    if (!this.existing() && !this.removing() && !this.targetIds().length) return;
    await super.save();
    if (!this.destroyRef.destroyed && !this.editing()) this.focus(this.addButton);
  }

  protected async load(): Promise<void> {
    this.error.set('');
    try {
      const saved = await this.api.medicalProviders(this.familyId(), this.childId());
      if (!this.destroyRef.destroyed) this.current.set(saved);
    } catch {
      this.error.set('Medical providers couldn’t be loaded.');
    }
  }

  protected edit(provider: MedicalProvider | null): void {
    this.existing.set(provider);
    this.removing.set(null);
    this.draftId = provider?.id ?? crypto.randomUUID();
    this.targetIds.set([this.childId()]);
    this.form.reset({
      type: provider?.type ?? 'Doctor', name: provider?.name ?? '', specialty: provider?.specialty ?? '',
      practice: provider?.practice ?? '', phone: provider?.phone ?? '', address: provider?.address ?? '',
    });
    this.openEditor();
  }

  protected remove(provider: MedicalProvider): void {
    this.removing.set(provider);
    this.form.reset({ name: provider.name, type: 'Other' });
    this.openEditor();
  }

  private openEditor(): void {
    this.historyOpen.set(false);
    this.notice.set('');
    this.error.set('');
    this.editing.set(true);
    this.focus(this.editorHeading);
  }

  protected store(revision: number, fields: ProviderFields): Promise<MedicalProvidersView> {
    const providers = (this.conflict() ?? this.current())?.providers ?? [];
    const removed = this.removing();
    if (removed) {
      return this.api.saveMedicalProviders(this.familyId(), this.childId(), {
        revision, providers: providers.filter(provider => provider.id !== removed.id),
      });
    }

    const provider: MedicalProvider = {
      ...fields, id: this.draftId, name: fields.name.trim(), practice: fields.practice?.trim() || null,
      address: fields.address?.trim() || null,
      phone: fields.phone?.trim() || null, specialty: fields.type === 'Other' ? fields.specialty?.trim() || null : null,
    };
    if (!this.existing()) {
      return this.api.addMedicalProvider(this.familyId(), this.childId(), provider, this.targetIds());
    }
    const next = providers.some(saved => saved.id === provider.id)
      ? providers.map(saved => saved.id === provider.id ? provider : saved)
      : [...providers, provider];
    return this.api.saveMedicalProviders(this.familyId(), this.childId(), { revision, providers: next });
  }

  protected historyPage(beforeRevision: number | null) {
    return this.api.medicalProvidersHistory(this.familyId(), this.childId(), beforeRevision);
  }
}
