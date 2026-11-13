import { TestBed } from '@angular/core/testing';
import { Toasts } from '../app/shared/toast/toasts';

/** The messages showing as toasts (#226), oldest first. */
export const toastMessages = (): string[] =>
  TestBed.inject(Toasts)
    .shown()
    .map((t) => t.message);

/** All toast text, for `toContain` checks. */
export const toastText = (): string => toastMessages().join(' ');
