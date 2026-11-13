import { LocaleService } from '../../core/i18n/locale.service';
import { essentialsOption } from './essentials-options';
import { AppDatePipe } from '../../core/i18n/locale-formatting';
import { TranslatePipe } from '../../core/i18n/translations';
import { NgTemplateOutlet } from '@angular/common';
import { ChangeDetectionStrategy, Component, ElementRef, Injector, afterNextRender, effect, inject, input, output, signal, viewChild } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { AbstractControl, FormControl, FormGroup, ReactiveFormsModule, ValidationErrors, Validators } from '@angular/forms';
import {
  Child, MEDICAL_PROVIDER_TYPES, MedicalProvider, MedicalProvidersHistoryEntry, MedicalProvidersView,
} from '../../core/api/api';
import { Icon } from '../../shared/icon/icon';
import { LOCATION_MAX_LENGTH, mapsDirectionsUrl } from '../calendar/maps-link';
import { RevisionedSection } from './revisioned-section';

type ProviderFields = Omit<MedicalProvider, 'id'>;

/** A doctor's or dentist's phone and address are required; for the other types they're optional. */
function requiredForContact(control: AbstractControl): ValidationErrors | null {
  const type = control.parent?.get('type')?.value;
  return (type === 'Doctor' || type === 'Dentist') && !String(control.value ?? '').trim() ? { required: true } : null;
}

