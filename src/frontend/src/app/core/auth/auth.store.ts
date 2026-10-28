import { EventThemesService } from '../theme/event-themes.service';
import { HttpErrorResponse } from '@angular/common/http';
import { Injectable, computed, inject, signal } from '@angular/core';
import { Api, ChildSession, DeviceProfiles, FamilySummary, Me } from '../api/api';
import { AppearanceService } from '../theme/appearance.service';

/** `signed-in` is a parent's account; `child` is a child signed in with their PIN on a registered device. */
export type AuthStatus = 'unknown' | 'anonymous' | 'signed-in' | 'child';

/**
 * Who is using the app, and the device's profile picker. The session itself is an HttpOnly cookie the app never sees
 * (ADR-0004); this store only mirrors what the API says. UI state is not a security boundary: the API enforces every
 * rule, including that a child session can only reach child-safe endpoints (ADR-0006).
 *
 * Antiforgery tokens are tied to who is signed in, so every change of profile (a parent signs in or out, a child
 * signs in, a tablet is paired) fetches a fresh one before anything else is sent.
 */
@Injectable({ providedIn: 'root' })
export class AuthStore {
  private readonly api = inject(Api);
  private readonly appearance = inject(AppearanceService);
  private readonly eventThemes = inject(EventThemesService);

  readonly user = signal<Me | null>(null);
  readonly child = signal<ChildSession | null>(null);
  readonly status = signal<AuthStatus>('unknown');
  readonly families = signal<readonly FamilySummary[] | null>(null);
  readonly currentFamily = computed(() => this.families()?.[0] ?? null);
  /** "Who's using Parenthesis?" for this browser, when it's a registered device; null otherwise. */
  readonly device = signal<DeviceProfiles | null>(null);

  /** Runs before the first route: an antiforgery token, who (if anyone) is signed in, and this device's picker. */
  async initialize(): Promise<void> {
    try {
      await this.api.antiforgery();
      await this.loadSession();
    } catch {
      this.setUser(null); // API unreachable: treat as signed out; pages show their own errors.
      return;
    }
    // Without the picker, sign-in still works; the device is simply treated as unregistered.
    await this.loadDevice().catch(() => this.device.set(null));
  }

  /** A parent signs in with their full password. Throws the HTTP error on failure so the form can explain it. */
  async signIn(email: string, password: string): Promise<void> {
    await this.api.login({ email, password });
    await this.api.antiforgery();
    await this.loadSession();
    await this.refreshDeviceAfterSignIn();
  }

  /** A child signs in with their PIN on this registered device. Throws the HTTP error (401 tries left, 423 paused/locked). */
  async childSignIn(childId: string, pin: string): Promise<void> {
    await this.api.childSignIn(childId, pin);
    await this.api.antiforgery();
    await this.loadSession();
  }

  /** The parent who set up this shared device enters their profile with their PIN (#153). Throws the HTTP error. */
  async parentPinSignIn(membershipId: string, pin: string): Promise<void> {
    await this.api.parentPinSignIn(membershipId, pin);
    await this.api.antiforgery();
    await this.loadSession();
    await this.refreshDeviceAfterSignIn();
  }

  /**
   * The picker loaded while nobody was signed in says the device isn't "yours". Reload it as the parent, so the shell
   * offers Switch profile (which keeps the device) rather than only Sign out (which removes it).
   */
  private async refreshDeviceAfterSignIn(): Promise<void> {
    await this.loadDevice().catch(() => undefined);
  }

  /**
   * Whether to ask "Is this a shared family device?" after a password sign-in: only for a parent with a family, on a
   * browser that isn't already their shared device. Nothing is registered without the parent's explicit choice.
   */
  async shouldOfferSharedSetup(): Promise<boolean> {
    const [families, device] = await Promise.all([
      this.loadFamilies().catch(() => [] as readonly FamilySummary[]),
      this.loadDevice().catch(() => null),
    ]);
    return families.length > 0 && !(device?.deviceKind === 'Household' && device.isYours) && !this.declinedSharedSetup();
  }

  /**
   * "No, continue to my account": remembered in this browser for this parent only, so a personal device doesn't ask
   * again at every sign-in (owner decision, October 28, 2026). Not a security setting: Settings still offers setup.
   */
  declineSharedSetup(): void {
    const key = this.declinedKey();
    try {
      if (key) {
        localStorage.setItem(key, '1');
      }
    } catch {
      // Storage unavailable (private mode): the question is simply asked again next time.
    }
  }

