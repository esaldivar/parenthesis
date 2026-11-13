import { DOCUMENT } from '@angular/common';
import { Injectable, inject, signal } from '@angular/core';

const PREFIX = 'parenthesis.event-themes.';

/** Personal display preference, cached per account on this device like appearance. */
@Injectable({ providedIn: 'root' })
export class EventThemesService {
  private readonly document = inject(DOCUMENT);
  private account: string | null = null;
  private readonly value = signal(true);
  readonly enabled = this.value.asReadonly();

  useAccount(account: string | null): void {
    this.account = account;
    let enabled = true;
    try {
      enabled = !account || this.document.defaultView?.localStorage.getItem(PREFIX + account) !== 'off';
    } catch {
      // Blocked storage still permits the setting for this session.
    }
    this.value.set(enabled);
  }

  setEnabled(enabled: boolean): void {
    this.value.set(enabled);
    if (!this.account) return;
    try {
      this.document.defaultView?.localStorage.setItem(PREFIX + this.account, enabled ? 'on' : 'off');
    } catch {
      // Do not block the user's current choice when storage is unavailable.
    }
  }
}
