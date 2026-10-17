import { ChangeDetectionStrategy, Component, ElementRef, computed, inject, viewChild } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatMenuModule } from '@angular/material/menu';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { AuthStore } from '../../core/auth/auth.store';
import { Avatar } from '../../shared/avatar/avatar';
import { Logo } from '../../shared/brand/logo';
import { Leaves } from '../../shared/decor/leaves';
import { Icon } from '../../shared/icon/icon';
import { focusMainOnNavigation } from '../focus-main-on-navigation';
import { PARENT_MOBILE_NAV, PARENT_NAV } from '../navigation';

/**
 * The parent shell from the approved dashboard: a calm left sidebar (brand, navigation in the approved order,
 * leaves and tagline, profile) on wide screens; a top bar and bottom navigation on phones.
 */
@Component({
  selector: 'app-parent-shell',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterOutlet, RouterLink, RouterLinkActive, MatButtonModule, MatMenuModule, Icon, Logo, Leaves, Avatar],
  templateUrl: './parent-shell.html',
  styleUrl: './parent-shell.scss',
})
export class ParentShell {
  protected readonly nav = PARENT_NAV;
  protected readonly mobileNav = PARENT_MOBILE_NAV;
  protected readonly auth = inject(AuthStore);
  private readonly router = inject(Router);
  private readonly main = viewChild<ElementRef<HTMLElement>>('main');

  protected readonly firstName = computed(() => this.auth.user()?.displayName.split(/\s+/)[0] ?? 'there');

  constructor() {
    focusMainOnNavigation(() => this.main());
  }

  protected async signOut(): Promise<void> {
    await this.auth.signOut();
    await this.router.navigateByUrl('/sign-in');
  }
}
