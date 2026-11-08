import {
  ChangeDetectionStrategy, Component, DestroyRef, ElementRef, Injector, afterNextRender, computed, effect, inject, signal,
  untracked, viewChild, viewChildren,
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
  readonly art: string;
}

import { AllergiesFoodSection } from './allergies-food-section';
import { CaregiversSection } from './caregivers-section';
import { ClothingSection } from './clothing-section';
import { EmergencyContactsSection } from './emergency-contacts-section';
import { MedicalProvidersSection } from './medical-providers-section';
import { RoutinesSection } from './routines-section';
import { SchoolSection } from './school-section';
import { WhatHelpsSection } from './what-helps-section';

/** Medical's banner colours and icon (dusty coral, docs/design/child-essentials-handoff.md); it has its own screen. */
const MEDICAL_TINT = {
  bg: '#f6ddd6', fg: '#6b2f24', darkBg: '#4d2d2a', darkFg: '#ffe1da',
  art: 'M10 4h4v6h6v4h-6v6h-4v-6H4v-4h6z',
} as const;

@Component({
  selector: 'app-child-essentials-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Avatar, Icon, AllergiesFoodSection, CaregiversSection, ClothingSection, EmergencyContactsSection, MedicalProvidersSection, RoutinesSection, SchoolSection, WhatHelpsSection],
  template: `
    <h1 tabindex="-1" #heading>Child Essentials</h1>
    <!-- The other parent's saves since the last visit (#128): shown once, then gone after about ten seconds or on X. -->
    <div class="banners" aria-live="polite" (mouseenter)="pause()" (mouseleave)="resume()" (focusin)="pause()"
      (focusout)="resume()">
      @for (banner of banners(); track banner.key) {
        <div class="banner" [style.--banner-bg]="banner.bg" [style.--banner-fg]="banner.fg">
          <svg class="banner-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"
            stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path [attr.d]="banner.art" /></svg>
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
      @if (medicalOpen()) {
        @if (familyId(); as family) {
          @for (profile of [child]; track profile.id) {
            <app-medical-providers-section [familyId]="family" [childId]="profile.id" [children]="children()"
              (childSelected)="selectChild($event)" (back)="closeMedical()" />
          }
        }
      } @else {
      <div class="layout" [class.focused]="openSection() !== null">
        <div class="children" role="group" aria-label="Choose a child">
          @for (item of children(); track item.id) {
            <button type="button" [attr.aria-pressed]="child.id === item.id" (click)="selectChild(item.id)">
              <app-avatar [name]="item.firstName" [personId]="item.id" />
              <span class="child-name">{{ item.firstName }}</span>
              @if (updates.unopened(item.id)) {
                <span class="child-dot" aria-hidden="true"></span>
                <span class="visually-hidden">, has updates</span>
              }
              @if (child.id === item.id) {
                <app-icon class="child-check" name="check" [size]="20" />
              }
            </button>
          }
        </div>
        <section [attr.aria-labelledby]="openSection() ? 'section-heading' : 'essentials-heading'">
          <h2 id="essentials-heading">{{ child.firstName }}’s essentials</h2>
          @if (openSection() !== null) {
            <button type="button" class="back" (click)="closeSection()">
              <app-icon name="chevron-left" [size]="20" />
              All of {{ child.firstName }}’s essentials
            </button>
          }
          @if (familyId(); as family) {
            @for (profile of [child]; track profile.id) {
              <div class="section-tiles">
                @for (tile of tiles; track tile.section) {
                  <details #disclosure [attr.data-section]="tile.section" (toggle)="tileToggled($event, child.id, tile.section)"
                    [style.--tile-bg]="tile.bg" [style.--tile-fg]="tile.fg"
                    [style.--tile-dark-bg]="tile.darkBg" [style.--tile-dark-fg]="tile.darkFg">
                    <summary>
                      <img class="tile-art" [src]="'art/child-essentials/' + tile.image + '.webp'" alt="" />
                      <span class="tile-text">
                        <span class="tile-name">{{ tile.name }}</span><span class="visually-hidden">, </span>
                        <span class="tile-about">{{ tile.about }}</span>
                      </span>
                      @if (!disclosure.open && tileHasUpdate(child.id, tile.section)) {
                        <span class="child-dot" aria-hidden="true"></span>
                        <span class="visually-hidden">, updated</span>
                      }
                      <app-icon class="tile-chevron" name="chevron-right" [size]="22" />
                    </summary>
                    <div class="tile-content">
                      @if (openSection() === tile.section) {
                        <header class="section-hero">
                          <h2 id="section-heading" tabindex="-1">{{ tile.name }}</h2>
                          <img [src]="'art/child-essentials/' + tile.image + '.webp'" alt="" />
                        </header>
                      }
                      @switch (tile.section) {
                        @case ('school') { <app-school-section [familyId]="family" [childId]="profile.id" /> }
                        @case ('allergiesFood') { <app-allergies-food-section [familyId]="family" [childId]="profile.id" [children]="children()" /> }
                        @case ('routines') { <app-routines-section [familyId]="family" [childId]="profile.id" /> }
                        @case ('clothing') { <app-clothing-section [familyId]="family" [childId]="profile.id" /> }
                        @case ('whatHelps') { <app-what-helps-section [familyId]="family" [childId]="profile.id" /> }
                        @case ('caregivers') { <app-caregivers-section [familyId]="family" [childId]="profile.id" [children]="children()" /> }
                        @case ('emergencyContacts') { <app-emergency-contacts-section [familyId]="family" [childId]="profile.id" [children]="children()" /> }
                      }
                    </div>
                  </details>
                }
                <button type="button" #medicalTile class="medical-tile" (click)="openMedical(child.id)">
                  <span class="tile-text"><span class="tile-name">Medical</span>
                    <span class="tile-about">Doctors, dentists, and other providers</span>
                  </span>
                  @if (tileHasUpdate(child.id, 'medical')) {
                    <span class="child-dot" aria-hidden="true"></span>
                    <span class="visually-hidden">, updated</span>
                  }
                  <img class="tile-art" src="art/child-essentials/medical.webp" alt="" />
                  <app-icon class="tile-chevron" name="chevron-right" [size]="22" />
                </button>
              </div>
            }
          }
        </section>
      </div>
      }
    } @else {
      <p>No active child profiles yet.</p>
    }
  `,
  styles: `
    :host { display: block; }
    h1:focus { outline: none; }
    .layout { display: grid; gap: 1rem; align-content: start; }
    .layout > section { display: grid; gap: 0.75rem; align-content: start; min-width: 0; }
    h2 { margin: 0; }

    /* Children: side by side on phones, a column of cards beside the sections on wider screens. */
    .children { display: flex; flex-wrap: wrap; gap: 0.5rem; }
    .children button {
      flex: 1 1 8rem;
      display: flex;
      align-items: center;
      gap: 0.75rem;
      min-height: 52px;
      padding: 0.5rem 0.875rem;
      border: 1px solid var(--color-outline);
      border-radius: 1rem;
      background: var(--color-surface);
      color: var(--color-text);
      font: inherit;
      font-size: 1.0625rem;
      text-align: start;
      cursor: pointer;
    }
    .children button[aria-pressed='true'] {
      border-color: transparent;
      background: var(--color-selected, var(--color-surface-soft));
      font-weight: 700;
    }
    .child-name { flex: 1; min-width: 0; overflow-wrap: anywhere; }
    .child-check { color: var(--color-text); }

    /* Section tiles: tinted, with a title, what it holds, its illustration and a chevron. */
    .section-tiles { display: grid; gap: 0.75rem; align-items: start; }
    .section-tiles > details {
      min-width: 0;
      border-radius: 1rem;
      --essentials-tile-bg: light-dark(var(--tile-bg), var(--tile-dark-bg));
      --essentials-tile-fg: light-dark(var(--tile-fg), var(--tile-dark-fg));
      background: var(--essentials-tile-bg);
      color: var(--essentials-tile-fg);
      box-shadow: inset 0 0 0 1px color-mix(in srgb, currentColor 22%, transparent);
    }
    .section-tiles summary {
      display: flex;
      align-items: center;
      gap: 0.75rem;
      min-height: 5.25rem;
      padding: 0.5rem 0.75rem 0.5rem 1rem;
      border-radius: 1rem;
      cursor: pointer;
      list-style: none;
    }
    .medical-tile {
      display: flex; align-items: center; gap: 0.75rem; min-height: 5.25rem; width: 100%;
      padding: 0.5rem 0.75rem 0.5rem 1rem; border: 1px solid var(--color-outline);
      border-radius: 1rem; background: var(--color-surface-soft); color: var(--color-text);
      text-align: start; font: inherit; cursor: pointer;
    }
    summary::-webkit-details-marker { display: none; }
    summary:focus-visible { outline: 3px solid var(--color-focus); outline-offset: 2px; }
    .tile-text { display: grid; gap: 0.125rem; flex: 1; min-width: 0; }
    .tile-name { font-size: 1.25rem; font-weight: 700; line-height: 1.25; overflow-wrap: anywhere; }
    .tile-about { font-size: 0.875rem; line-height: 1.35; }
    .tile-art { order: 1; flex: none; width: 5.5rem; height: 4.25rem; object-fit: contain; }
    .tile-chevron { order: 2; flex: none; }
    summary .child-dot { order: 1; margin-inline-start: 0; background: currentColor; }

    .back {
      display: inline-flex;
      align-items: center;
      gap: 0.25rem;
      justify-self: start;
      min-height: 44px;
      padding: 0.25rem 0.5rem 0.25rem 0.25rem;
      border: 0;
      border-radius: 0.5rem;
      background: transparent;
      color: var(--color-text);
      font: inherit;
      font-weight: 600;
      cursor: pointer;
    }

    .banners { display: grid; gap: 0.5rem; }
    .banner:last-child { margin-block-end: 1rem; }
    .banner {
      display: flex;
      align-items: center;
      gap: 0.75rem;
      min-height: 3.25rem;
      padding: 0.25rem 0.25rem 0.25rem 1rem;
      border: 1px solid color-mix(in srgb, var(--banner-fg) 35%, transparent);
      border-radius: 1rem;
      background: var(--banner-bg);
      color: var(--banner-fg);
    }
    .banner p { flex: 1; margin: 0; font-size: 1.0625rem; font-weight: 600; overflow-wrap: anywhere; }
    .banner-icon { flex: none; width: 1.75rem; height: 1.75rem; }
    .child-dot { flex: none; width: 0.625rem; height: 0.625rem; border-radius: 50%; background: var(--color-action); }
    .banner .dismiss {
      display: inline-grid;
      place-items: center;
      flex: none;
      width: 44px;
      min-height: 44px;
      padding: 0;
      border: 0;
      border-radius: 0.75rem;
      background: transparent;
      color: inherit;
      cursor: pointer;
    }
    button:focus-visible { outline: 3px solid var(--color-focus); outline-offset: 2px; }

    .section-hero {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 0.75rem;
      min-block-size: 6rem;
      margin-block-end: 0.75rem;
      padding: 0.75rem 1rem;
      border-radius: 1rem;
      background: var(--essentials-tile-bg);
      color: var(--essentials-tile-fg);
    }
    .section-hero h2 {
      min-inline-size: 0;
      font: 700 clamp(1.5rem, 5vw, 2rem) Georgia, serif;
      overflow-wrap: anywhere;
    }
    .section-hero img { inline-size: min(38%, 10rem); block-size: auto; }

    .layout.focused { grid-template-columns: minmax(0, 1fr); }
    .focused .children,
    .focused #essentials-heading,
    .focused .medical-tile,
    .focused details:not([open]),
    .focused details[open] > summary { display: none; }
    .focused details[open] { background: transparent; color: var(--color-text); box-shadow: none; }
    .section-hero h2:focus-visible { outline: 3px solid var(--color-focus); outline-offset: 3px; }

    @media (min-width: 48rem) {
      .layout { grid-template-columns: minmax(11rem, 14rem) minmax(0, 1fr); }
      .children { flex-direction: column; flex-wrap: nowrap; }
      .children button { flex: none; min-height: 64px; }
      h2 { font-size: 1.75rem; }
      .section-hero { min-block-size: 7rem; }
      .section-hero img { inline-size: min(32%, 11rem); max-block-size: 6rem; object-fit: contain; }
    }
    .layout > section { container-type: inline-size; }
    @container (min-width: 46rem) {
      .section-tiles { grid-template-columns: repeat(2, minmax(0, 1fr)); }
      .focused .section-tiles { grid-template-columns: minmax(0, 1fr); }
      .section-tiles summary { min-height: 6rem; gap: 1rem; padding-inline-start: 0.75rem; }
      .tile-art { order: -1; width: 7rem; height: 5rem; }
      .tile-name { font-size: 1.375rem; }
    }
    @media (forced-colors: active) {
      .section-tiles > details, .banner { border: 1px solid CanvasText; }
    }
  `,
})
export class ChildEssentialsPage {
  private readonly api = inject(Api);
  private readonly auth = inject(AuthStore);
  protected readonly updates = inject(EssentialsUpdatesStore);
  private readonly injector = inject(Injector);
  private readonly heading = viewChild.required<ElementRef<HTMLElement>>('heading');
  private readonly disclosures = viewChildren<ElementRef<HTMLDetailsElement>>('disclosure');
  protected readonly medicalOpen = signal(false);
  private readonly medicalTile = viewChild<ElementRef<HTMLButtonElement>>('medicalTile');

