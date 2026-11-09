import { AppLocale, LocaleService } from '../../core/i18n/locale.service';
import { TranslatePipe } from '../../core/i18n/translations';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { EventThemesService } from '../../core/theme/event-themes.service';
import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Api, FamilyDetails, InvitationSummary } from '../../core/api/api';
import { generalMessage, toProblem } from '../../core/api/problem';
import { AuthStore } from '../../core/auth/auth.store';
import { AppearancePicker } from '../../shared/appearance-picker/appearance-picker';
import { ChildrenAccess } from '../family/children-access';
import { DeviceList } from '../family/device-list';
import { ParentPinSettings } from '../family/parent-pin-settings';
import { InviteCoParent } from '../family/invite-co-parent';
import { DeleteAccount } from './delete-account';
import { GoogleCalendarSettings } from './google-calendar-settings';
import { GooglePhotosSettings } from './google-photos-settings';
import { ProfilePhotoSettings } from './profile-photo-settings';
import { MemorySettingsSection } from './memory-settings';

@Component({
  selector: 'app-settings-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    MatSlideToggleModule,
    TranslatePipe,
    AppearancePicker,
    InviteCoParent,
    ChildrenAccess,
    DeviceList,
    ParentPinSettings,
    GoogleCalendarSettings,
    GooglePhotosSettings,
    DeleteAccount,
    ProfilePhotoSettings,
    MemorySettingsSection,
    RouterLink,
  ],
  template: `
    <h1>{{ 'settings.title' | tr }}</h1>
    <section class="card" aria-labelledby="language-heading">
      <h2 id="language-heading">{{ 'settings.languageHeading' | tr }}</h2>
      <label for="settings-language">{{ 'settings.languageLabel' | tr }}</label>
      <select id="settings-language" [value]="locale.locale()" [disabled]="savingLanguage()" (change)="changeLanguage($event)" aria-describedby="settings-language-help">
        <option value="en">English</option>
        <option value="es-419">Español</option>
      </select>
      <p id="settings-language-help">{{ 'settings.languageHelp' | tr }}</p>
      @if (languageError(); as message) { <p role="alert">{{ message }}</p> }
    </section>
    <section class="card">
      <app-appearance-picker />
      <mat-slide-toggle [checked]="eventThemes.enabled()" (change)="eventThemes.setEnabled($event.checked)" aria-describedby="event-theme-help">{{ 'settings.themes' | tr }}</mat-slide-toggle>
      <p id="event-theme-help">{{ 'settings.themesHelp' | tr }}</p>
    </section>

    @if (auth.currentFamily(); as current) {
      @if (current.role === 'Parent') {
        <section class="card" aria-labelledby="co-parent-heading">
          <h2 id="co-parent-heading">{{ 'settings.coParent' | tr }}</h2>
          @if (error(); as error) {
            <p role="alert">{{ error }}</p>
          } @else if (details(); as details) {
            @if (coParent(details); as coParent) {
              <p>{{ 'feature.you.share' | tr }} {{ details.name }} {{ 'feature.with' | tr }} <strong>{{ coParent }}</strong>{{ 'feature.you.both.have.the.same.say' | tr }}</p>
            } @else {
              <p class="muted">{{ 'settings.invite' | tr }}</p>
              <app-invite-co-parent [familyId]="current.id" [pending]="pending()" />
            }
          } @else {
            <p class="muted">{{ 'settings.loading' | tr }}</p>
          }
        </section>

        <section class="card" aria-labelledby="photos-heading">
          <h2 id="photos-heading">{{ 'settings.profilePhotos' | tr }}</h2>
          <app-profile-photo-settings [familyId]="current.id" />
        </section>

        <section class="card" aria-labelledby="memories-heading">
          <h2 id="memories-heading">{{ 'settings.memories' | tr }}</h2>
          <app-memory-settings [familyId]="current.id" [coParent]="details() ? coParent(details()!) : null" />
        </section>

        <section class="card" aria-labelledby="children-heading">
          <h2 id="children-heading">{{ 'settings.children' | tr }}</h2>
          <app-children-access [familyId]="current.id" />
        </section>

        <section class="card" aria-labelledby="parent-pin-heading">
          <h2 id="parent-pin-heading">{{ 'settings.pin' | tr }}</h2>
          <app-parent-pin-settings [familyId]="current.id" />
        </section>

        <section class="card" aria-labelledby="google-calendar-heading">
          <h2 id="google-calendar-heading">Google Calendar</h2>
          <app-google-calendar-settings [familyId]="current.id" />
        </section>

        <section class="card" aria-labelledby="google-photos-heading">
          <h2 id="google-photos-heading">Google Photos</h2>
          <app-google-photos-settings [familyId]="current.id" [coParent]="details() ? coParent(details()!) : null" />
        </section>

        <section class="card" aria-labelledby="devices-heading">
          <h2 id="devices-heading">{{ 'settings.devices' | tr }}</h2>
          <app-device-list [familyId]="current.id" />
        </section>
      }
    }

    <section class="card" aria-labelledby="privacy-heading">
      <h2 id="privacy-heading">{{ 'settings.privacy' | tr }}</h2>
      <p>{{ 'settings.privacyHelp' | tr }}</p>
      <a routerLink="/privacy">{{ 'settings.privacyLink' | tr }}</a>
    </section>

    @if (auth.status() === 'signed-in') {
      <section class="card" aria-labelledby="delete-account-heading">
        <h2 id="delete-account-heading">{{ 'settings.delete' | tr }}</h2>
        @if (deletionError(); as message) {
          <p role="alert">{{ message }}</p>
        } @else if (deletionFamilies(); as families) {
          <app-delete-account [families]="families" />
        } @else {
          <p class="muted">{{ 'settings.deletionLoading' | tr }}</p>
        }
      </section>
    }
  `,
  styles: `
    :host {
      display: grid;
      gap: var(--space-4);
      align-content: start;
    }
    .card {
      padding: var(--space-4);
      background: var(--color-surface);
      border: 1px solid var(--color-divider);
      border-radius: var(--radius-card);
    }
    h2 {
      font-size: var(--font-size-h3);
      margin-top: 0;
    }
    select {
      display: block;
      min-height: var(--target-min);
      margin-top: var(--space-2);
      padding: var(--space-2);
      background: var(--color-surface);
      color: inherit;
      border: 1px solid var(--color-divider);
      border-radius: 0.5rem;
    }
    .muted {
      color: var(--color-text-secondary);
    }
  `,
})
export class SettingsPage implements OnInit {
  protected readonly locale = inject(LocaleService);

