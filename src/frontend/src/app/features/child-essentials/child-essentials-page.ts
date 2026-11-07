import { ChangeDetectionStrategy, Component, computed, effect, inject, signal } from '@angular/core';
import { Api, Child } from '../../core/api/api';
import { AuthStore } from '../../core/auth/auth.store';
import { Avatar } from '../../shared/avatar/avatar';

import { AllergiesFoodSection } from './allergies-food-section';
import { ClothingSection } from './clothing-section';
import { RoutinesSection } from './routines-section';
import { SchoolSection } from './school-section';
import { WhatHelpsSection } from './what-helps-section';

@Component({
  selector: 'app-child-essentials-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Avatar, AllergiesFoodSection, ClothingSection, RoutinesSection, SchoolSection, WhatHelpsSection],
  template: `
    <h1>Child Essentials</h1>
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
            </button>
          }
        </div>
        <section aria-labelledby="essentials-heading">
          <h2 id="essentials-heading">{{ child.firstName }}’s essentials</h2>
          @if (familyId(); as family) {
            @for (profile of [child]; track profile.id) {
              <app-school-section [familyId]="family" [childId]="profile.id" />
              <app-allergies-food-section [familyId]="family" [childId]="profile.id" />
              <app-routines-section [familyId]="family" [childId]="profile.id" />
              <app-clothing-section [familyId]="family" [childId]="profile.id" />
              <app-what-helps-section [familyId]="family" [childId]="profile.id" />
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

  constructor() {
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
