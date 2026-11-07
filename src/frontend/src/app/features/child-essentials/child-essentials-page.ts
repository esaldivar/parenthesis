import {
  ChangeDetectionStrategy, Component, DestroyRef, ElementRef, computed, effect, inject, signal, untracked, viewChild,
} from '@angular/core';
import { Api, Child, EssentialsBanner } from '../../core/api/api';
import { AuthStore } from '../../core/auth/auth.store';
import { EssentialsUpdatesStore } from '../../core/essentials/essentials-updates.store';
import { Avatar } from '../../shared/avatar/avatar';
import { Icon } from '../../shared/icon/icon';
import { ESSENTIALS_SECTIONS, bannerText } from './essentials-updates';

/** How long a banner shows, unless the parent is pointing at or focused on the banners (#128: about ten seconds). */
export const BANNER_MS = 10_000;

interface ShownBanner {
  readonly key: string;
  readonly text: string;
  readonly bg: string;
  readonly fg: string;
}

import { AllergiesFoodSection } from './allergies-food-section';
import { ClothingSection } from './clothing-section';
import { EmergencyContactsSection } from './emergency-contacts-section';
import { RoutinesSection } from './routines-section';
import { SchoolSection } from './school-section';
import { WhatHelpsSection } from './what-helps-section';

@Component({
  selector: 'app-child-essentials-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Avatar, Icon, AllergiesFoodSection, ClothingSection, EmergencyContactsSection, RoutinesSection, SchoolSection, WhatHelpsSection],
  template: `
    <h1 tabindex="-1" #heading>Child Essentials</h1>
    <!-- The other parent's saves since the last visit (#128): shown once, then gone after about ten seconds or on X. -->
    <div class="banners" aria-live="polite" (mouseenter)="pause()" (mouseleave)="resume()" (focusin)="pause()"
      (focusout)="resume()">
      @for (banner of banners(); track banner.key) {
        <div class="banner" [style.--banner-bg]="banner.bg" [style.--banner-fg]="banner.fg">
          <span class="banner-dot" aria-hidden="true"></span>
          <p>{{ banner.text }}</p>
          <button type="button" class="dismiss" [attr.aria-label]="'Dismiss: ' + banner.text" (click)="dismiss(banner.key)">
            <app-icon name="close" [size]="20" />
          </button>
        </div>
      }
    </div>
    @if (loading()) {
      <p role="status">Loading child profiles…</p>
    } @else if (failed()) {
      <p role="alert">Child profiles couldn’t be loaded.</p>
      <button type="button" (click)="retryLoad()">Try again</button>
    } @else if (selectedChild(); as child) {
      <div class="layout">
        <div class="children" role="group" aria-label="Choose a child">
          @for (item of children(); track item.id) {
            <button type="button" [attr.aria-pressed]="child.id === item.id" (click)="selectedId.set(item.id)">
              <app-avatar [name]="item.firstName" [personId]="item.id" />
              {{ item.firstName }}
              @if (updates.unopened(item.id)) {
                <span class="child-dot" aria-hidden="true"></span>
                <span class="visually-hidden">, has updates</span>
              }
            </button>
          }
        </div>
        <section aria-labelledby="essentials-heading">
          <h2 id="essentials-heading">{{ child.firstName }}’s essentials</h2>
          @if (familyId(); as family) {
            @for (profile of [child]; track profile.id) {
              <app-school-section [familyId]="family" [childId]="profile.id" />
              <app-allergies-food-section [familyId]="family" [childId]="profile.id" [children]="children()" />
              <app-routines-section [familyId]="family" [childId]="profile.id" />
              <app-clothing-section [familyId]="family" [childId]="profile.id" />
              <app-what-helps-section [familyId]="family" [childId]="profile.id" />
              <app-emergency-contacts-section [familyId]="family" [childId]="profile.id" [children]="children()" />
            }
          }
        </section>
      </div>
    } @else {
      <p>No active child profiles yet.</p>
    }
  `,
  styles: `
    :host { display: block; }
    .layout, .children { display: grid; gap: 1rem; align-content: start; }
    app-allergies-food-section, app-routines-section, app-clothing-section, app-what-helps-section { margin-block-start: 1rem; }
    button {
      display: flex;
      align-items: center;
      gap: 0.75rem;
      min-height: 44px;
      padding: 0.5rem 0.75rem;
      border: 1px solid var(--color-outline);
      border-radius: 0.75rem;
      background: var(--color-surface);
      color: var(--color-text);
      font: inherit;
      text-align: start;
      cursor: pointer;
    }
    h1:focus { outline: none; }
    .banners { display: grid; gap: 0.5rem; }
    .banner:last-child { margin-block-end: 1rem; }
    .banner {
      display: flex;
      align-items: center;
      gap: 0.75rem;
      padding: 0.25rem 0.25rem 0.25rem 1rem;
      border: 1px solid var(--banner-fg);
      border-radius: 0.75rem;
      background: var(--banner-bg);
      color: var(--banner-fg);
    }
    .banner p { flex: 1; margin: 0; font-weight: 600; overflow-wrap: anywhere; }
    .banner-dot, .child-dot { flex: none; width: 0.625rem; height: 0.625rem; border-radius: 50%; background: currentColor; }
    .child-dot { margin-inline-start: auto; background: var(--color-action); }
    .banner .dismiss {
      display: inline-grid;
      place-items: center;
      flex: none;
      width: 44px;
      padding: 0;
      border: 0;
      background: transparent;
      color: inherit;
    }
    .banner .dismiss:focus-visible, button:focus-visible { outline: 3px solid var(--color-focus); outline-offset: 2px; }
    button[aria-pressed='true'] {
      background: var(--color-surface-soft);
      font-weight: 700;
    }
    @media (min-width: 768px) {
      .layout { grid-template-columns: minmax(10rem, 15rem) minmax(0, 1fr); }
    }
  `,
})
export class ChildEssentialsPage {
  private readonly api = inject(Api);
  private readonly auth = inject(AuthStore);
  protected readonly updates = inject(EssentialsUpdatesStore);
  private readonly heading = viewChild.required<ElementRef<HTMLElement>>('heading');
  private readonly opened = signal<readonly EssentialsBanner[] | null>(null);
  private readonly dismissed = signal<ReadonlySet<string>>(new Set());
  private timer: ReturnType<typeof setTimeout> | undefined;
  /** This visit's banners: one per child and section, in the order they were saved, until dismissed or timed out. */
  protected readonly banners = computed<ShownBanner[]>(() => {
    const names = new Map(this.children().map((child) => [child.id, child.firstName]));
    return (this.opened() ?? [])
      .filter((banner) => names.has(banner.childId) && ESSENTIALS_SECTIONS[banner.section])
      .map((banner) => ({
        key: `${banner.childId}:${banner.section}`,
        text: bannerText(names.get(banner.childId)!, banner),
        bg: ESSENTIALS_SECTIONS[banner.section].bg,
        fg: ESSENTIALS_SECTIONS[banner.section].fg,
      }))
      .filter((banner) => !this.dismissed().has(banner.key));
  });
  protected readonly familyId = computed(() => this.auth.currentFamily()?.id);
  protected readonly children = signal<readonly Child[]>([]);
  protected readonly selectedId = signal<string | null>(null);
  protected readonly loading = signal(true);
  protected readonly failed = signal(false);
  protected readonly retry = signal(0);
  protected readonly selectedChild = computed(() =>
    this.children().find((child) => child.id === this.selectedId()) ?? this.children()[0],
  );

