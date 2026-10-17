import { ChangeDetectionStrategy, Component, ElementRef, viewChild } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { Icon } from '../../shared/icon/icon';
import { focusMainOnNavigation } from '../focus-main-on-navigation';
import { PARENT_MOBILE_NAV, PARENT_NAV } from '../navigation';

@Component({
  selector: 'app-parent-shell',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterOutlet, RouterLink, RouterLinkActive, Icon],
  templateUrl: './parent-shell.html',
  styleUrl: './parent-shell.scss',
})
export class ParentShell {
  protected readonly nav = PARENT_NAV;
  protected readonly mobileNav = PARENT_MOBILE_NAV;
  private readonly main = viewChild<ElementRef<HTMLElement>>('main');

  constructor() {
    focusMainOnNavigation(() => this.main());
  }
}