  protected readonly languageError = signal<string | null>(null);

  protected readonly savingLanguage = signal(false);

  protected async changeLanguage(event: Event): Promise<void> {
    const select = event.target as HTMLSelectElement;
    const value = select.value;
    if (value !== 'en' && value !== 'es-419') return;
    const language: AppLocale = value;
    const accountId = this.auth.user()?.id;
    if (!accountId || this.savingLanguage()) return;
    this.savingLanguage.set(true);
    this.languageError.set(null);
    try {
      const saved = await this.api.setLanguage(language);
      const current = this.auth.user();
      if (current?.id === accountId && saved.id === accountId) {
        this.auth.user.set({ ...current, language });
        this.locale.setLocale(language);
      }
    } catch {
      if (this.auth.user()?.id === accountId) {
        select.value = this.locale.locale();
        this.languageError.set(this.locale.locale() === 'es-419'
          ? 'No se pudo guardar el idioma. Inténtalo de nuevo.'
          : 'Could not save your language. Please try again.');
      }
    } finally {
      this.savingLanguage.set(false);
    }
  }

  protected readonly eventThemes = inject(EventThemesService);
  protected readonly auth = inject(AuthStore);
  private readonly api = inject(Api);

  protected readonly details = signal<FamilyDetails | null>(null);
  protected readonly pending = signal<InvitationSummary | null>(null);
  protected readonly error = signal<string | null>(null);
  protected readonly deletionError = signal<string | null>(null);
  protected readonly deletionFamilies = signal<readonly { name: string; coParentName: string | null }[] | null>(null);

  ngOnInit(): void {
    void this.initialize();
  }

  private async initialize(): Promise<void> {
    await Promise.all([this.loadDeletionFamilies(), this.loadCurrentFamily()]);
  }

  private async loadDeletionFamilies(): Promise<void> {
    // The deletion endpoint affects every active family, not just the selected one.
    // Never show a destructive confirmation based on partial or failed loads.
    try {
      const summaries = await this.api.myFamilies();
      const parentFamilies = summaries.filter((family) => family.role === 'Parent');
      const allDetails = await Promise.all(parentFamilies.map((family) => this.api.family(family.id)));
      this.deletionFamilies.set(allDetails.map((details) => ({ name: details.name, coParentName: this.coParent(details) })));
    } catch (error) {
      this.deletionError.set(generalMessage(toProblem(error)));
    }
  }

  private async loadCurrentFamily(): Promise<void> {
    const family = this.auth.currentFamily();
    if (family?.role !== 'Parent') {
      return;
    }
    try {
      const [details, invitations] = await Promise.all([this.api.family(family.id), this.api.invitations(family.id)]);
      this.pending.set(invitations.at(-1) ?? null);
      this.details.set(details);
    } catch (error) {
      this.error.set(generalMessage(toProblem(error)));
    }
  }

  /** The other parent's name, once they've joined. */
  protected coParent(details: FamilyDetails): string | null {
    const me = this.auth.user()?.displayName;
    const parents = details.members.filter((m) => m.role === 'Parent');
    return parents.length > 1 ? (parents.find((p) => p.displayName !== me) ?? parents[1]).displayName : null;
  }
}
