import { Dialog, DialogRef } from '@angular/cdk/dialog';
import { DOCUMENT } from '@angular/common';
import { ChangeDetectionStrategy, Component, Injectable, inject } from '@angular/core';
import { NavigationError } from '@angular/router';

/** A stale tab or a network failure can prevent a lazy page from loading. Never reload and discard input silently. */
@Injectable({ providedIn: 'root' })
export class NavigationRecovery {
  private readonly dialogs = inject(Dialog);
  private readonly document = inject(DOCUMENT);

  handle(event: NavigationError): void {
    const message = event.error instanceof Error ? event.error.message : '';
    if (!/Failed to fetch dynamically imported module|error loading dynamically imported module|Importing a module script failed|Loading (?:CSS )?chunk [\w-]+ failed/i.test(message)) {
      return;
    }
    if (!this.dialogs.getDialogById('navigation-recovery')) {
      this.dialogs.open(NavigationRecoveryDialog, {
        id: 'navigation-recovery',
        role: 'alertdialog',
        ariaLabelledBy: 'navigation-recovery-title',
        ariaDescribedBy: 'navigation-recovery-explanation',
        width: '28rem',
        maxWidth: 'calc(100vw - 32px)',
        autoFocus: '.keep-working',
        restoreFocus: true,
        closeOnNavigation: true,
      });
    }
  }

  reload(): void {
    this.document.defaultView?.location.reload();
  }
}

@Component({
  selector: 'app-navigation-recovery-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <h2 id="navigation-recovery-title">This page couldn’t load</h2>
    <div id="navigation-recovery-explanation">
      <p>Your current page is still here. Reload Parenthesis, then try opening the page again.</p>
      <p>Reloading will discard any unsaved changes on your current page.</p>
    </div>
    <div class="actions">
      <button type="button" class="keep-working" (click)="dialog.close()">Keep working</button>
      <button type="button" class="reload" (click)="recovery.reload()">Reload Parenthesis</button>
    </div>
  `,
  styles: `
    :host {
      display: block;
      box-sizing: border-box;
      max-height: calc(100dvh - 32px);
      overflow: auto;
      padding: 24px;
      border: 1px solid var(--color-outline);
      border-radius: 16px;
      background: var(--color-surface);
      color: var(--color-text);
    }
    h2 { font-size: 1.25rem; }
    .actions { display: flex; justify-content: flex-end; gap: 8px; flex-wrap: wrap; }
    button {
      min-height: 44px;
      padding: 8px 16px;
      border: 1px solid var(--color-action);
      border-radius: 12px;
      font: inherit;
      background: var(--color-surface);
      color: var(--color-action);
      cursor: pointer;
      white-space: normal;
    }
    .reload { background: var(--color-action); color: var(--color-on-action); }
  `,
})
export class NavigationRecoveryDialog {
  protected readonly dialog = inject(DialogRef);
  protected readonly recovery = inject(NavigationRecovery);
}
