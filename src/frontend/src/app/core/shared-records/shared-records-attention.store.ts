import { Injectable, computed, effect, inject, signal, untracked } from '@angular/core';
import { NavigationEnd, Router } from '@angular/router';
import { filter } from 'rxjs';
import { Api } from '../api/api';
import { AuthStore } from '../auth/auth.store';

/**
 * Whether Shared records waits on this parent (#477): a proposal to agree to, or a report to acknowledge. It drives a
 * dot by Shared records until there's an in-app notifications feed (#178). Only a count is held, never amounts or
 * titles, and only for a parent: a child's session never asks.
 */
@Injectable({ providedIn: 'root' })
export class SharedRecordsAttentionStore {
  private readonly api = inject(Api);
  private readonly auth = inject(AuthStore);
  private readonly router = inject(Router, { optional: true });

  private readonly familyId = computed(() => {
    const family = this.auth.currentFamily();
    return this.auth.status() === 'signed-in' && family?.role === 'Parent' ? family.id : null;
  });

  readonly count = signal(0);
  readonly needsYou = computed(() => this.count() > 0);

  constructor() {
    effect(() => {
      const familyId = this.familyId();
      untracked(() => {
        this.count.set(0);
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

  /** Reads the count again. A failure keeps what's shown: the dot is a hint, not the record. */
  async refresh(): Promise<void> {
    const familyId = this.familyId();
    if (!familyId) return;
    try {
      const { count } = await this.api.sharedRecordsAttention(familyId);
      if (familyId === this.familyId()) this.count.set(count);
    } catch {
      /* keep the last known count */
    }
  }
}
