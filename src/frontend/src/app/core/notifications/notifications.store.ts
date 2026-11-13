import { Injectable, inject, signal } from '@angular/core';
import { Api } from '../api/api';
import { AuthStore } from '../auth/auth.store';
import { parentFamilyRefresh } from '../auth/parent-family-refresh';

@Injectable({ providedIn: 'root' })
export class NotificationsStore {
  private readonly api = inject(Api);
  private readonly auth = inject(AuthStore);
  private sequence = 0;
  readonly unseen = signal(false);
  private readonly family = parentFamilyRefresh(
    () => { this.sequence++; this.unseen.set(false); },
    () => this.refresh(),
  );

  async refresh(): Promise<void> {
    const family = this.family();
    if (!family) return;

    const parent = this.auth.user()?.id;
    const sequence = ++this.sequence;
    try {
      const { unseen } = await this.api.notificationsUnseen(family);
      if (sequence === this.sequence && family === this.family() && parent === this.auth.user()?.id) {
        this.unseen.set(unseen);
      }
    } catch {
      // A transient failure should not clear an existing dot.
    }
  }
}