  protected retryLoad(): void {
    this.retry.update((attempt) => attempt + 1);
  }

  /** Removes a banner. Focus, if it was on its X, goes to the page heading rather than being lost. */
  protected dismiss(key: string): void {
    const hadFocus = !!document.activeElement?.closest('.banners');
    this.dismissed.update((keys) => new Set([...keys, key]));
    if (hadFocus) this.heading().nativeElement.focus();
  }

  /** Pointing at or focusing the banners holds them, so they can be read. */
  protected pause(): void {
    clearTimeout(this.timer);
    this.timer = undefined;
  }

  protected resume(): void {
    this.pause();
    if (!this.opened()?.length) return;
    this.timer = setTimeout(() => {
      this.dismissed.update((keys) => new Set([...keys, ...this.banners().map((banner) => banner.key)]));
    }, BANNER_MS);
  }

  constructor() {
    inject(DestroyRef).onDestroy(() => this.pause());
    // Opening the page clears the navigation dot and brings this visit's banners, once.
    effect(() => {
      if (!this.familyId()) return;
      untracked(() => {
        void this.updates.opened().then((banners) => {
          this.opened.set(banners);
          this.resume();
          void this.updates.refresh();
        });
      });
    });
    effect((onCleanup) => {
      const familyId = this.familyId();
      this.retry();
      this.children.set([]);
      this.selectedId.set(null);
      this.failed.set(false);
      this.loading.set(!!familyId);
      if (!familyId) return;

      let active = true;
      onCleanup(() => { active = false; });
      void this.api.children(familyId).then(
        (children) => {
          if (!active) return;
          this.children.set(children.filter((child) => child.status === 'Active'));
          this.loading.set(false);
        },
        () => {
          if (!active) return;
          this.failed.set(true);
          this.loading.set(false);
        },
      );
    });
  }
}
