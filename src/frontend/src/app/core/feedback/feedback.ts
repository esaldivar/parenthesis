import { DOCUMENT } from '@angular/common';
import { Dialog } from '@angular/cdk/dialog';
import { inject, Injectable } from '@angular/core';
import { PRIMARY_OUTLET, Router } from '@angular/router';
import { FeedbackDialog } from './feedback-dialog';

@Injectable({ providedIn: 'root' })
export class Feedback {
  private readonly dialog = inject(Dialog);
  private readonly router = inject(Router);
  private readonly document = inject(DOCUMENT);

  open(): void {
    if (this.dialog.getDialogById('parenthesis-feedback')) return;
    const section = this.router.parseUrl(this.router.url).root.children[PRIMARY_OUTLET]?.segments[0]?.path;
    const active = this.document.activeElement;
    const trigger = active?.closest('[role="menu"]')
      ? this.document.querySelector<HTMLElement>('.topbar .account')
      : active instanceof HTMLElement ? active : undefined;
    this.dialog.open(FeedbackDialog, {
      id: 'parenthesis-feedback',
      data: section ?? 'home',
      ariaLabelledBy: 'feedback-heading',
      ariaModal: true,
      backdropClass: ['cdk-overlay-dark-backdrop', 'feedback-backdrop'],
      width: 'min(28rem, calc(100vw - 2rem))',
      maxHeight: 'calc(100dvh - 2rem)',
      restoreFocus: trigger ?? true,
    });
  }
}
