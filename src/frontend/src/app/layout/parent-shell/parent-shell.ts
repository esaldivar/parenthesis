import { ChangeDetectionStrategy, Component, ElementRef, computed, inject, isDevMode, viewChild } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { MatButtonModule } from '@angular/material/button';
import { MatMenuModule } from '@angular/material/menu';
import { IsActiveMatchOptions, NavigationEnd, Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { filter, map } from 'rxjs';
import { AuthStore } from '../../core/auth/auth.store';
import { Avatar } from '../../shared/avatar/avatar';
import { Logo } from '../../shared/brand/logo';
import { Leaves } from '../../shared/decor/leaves';
import { Icon } from '../../shared/icon/icon';
import { focusMainOnNavigation } from '../focus-main-on-navigation';
import { PARENT_MOBILE_NAV, PARENT_NAV } from '../navigation';
import { SAMPLE_NOTIFICATIONS, SAMPLE_UNREAD } from '../sample-counts';

const IGNORE_QUERY = { queryParams: 'ignored', fragment: 'ignored', matrixParams: 'ignored' } as const;
const HOME_ACTIVE: IsActiveMatchOptions = { paths: 'exact', ...IGNORE_QUERY };
const SECTION_ACTIVE: IsActiveMatchOptions = { paths: 'subset', ...IGNORE_QUERY };

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
  /** Home is active only on "/" itself, other items on their sections too; queries (`?week=`, `?sample=1`) never matter. */
  protected activeOptions(path: string): IsActiveMatchOptions {
    return path === '/' ? HOME_ACTIVE : SECTION_ACTIVE;
  }
  protected readonly auth = inject(AuthStore);
  private readonly router = inject(Router);
  private readonly main = viewChild<ElementRef<HTMLElement>>('main');
  private readonly url = toSignal(
    this.router.events.pipe(
      filter((e) => e instanceof NavigationEnd),
      map(() => this.router.url),
    ),
    { initialValue: this.router.url },
  );

  /** The development-only sample preview (`?sample=1`), the only place placeholder counts appear. */
  protected readonly sample = computed(
    () => isDevMode() && new URLSearchParams(this.url().split('?')[1] ?? '').get('sample') === '1',
  );
  protected readonly notifications = computed(() => (this.sample() ? SAMPLE_NOTIFICATIONS : 0));

  /** PLACEHOLDER: sample-only unread count for a navigation item; always 0 for real data (no unread API yet). */
  protected unread(path: string): number {
    return this.sample() ? (SAMPLE_UNREAD[path] ?? 0) : 0;
  }

  protected readonly firstName = computed(() => this.auth.user()?.displayName.split(/\s+/)[0] ?? 'there');

  constructor() {
    focusMainOnNavigation(() => this.main());
  }

  protected async signOut(): Promise<void> {
    await this.auth.signOut();
    await this.router.navigateByUrl('/sign-in');
  }
}
