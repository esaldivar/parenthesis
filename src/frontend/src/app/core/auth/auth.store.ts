import { HttpErrorResponse } from '@angular/common/http';
import { Injectable, computed, inject, signal } from '@angular/core';
import { Api, FamilySummary, Me } from '../api/api';
import { AppearanceService } from '../theme/appearance.service';

export type AuthStatus = 'unknown' | 'anonymous' | 'signed-in';

/**
 * The signed-in account and its families. The session itself is an HttpOnly cookie the app never sees
 * (ADR-0004); this store only mirrors what /api/me says. UI state is not a security boundary: the API enforces
 * every rule.
 */
@Injectable({ providedIn: 'root' })
export class AuthStore {
  private readonly api = inject(Api);
  private readonly appearance = inject(AppearanceService);

  readonly user = signal<Me | null>(null);
  readonly status = signal<AuthStatus>('unknown');
  readonly families = signal<readonly FamilySummary[] | null>(null);
  readonly currentFamily = computed(() => this.families()?.[0] ?? null);

  /** Runs before the first route: fetches an antiforgery token, then who (if anyone) is signed in. */
  async initialize(): Promise<void> {
    try {
      await this.api.antiforgery();
      await this.loadUser();
    } catch {
      this.setUser(null); // API unreachable: treat as signed out; pages show their own errors.
    }
  }

  /** Throws the HTTP error on failure so the form can explain it. */
  async signIn(email: string, password: string): Promise<void> {
    await this.api.login({ email, password });
    // Antiforgery tokens belong to the user, so get a new one for the signed-in session.
    await this.api.antiforgery();
    await this.loadUser();
  }

  async signOut(): Promise<void> {
    try {
      await this.api.logout();
    } finally {
      this.setUser(null);
      await this.api.antiforgery().catch(() => undefined);
    }
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

  private async loadUser(): Promise<void> {
    try {
      this.setUser(await this.api.me());
    } catch (error) {
      if (error instanceof HttpErrorResponse && error.status === 401) {
        this.setUser(null);
        return;
      }
      throw error;
    }
  }

  private setUser(user: Me | null): void {
    this.user.set(user);
    this.families.set(null);
    this.status.set(user ? 'signed-in' : 'anonymous');
    // Each account has its own appearance; signed out, the app follows the system.
    this.appearance.useAccount(user?.id ?? null);
  }
}