  protected closeMedical(): void {
    this.medicalOpen.set(false);
    afterNextRender({ read: () => this.medicalTile()?.nativeElement.focus() }, { injector: this.injector });
  }

  protected readonly openSection = signal<EssentialsSectionId | null>(null);
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
    { section: 'school', name: ESSENTIALS_SECTIONS.school.name, image: 'school', about: 'Grade, teacher, parent concerns', art: 'M3 11l9-7 9 7M5 10v10h14V10M10 20v-6h4v6M12 7v3',
      bg: '#e1edf9', fg: '#233f63', darkBg: '#263b54', darkFg: '#dbeaff' },
    { section: 'allergiesFood', name: ESSENTIALS_SECTIONS.allergiesFood.name, image: 'allergies', about: 'Allergies and food preferences', art: 'M3 13h18c-1 5-4 7-9 7s-8-2-9-7zM12 12c0-5 3-8 8-8-1 5-4 8-8 8z',
      bg: '#faedc5', fg: '#614718', darkBg: '#493b24', darkFg: '#fff0c7' },
    { section: 'routines', name: ESSENTIALS_SECTIONS.routines.name, image: 'routines', about: 'Bedtime and naps, shared and at each home', art: 'M20 15.5A8 8 0 0 1 8.5 4 8.5 8.5 0 1 0 20 15.5zM17 4v6m-3-3h6',
      bg: '#e0ebdb', fg: '#344f36', darkBg: '#2c4230', darkFg: '#dfefd9' },
    { section: 'clothing', name: ESSENTIALS_SECTIONS.clothing.name, image: 'clothing', about: 'Sizes and fit notes', art: 'M9 4 4 6l-2 5 4 2 2-3v10h8V10l2 3 4-2-2-5-5-2c-1 4-5 4-6 0z',
      bg: '#ebe3fa', fg: '#4f386d', darkBg: '#403451', darkFg: '#f1e5ff' },
    { section: 'whatHelps', name: ESSENTIALS_SECTIONS.whatHelps.name, image: 'what-helps', about: 'Comfort items and calming strategies', art: 'M12 20S3 15 3 9a4 4 0 0 1 9-1 4 4 0 0 1 9 1c0 6-9 11-9 11z',
      bg: '#f8e2d4', fg: '#643d2b', darkBg: '#50382f', darkFg: '#ffe9de' },
    { section: 'caregivers', name: ESSENTIALS_SECTIONS.caregivers.name, image: 'caregivers', about: 'Sitters and helpers, school pickup', art: 'M8 10a3 3 0 1 0 0-6 3 3 0 0 0 0 6zm8 1a3 3 0 1 0 0-6M2 20v-2a6 6 0 0 1 12 0v2m2-6a5 5 0 0 1 6 5v1',
      bg: '#dcefeb', fg: '#24534c', darkBg: '#254542', darkFg: '#def7f1' },
    { section: 'emergencyContacts', name: ESSENTIALS_SECTIONS.emergencyContacts.name, image: 'emergency', about: 'Who to call, and who first', art: 'M5 3h4l2 5-3 2c1 3 3 5 6 6l2-3 5 2v4c0 2-2 3-4 2C9 19 5 15 3 7c-1-2 0-4 2-4z',
      bg: '#f7e0e8', fg: '#66384a', darkBg: '#503342', darkFg: '#ffe6ef' },
  ] as const;

  private bannerTint(section: EssentialsSectionId): Pick<ShownBanner, 'bg' | 'fg' | 'art'> {
    const tile = this.tiles.find((item) => item.section === (section === 'householdRoutines' ? 'routines' : section))
      ?? MEDICAL_TINT;
    return {
      bg: `light-dark(${tile.bg}, ${tile.darkBg})`,
      fg: `light-dark(${tile.fg}, ${tile.darkFg})`,
      art: tile.art,
    };
  }

  /** Opens Medical; like opening any section, it clears that section's dot. */
  protected openMedical(childId: string): void {
    this.medicalOpen.set(true);
    this.updates.sectionOpened(childId, 'medical');
  }

  protected tileHasUpdate(childId: string, section: EssentialsSectionId): boolean {
    return this.updates.unopened(childId, section) ||
      (section === 'routines' && this.updates.unopened(childId, 'householdRoutines'));
  }

  protected tileToggled(event: Event, childId: string, section: EssentialsSectionId): void {
    const tile = event.currentTarget as HTMLDetailsElement;
    if (tile.open) {
      this.updates.sectionOpened(childId, section);
      for (const other of this.disclosures()) {
        if (other.nativeElement !== tile) other.nativeElement.open = false;
      }
      this.openSection.set(section);
      afterNextRender({ read: () => {
        if (this.openSection() === section) tile.querySelector<HTMLElement>('.section-hero h2')?.focus();
      } }, { injector: this.injector });
    } else if (this.openSection() === section) {
      this.openSection.set(null);
    }
  }

  /** Back to all of the child's sections; focus returns to the one that was open. */
  protected closeSection(): void {
    const section = this.openSection();
    const open = this.disclosures().find((tile) => tile.nativeElement.dataset['section'] === section)?.nativeElement;
    this.openSection.set(null);
    if (!open) return;
    open.open = false;
    // After the page shows every section again: a hidden summary can't take focus.
    afterNextRender({ read: () => open.querySelector('summary')?.focus() }, { injector: this.injector });
  }

  protected selectChild(id: string): void {
    this.openSection.set(null);
    this.selectedId.set(id);
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