  private declinedSharedSetup(): boolean {
    const key = this.declinedKey();
    try {
      return key !== null && localStorage.getItem(key) === '1';
    } catch {
      return false;
    }
  }

  private declinedKey(): string | null {
    const id = this.user()?.id;
    return id ? `parenthesis.sharedDevice.declined:${id}` : null;
  }

  /** "Yes, this is a shared family device." The parent stays signed in: no second password prompt (#153). */
  async setUpSharedDevice(familyId: string, name: string, pin: string | null): Promise<void> {
    await this.api.setUpSharedDevice(familyId, name, pin);
    const key = this.declinedKey();
    try {
      if (key) {
        localStorage.removeItem(key);
      }
    } catch {
      // Nothing to clear.
    }
    await this.api.antiforgery();
    await this.loadDevice();
  }

  /**
   * Switch profile: the server ends this session (parent or child) and keeps the shared device's picker. Local state
   * is cleared even if the request fails, so nothing from the previous profile stays on screen.
   */
  async switchProfile(): Promise<void> {
    try {
      await this.api.switchProfile();
    } finally {
      this.setUser(null);
      await this.api.antiforgery().catch(() => undefined);
      await this.loadDevice().catch(() => this.device.set(null));
    }
  }

  /** Makes this browser a child's own tablet. Any session on it ends, so it starts at the picker. */
  async pairDevice(code: string, deviceName: string): Promise<{ childId: string; childFirstName: string }> {
    const paired = await this.api.pairDevice(code, deviceName);
    this.setUser(null);
    await this.api.antiforgery();
    await this.loadDevice();
    return paired;
  }

  /** Full sign-out. On the parent's own shared device the server removes the device too, so its picker is gone. */
  async signOut(): Promise<void> {
    try {
      await this.api.logout();
    } finally {
      this.setUser(null);
      await this.api.antiforgery().catch(() => undefined);
      await this.loadDevice().catch(() => this.device.set(null));
    }
  }

  /** Deletes the parent's account (A-12). The API ends the session; throws the HTTP error so the form can explain it. */
  async deleteAccount(password: string): Promise<void> {
    await this.api.deleteAccount(password);
    this.setUser(null);
    await this.api.antiforgery().catch(() => undefined);
    await this.loadDevice().catch(() => undefined);
  }

  async loadFamilies(): Promise<readonly FamilySummary[]> {
    const families = await this.api.myFamilies();
    this.families.set(families);
    return families;
  }

  async createFamily(name: string, timeZone: string): Promise<FamilySummary> {
    const family = await this.api.createFamily({ name, timeZone });
    await this.loadFamilies();
    return family;
  }

  /** Refreshes this device's picker, for example after a parent sets it up or resets a child's PIN. */
  async loadDevice(): Promise<DeviceProfiles | null> {
    try {
      this.device.set(await this.api.deviceProfiles());
    } catch (error) {
      if (!(error instanceof HttpErrorResponse && error.status === 404)) {
        throw error;
      }
      this.device.set(null); // Not a registered device.
    }
    return this.device();
  }

  /** A parent account answers /api/me; a child session is refused there (403) and answers /api/session/child. */
  private async loadSession(): Promise<void> {
    try {
      this.setUser(await this.api.me());
    } catch (error) {
      if (error instanceof HttpErrorResponse && error.status === 401) {
        this.setUser(null);
        return;
      }
      if (error instanceof HttpErrorResponse && error.status === 403) {
        this.setChild(await this.api.childSession());
        return;
      }
      throw error;
    }
  }

  private setUser(user: Me | null): void {
    this.user.set(user);
    this.child.set(null);
    this.families.set(null);
    this.status.set(user ? 'signed-in' : 'anonymous');
    // Each account has its own appearance; signed out, the app follows the system.
    this.appearance.useAccount(user?.id ?? null);
    this.eventThemes.useAccount(user?.id ?? null);
  }

  private setChild(child: ChildSession): void {
    this.user.set(null);
    this.child.set(child);
    this.families.set(null);
    this.status.set('child');
    // A child's appearance is their own, never a parent's (CLAUDE.md: appearance is personal).
    this.appearance.useAccount(`child:${child.childId}`);
    this.eventThemes.useAccount(`child:${child.childId}`);
  }
}
