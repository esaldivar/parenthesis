import { Injectable } from '@angular/core';

const KEY = 'parenthesis.pendingInvitation';
// Invitations last 7 days on the server; keep the link no longer than that.
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Remembers an invitation link while its invitee signs in or creates an account (which can take a trip to their
 * inbox to confirm their email). Only the one-time token is kept, on this device, and it's cleared once the
 * invitation is answered. The server alone decides whether the token is still valid.
 */
@Injectable({ providedIn: 'root' })
export class PendingInvitation {
  save(token: string): void {
    try {
      localStorage.setItem(KEY, JSON.stringify({ token, savedAt: Date.now() }));
    } catch {
      // Storage can be blocked (private windows): the invitee can open the link again after signing in.
    }
  }

  peek(): string | null {
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) {
        return null;
      }
      const { token, savedAt } = JSON.parse(raw) as { token?: unknown; savedAt?: unknown };
      if (typeof token !== 'string' || typeof savedAt !== 'number' || Date.now() - savedAt > MAX_AGE_MS) {
        this.clear();
        return null;
      }
      return token;
    } catch {
      return null;
    }
  }

  clear(): void {
    try {
      localStorage.removeItem(KEY);
    } catch {
      // Nothing to clear.
    }
  }
}
