import { ChangeDetectionStrategy, Component } from '@angular/core';
import { ParentShell } from './core/layout/parent-shell/parent-shell';
import { ChatDock } from './features/messages/chat-dock';

/**
 * The signed-in parent's app: the parent shell with feature UI wired in here, at the composition boundary, so the
 * shell in `core` never imports a feature (ADR-0009). The Messages dock is the only such piece today.
 */
@Component({
  selector: 'app-parent-app',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ParentShell],
  template: `<app-parent-shell [dock]="dock" />`,
  styles: `:host { display: contents; }`,
})
export class ParentApp {
  protected readonly dock = ChatDock;
}