@Component({
  selector: 'app-medical-providers-section',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [TranslatePipe, AppDatePipe, Icon, NgTemplateOutlet, ReactiveFormsModule],
  styleUrls: ['./essentials-section.css', './medical-providers-section.css'],
  template: `
    <section aria-labelledby="medical-heading">
      <button type="button" class="back" #backButton (click)="editing() ? cancel() : back.emit()" [disabled]="saving()">
        <app-icon name="chevron-left" [size]="20" />
        {{ editing() ? ('feature.medical' | tr) : ('feature.child.essentials' | tr) }}
      </button>
      @if (!editing()) {
        <div class="hero">
          <h2 id="medical-heading">{{ 'feature.medical' | tr }}</h2>
          <img src="art/child-essentials/medical.webp" alt="" />
        </div>
        <div class="actions" role="group" aria-label="{{ 'feature.choose.a.child' | tr }}">
          @for (child of children(); track child.id) {
            <button type="button" [attr.aria-pressed]="child.id === childId()" (click)="childSelected.emit(child.id)">
              {{ child.firstName }}
            </button>
          }
        </div>
      } @else {
        <h2 id="medical-heading" tabindex="-1" #editorHeading>
          {{ removing() ? ('feature.remove.provider' | tr) : existing() ? ('feature.edit.provider' | tr) : ('feature.add.provider' | tr) }}
        </h2>
      }
      @if (error()) { <p role="alert">{{ error() }}</p> }
      @if (notice()) { <p role="status">{{ notice() }}</p> }

      @if (current(); as saved) {
        @if (!editing()) {
          @if (!saved.providers.length) { <p>{{ 'feature.no.medical.providers.added.yet' | tr }}</p> }
          @for (provider of saved.providers; track provider.id) {
            <article class="entry provider">
              <div>
                <span class="tag">{{ provider.specialty || optionLabel(provider.type, locale.locale()) }}</span>
                <h3>{{ provider.name }}</h3>
                @if (provider.practice) { <p>{{ provider.practice }}</p> }
                @if (provider.phone) { <p>{{ provider.phone }}</p> }
                @if (provider.address) { <p>{{ provider.address }}</p> }
              </div>
              <div class="contact-actions">
                @if (provider.phone) {
                  <a class="primary" [href]="callUrl(provider.phone)" [attr.aria-label]="('feature.call.14e218' | tr) + provider.name"><app-icon name="phone" [size]="18" /> {{ 'feature.call' | tr }}</a>
                }
                @if (directionsUrl(provider.address); as url) {
                  <a [href]="url" target="_blank" rel="noopener noreferrer"
                    [attr.aria-label]="('feature.directions.to' | tr) + provider.name + ('feature.opens.in.a.new.tab.708573' | tr)"><app-icon name="map-pin" [size]="18" /> {{ 'feature.directions' | tr }}</a>
                }
              </div>
              <div class="actions management">
                <button type="button" [attr.aria-label]="('feature.edit.4a683d' | tr) + provider.name" (click)="edit(provider)">{{ 'feature.edit' | tr }}</button>
                <button type="button" [attr.aria-label]="('feature.remove.594895' | tr) + provider.name" (click)="remove(provider)">{{ 'feature.remove' | tr }}</button>
              </div>
            </article>
          }
        }
        @if (editing()) {
          @if (conflict(); as latest) {
            <p role="alert">{{ 'feature.your.co.parent.saved.changes.first.review.4d6a45' | tr }}</p>
            <ng-container *ngTemplateOutlet="providerList; context: { $implicit: latest.providers }" />
          }
          @if (removing()) {
            <p>{{ 'feature.remove' | tr }} {{ removing()?.name }} {{ 'feature.from.this.child.s.medical.providers' | tr }}</p>
            <button type="button" [disabled]="saving()" (click)="save()">{{ 'feature.confirm.removal' | tr }}</button>
            <button type="button" [disabled]="saving()" (click)="cancel()">{{ 'feature.cancel' | tr }}</button>
          } @else {
            <form [formGroup]="form" (ngSubmit)="save()">
              <fieldset [disabled]="saving()">
                <label>{{ 'feature.provider.type' | tr }}
                  <select formControlName="type">
                    @for (type of types; track type) { <option [value]="type">{{ optionLabel(type, locale.locale()) }}</option> }
                  </select>
                </label>
                @if (form.controls.type.value === 'Other') {
                  <label>{{ 'feature.specialty.or.label.optional' | tr }} <input formControlName="specialty" maxlength="100" /></label>
                }
                <label>{{ 'feature.provider.name' | tr }} <input formControlName="name" maxlength="100" required /></label>
                <label>{{ 'feature.practice.name.optional' | tr }} <input formControlName="practice" maxlength="100" /></label>
                <label>{{ 'feature.phone.number' | tr }} {{ contactRequired() ? ('feature.required.89db19' | tr) : ('feature.optional' | tr) }}
                  <input type="tel" formControlName="phone" maxlength="32" [required]="contactRequired()" />
                </label>
                @if (form.controls.phone.touched && form.controls.phone.invalid) {
                  <p role="alert">{{ form.controls.phone.hasError('required') ? ('feature.enter.a.phone.number.for.a.doctor' | tr) : ('feature.enter.a.phone.number.with.7.to' | tr) }}</p>
                }
                <label>{{ 'feature.practice.address' | tr }} {{ contactRequired() ? ('feature.required.89db19' | tr) : ('feature.optional' | tr) }}
                  <input formControlName="address" [maxLength]="addressLimit" [required]="contactRequired()" />
                </label>
                @if (form.controls.address.touched && form.controls.address.invalid) {
                  <p role="alert">{{ form.controls.address.hasError('required') ? ('feature.enter.a.practice.address.for.a.doctor' | tr) : ('feature.enter.a.practice.address' | tr) }}</p>
                }
                @if (!existing()) {
                  <fieldset class="child-picker">
                    <legend>{{ 'feature.add.to.children' | tr }}</legend>
                    <p>{{ 'feature.choose.one.or.more.children' | tr }}</p>
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
                  {{ saving() ? ('feature.saving' | tr) : ('feature.save.provider' | tr) }}
                </button>
              </fieldset>
            </form>
          }
        } @else {
          <button type="button" class="primary" #addButton (click)="edit(null)">
            <app-icon name="plus" [size]="20" /> {{ 'feature.add.provider' | tr }}
          </button>
          <button type="button" [attr.aria-expanded]="historyOpen()" (click)="toggleHistory()">{{ 'feature.history' | tr }}</button>
        }
        @if (historyOpen()) {
          <h3 class="history-heading">{{ 'feature.medical.provider.history' | tr }}</h3>
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
              <h5>{{ entry.editedBy }} · <time [attr.datetime]="entry.editedAt">{{ entry.editedAt | appDate:'medium' }}</time></h5>
              <div class="comparison">
                <div><strong>{{ 'feature.previous.providers' | tr }}</strong>
                  <ng-container *ngTemplateOutlet="providerList; context: { $implicit: entry.previous }" />
                </div>
                <div><strong>{{ 'feature.saved.providers' | tr }}</strong>
                  <ng-container *ngTemplateOutlet="providerList; context: { $implicit: entry.current }" />
                </div>
              </div>
            </article>
          }
          @if (nextRevision() !== null && !historyLoading() && !historyError()) {
            <button type="button" (click)="loadHistory(nextRevision())">{{ 'feature.show.older.changes' | tr }}</button>
          }
        }
      } @else if (error()) {
        <button type="button" (click)="load()">{{ 'feature.try.again' | tr }}</button>
      } @else {
        <p role="status">{{ 'feature.loading.medical.providers' | tr }}</p>
      }
    </section>
    <ng-template #providerList let-providers>
      @if (providers.length) {
        <ul>
          @for (provider of providers; track provider.id) {
            <li>{{ provider.name }} · {{ provider.specialty || optionLabel(provider.type, locale.locale()) }}
              @if (provider.practice) { · {{ provider.practice }} }
              @if (provider.phone) { · {{ provider.phone }} }
              @if (provider.address) { · {{ provider.address }} }
            </li>
          }
        </ul>
      } @else { <p>{{ 'feature.no.medical.providers' | tr }}</p> }
    </ng-template>
  `,
})
export class MedicalProvidersSection extends RevisionedSection<MedicalProvidersView, ProviderFields, MedicalProvidersHistoryEntry> {
  protected readonly locale = inject(LocaleService);
  protected readonly optionLabel = essentialsOption;
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
  protected readonly savedNoticeKey = 'essentials.medical.saved';
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
      validators: [requiredForContact, Validators.pattern(/^\s*(?=(?:[^0-9]*[0-9]){7,15}[^0-9]*$)[0-9+ ().-]+\s*$/)],
    }),
    address: new FormControl('', { nonNullable: true, validators: [requiredForContact, Validators.pattern(/\S/)] }),
  });

  constructor() {
    super();
    effect(() => { void this.load(); });
    // A doctor or dentist needs a phone and an address; other types don't. Check both again when the type changes.
    this.form.controls.type.valueChanges.pipe(takeUntilDestroyed()).subscribe(() => {
      this.form.controls.phone.updateValueAndValidity();
      this.form.controls.address.updateValueAndValidity();
    });
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

  /**
   * Loads the selected child's providers. Switching children clears what was shown first, and an answer for a child
   * who is no longer selected is ignored, so one child's medical contacts never show under another child.
   */
  protected async load(): Promise<void> {
    const childId = this.childId();
    this.error.set('');
    this.current.set(null);
    this.conflict.set(null);
    try {
      const saved = await this.api.medicalProviders(this.familyId(), childId);
      if (!this.destroyRef.destroyed && childId === this.childId()) this.current.set(saved);
    } catch {
      if (childId === this.childId()) this.error.set('feedback.medical.providers.couldn.t.be.loaded');
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
