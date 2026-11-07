import {
  ChangeDetectionStrategy, Component, DestroyRef, ElementRef, computed, effect, inject, signal, untracked, viewChild,
} from '@angular/core';
import { Api, Child, EssentialsBanner, EssentialsSectionId } from '../../core/api/api';
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
import { CaregiversSection } from './caregivers-section';
import { ClothingSection } from './clothing-section';
import { EmergencyContactsSection } from './emergency-contacts-section';
import { RoutinesSection } from './routines-section';
import { SchoolSection } from './school-section';
import { WhatHelpsSection } from './what-helps-section';

@Component({
  selector: 'app-child-essentials-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Avatar, Icon, AllergiesFoodSection, CaregiversSection, ClothingSection, EmergencyContactsSection, RoutinesSection, SchoolSection, WhatHelpsSection],
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
              <div class="section-tiles">
                @for (tile of tiles; track tile.section) {
                  <details #disclosure [attr.data-section]="tile.section" (toggle)="tileToggled($event, child.id, tile.section)"
                    [style.--tile-bg]="tile.bg" [style.--tile-fg]="tile.fg"
                    [style.--tile-dark-bg]="tile.darkBg" [style.--tile-dark-fg]="tile.darkFg">
                    <summary>
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"
                        stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                        <path [attr.d]="tile.art" />
                      </svg>
                      <span>{{ tile.name }}</span>
                      @if (!disclosure.open && tileHasUpdate(child.id, tile.section)) {
                        <span class="child-dot" aria-hidden="true"></span>
                        <span class="visually-hidden">, updated</span>
                      }
                      <app-icon class="tile-chevron" name="chevron-down" [size]="18" />
                    </summary>
                    <div class="tile-content">
                      @switch (tile.section) {
                        @case ('school') { <app-school-section [familyId]="family" [childId]="profile.id" /> }
                        @case ('allergiesFood') { <app-allergies-food-section [familyId]="family" [childId]="profile.id" [children]="children()" /> }
                        @case ('routines') { <app-routines-section [familyId]="family" [childId]="profile.id" /> }
                        @case ('clothing') { <app-clothing-section [familyId]="family" [childId]="profile.id" /> }
                        @case ('whatHelps') { <app-what-helps-section [familyId]="family" [childId]="profile.id" /> }
                        @case ('caregivers') { <app-caregivers-section [familyId]="family" [childId]="profile.id" /> }
                        @case ('emergencyContacts') { <app-emergency-contacts-section [familyId]="family" [childId]="profile.id" [children]="children()" /> }
                      }
                    </div>
                  </details>
                }
              </div>
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
    .section-tiles { display: grid; gap: 0.75rem; }
    .section-tiles > details {
      min-width: 0;
      --essentials-tile-bg: light-dark(var(--tile-bg), var(--tile-dark-bg));
      --essentials-tile-fg: light-dark(var(--tile-fg), var(--tile-dark-fg));
    }
    .section-tiles summary {
      display: flex;
      align-items: center;
      gap: 0.75rem;
      min-height: 56px;
      padding: 0.65rem 0.85rem;
      border: 1px solid currentColor;
      border-radius: 0.75rem;
      background: var(--essentials-tile-bg);
      color: var(--essentials-tile-fg);
      font-weight: 700;
      cursor: pointer;
      list-style: none;
    }
    summary::-webkit-details-marker { display: none; }
    summary:focus-visible { outline: 3px solid var(--color-focus); outline-offset: 2px; }
    summary svg { width: 1.75rem; height: 1.75rem; flex: none; }
    .tile-chevron { margin-inline-start: auto; flex: none; }
    summary .child-dot { margin-inline-start: auto; background: currentColor; }
    summary .child-dot ~ .tile-chevron { margin-inline-start: 0; }
    details[open] .tile-chevron { transform: rotate(180deg); }
    .tile-content { padding-block-start: 0.5rem; }
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
        ...this.bannerTint(banner.section),
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

  protected readonly tiles = [
    { section: 'school', name: ESSENTIALS_SECTIONS.school.name, art: 'M3 11l9-7 9 7M5 10v10h14V10M10 20v-6h4v6M12 7v3',
      bg: '#e1edf9', fg: '#233f63', darkBg: '#263b54', darkFg: '#dbeaff' },
    { section: 'allergiesFood', name: ESSENTIALS_SECTIONS.allergiesFood.name, art: 'M3 13h18c-1 5-4 7-9 7s-8-2-9-7zM12 12c0-5 3-8 8-8-1 5-4 8-8 8z',
      bg: '#faedc5', fg: '#614718', darkBg: '#493b24', darkFg: '#fff0c7' },
    { section: 'routines', name: ESSENTIALS_SECTIONS.routines.name, art: 'M20 15.5A8 8 0 0 1 8.5 4 8.5 8.5 0 1 0 20 15.5zM17 4v6m-3-3h6',
      bg: '#e0ebdb', fg: '#344f36', darkBg: '#2c4230', darkFg: '#dfefd9' },
    { section: 'clothing', name: ESSENTIALS_SECTIONS.clothing.name, art: 'M9 4 4 6l-2 5 4 2 2-3v10h8V10l2 3 4-2-2-5-5-2c-1 4-5 4-6 0z',
      bg: '#ebe3fa', fg: '#4f386d', darkBg: '#403451', darkFg: '#f1e5ff' },
    { section: 'whatHelps', name: ESSENTIALS_SECTIONS.whatHelps.name, art: 'M12 20S3 15 3 9a4 4 0 0 1 9-1 4 4 0 0 1 9 1c0 6-9 11-9 11z',
      bg: '#f8e2d4', fg: '#643d2b', darkBg: '#50382f', darkFg: '#ffe9de' },
    { section: 'caregivers', name: ESSENTIALS_SECTIONS.caregivers.name, art: 'M8 10a3 3 0 1 0 0-6 3 3 0 0 0 0 6zm8 1a3 3 0 1 0 0-6M2 20v-2a6 6 0 0 1 12 0v2m2-6a5 5 0 0 1 6 5v1',
      bg: '#dcefeb', fg: '#24534c', darkBg: '#254542', darkFg: '#def7f1' },
    { section: 'emergencyContacts', name: ESSENTIALS_SECTIONS.emergencyContacts.name, art: 'M5 3h4l2 5-3 2c1 3 3 5 6 6l2-3 5 2v4c0 2-2 3-4 2C9 19 5 15 3 7c-1-2 0-4 2-4z',
      bg: '#f7e0e8', fg: '#66384a', darkBg: '#503342', darkFg: '#ffe6ef' },
  ] as const;

  private bannerTint(section: EssentialsSectionId): Pick<ShownBanner, 'bg' | 'fg'> {
    const tile = this.tiles.find((item) => item.section === (section === 'householdRoutines' ? 'routines' : section))!;
    return {
      bg: `light-dark(${tile.bg}, ${tile.darkBg})`,
      fg: `light-dark(${tile.fg}, ${tile.darkFg})`,
    };
  }

  protected tileHasUpdate(childId: string, section: EssentialsSectionId): boolean {
    return this.updates.unopened(childId, section) ||
      (section === 'routines' && this.updates.unopened(childId, 'householdRoutines'));
  }

  protected tileToggled(event: Event, childId: string, section: EssentialsSectionId): void {
    if ((event.currentTarget as HTMLDetailsElement).open) {
      this.updates.sectionOpened(childId, section);
    }
  }

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
