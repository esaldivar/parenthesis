import { Injectable, computed, inject, signal } from '@angular/core';
import { Api } from '../api/api';
import { parentFamilyRefresh } from '../auth/parent-family-refresh';

/**
 * Whether Shared records waits on this parent (#477): a proposal to agree to, or a report to acknowledge. It drives a
 * dot by Shared records until there's an in-app notifications feed (#178). Only a count is held, never amounts or
 * titles, and only for a parent: a child's session never asks.
 */
@Injectable({ providedIn: 'root' })
export class SharedRecordsAttentionStore {
  private readonly api = inject(Api);

  readonly count = signal(0);
  readonly needsYou = computed(() => this.count() > 0);
  private readonly familyId = parentFamilyRefresh(() => this.count.set(0), () => this.refresh());

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
