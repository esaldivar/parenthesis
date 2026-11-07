import { Injectable, computed, effect, inject, signal, untracked } from '@angular/core';
import { NavigationEnd, Router } from '@angular/router';
import { filter } from 'rxjs';
import { Api, EssentialsBanner, EssentialsSectionId, EssentialsUpdates } from '../api/api';
import { AuthStore } from '../auth/auth.store';

const EMPTY: EssentialsUpdates = { newUpdates: false, sections: [] };

/**
 * This parent's indicators for the other parent's shared Child Essentials saves (#128,
 * docs/design/child-essentials-handoff.md): the navigation dot, each child's section dot and the changed rows. The
 * server is the source of truth; it's read again on every navigation and when the tab comes back, so the dot appears
 * without a reload. Each indicator clears on its own. Only identifiers are held, never values.
 */
@Injectable({ providedIn: 'root' })
export class EssentialsUpdatesStore {
  private readonly api = inject(Api);
  private readonly auth = inject(AuthStore);
  private readonly router = inject(Router, { optional: true });

  private readonly familyId = computed(() => {
    const family = this.auth.currentFamily();
    return this.auth.status() === 'signed-in' && family?.role === 'Parent' ? family.id : null;
  });

  readonly view = signal<EssentialsUpdates>(EMPTY);
  /** The navigation dot by Child Essentials. */
  readonly newUpdates = computed(() => this.view().newUpdates);

  constructor() {
    effect(() => {
      const familyId = this.familyId();
      untracked(() => {
        this.view.set(EMPTY);
        if (familyId) void this.refresh();
      });
    });
    this.router?.events.pipe(filter((e) => e instanceof NavigationEnd)).subscribe(() => void this.refresh());
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') void this.refresh();
      });
    }
  }

  /** Reads the indicators again. A failure keeps what's shown: an indicator is a hint, not the record. */
  async refresh(): Promise<void> {
    const familyId = this.familyId();
    if (!familyId) return;
    try {
      const view = await this.api.essentialsUpdates(familyId);
      if (familyId === this.familyId()) this.view.set(view);
    } catch {
      /* keep the last known indicators */
    }
  }

  /** Whether a child's section has a dot. */
  unopened(childId: string, section?: EssentialsSectionId): boolean {
    return this.view().sections.some((s) => s.childId === childId && s.unopened && (!section || s.section === section));
  }

  /** The changed rows of a child's section that haven't been on screen yet. */
  rows(childId: string, section: EssentialsSectionId): readonly string[] {
    return this.view().sections.find((s) => s.childId === childId && s.section === section)?.rows ?? [];
  }

  /** The parent opened Child Essentials: the navigation dot clears and this visit's banners come back, once. */
  async opened(): Promise<EssentialsBanner[]> {
    const familyId = this.familyId();
    if (!familyId) return [];
    this.view.update((view) => ({ ...view, newUpdates: false }));
    try {
      return await this.api.essentialsOpened(familyId);
    } catch {
      return [];
    }
  }

  /** The parent opened a child's section: its dot clears. */
  sectionOpened(childId: string, section: EssentialsSectionId): void {
    const familyId = this.familyId();
    if (!familyId || !this.unopened(childId, section)) return;
    this.view.update((view) => ({
      ...view,
      sections: view.sections.map((s) => (s.childId === childId && s.section === section ? { ...s, unopened: false } : s)),
    }));
    void this.api.essentialsSectionOpened(familyId, childId, section).catch(() => undefined);
  }

  /** Changed rows have been on screen: their highlight clears (next visit). */
  rowsSeen(childId: string, section: EssentialsSectionId, fields: readonly string[]): void {
    const familyId = this.familyId();
    const pending = this.rows(childId, section).filter((row) => fields.includes(row));
    if (!familyId || pending.length === 0) return;
    this.view.update((view) => ({
      ...view,
      sections: view.sections.map((s) =>
        s.childId === childId && s.section === section ? { ...s, rows: s.rows.filter((row) => !pending.includes(row)) } : s,
      ),
    }));
    void this.api.essentialsRowsSeen(familyId, childId, section, pending).catch(() => undefined);
  }
}
