import {
  DestroyRef, Directive, ElementRef, Signal, afterNextRender, computed, effect, inject, output, signal, untracked,
} from '@angular/core';
import { EssentialsBanner, EssentialsSectionId } from '../../core/api/api';
import { EssentialsUpdatesStore } from '../../core/essentials/essentials-updates.store';

/** Each shared section's name, tint (its banner matches it) and the label of each field a notice can name. */
export const ESSENTIALS_SECTIONS: Record<
  EssentialsSectionId,
  { readonly name: string; readonly bg: string; readonly fg: string; readonly fields: Readonly<Record<string, string>> }
> = {
  school: {
    name: 'School',
    bg: 'var(--color-calendar-family-bg)',
    fg: 'var(--color-calendar-family-fg)',
    fields: { grade: 'grade', homeroomTeacher: 'homeroom teacher', parentConcerns: 'parent concerns' },
  },
  allergiesFood: {
    name: 'Allergies & Food',
    bg: 'var(--color-calendar-family-bg)',
    fg: 'var(--color-calendar-family-fg)',
    fields: { allergies: 'allergies', noKnownAllergies: 'allergy status', foodPreferences: 'food preferences' },
  },
  clothing: {
    name: 'Clothing & Shoes',
    bg: 'var(--color-calendar-task-bg)',
    fg: 'var(--color-calendar-task-fg)',
    fields: { topSize: 'top size', bottomSize: 'bottom size', shoeSize: 'shoe size', fitNotes: 'fit notes' },
  },
  whatHelps: {
    name: 'What Helps',
    bg: 'var(--color-calendar-family-bg)',
    fg: 'var(--color-calendar-family-fg)',
    fields: { comfortItems: 'comfort items', calmingStrategies: 'calming strategies' },
  },
  routines: {
    name: 'Routines',
    bg: 'var(--color-calendar-family-bg)',
    fg: 'var(--color-calendar-family-fg)',
    fields: { bedtime: 'shared bedtime', naps: 'shared naps' },
  },
  // The co-parent's own routines at their home: their Routines tab.
  householdRoutines: {
    name: 'routines at your co-parent’s home',
    bg: 'var(--color-calendar-family-bg)',
    fg: 'var(--color-calendar-family-fg)',
    fields: { bedtime: 'bedtime at your co-parent’s home', naps: 'naps at your co-parent’s home' },
  },
  // Entries are named by position or id, never by their details, so the banner names the section.
  emergencyContacts: {
    name: 'Emergency Contacts',
    bg: 'var(--color-surface-soft)',
    fg: 'var(--color-text)',
    fields: {},
  },
  caregivers: {
    name: 'Shared Caregivers',
    bg: 'var(--color-surface-soft)',
    fg: 'var(--color-text)',
    fields: {},
  },
};

/** "Kai’s shoe size updated" for one field, otherwise "Kai’s Clothing & Shoes updated". Never a value. */
export function bannerText(childName: string, banner: EssentialsBanner): string {
  const section = ESSENTIALS_SECTIONS[banner.section];
  const field = banner.fields.length === 1 ? section?.fields[banner.fields[0]] : undefined;
  return `${childName}’s ${field ?? section?.name ?? 'Child Essentials'} updated`;
}

/** Half the element is on screen, or, for one taller than the screen, it fills at least half the screen. */
function seen(entry: IntersectionObserverEntry): boolean {
  if (!entry.isIntersecting) return false;
  const screen = entry.rootBounds?.height ?? 0;
  return entry.intersectionRatio >= 0.5 || (screen > 0 && entry.intersectionRect.height >= screen / 2);
}

/**
 * Emits once, the first time its element is on screen (half of it, or half the screen for a tall one). Without
 * IntersectionObserver (old browsers, tests) it never emits, so nothing is cleared that wasn't seen.
 */
@Directive({ selector: '[appOnScreen]' })
export class OnScreen {
  readonly appOnScreen = output<void>();

  constructor() {
    const element = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
    const destroyRef = inject(DestroyRef);
    afterNextRender(() => {
      if (typeof IntersectionObserver === 'undefined') return;
      const observer = new IntersectionObserver(
        (entries) => {
          if (entries.some(seen)) {
            observer.disconnect();
            this.appOnScreen.emit();
          }
        },
        // Fine steps, so an element taller than the screen is noticed as it fills it, not only at half of itself.
        { threshold: [0, 0.25, 0.5, 0.75, 1] },
      );
      observer.observe(element);
      destroyRef.onDestroy(() => observer.disconnect());
    });
  }
}

/**
 * A section's update marks for one child. The dot and each changed row's highlight stay for this visit once shown,
 * even after the server has been told they were seen, so they don't vanish under the parent's eyes; the next visit
 * won't show them. A row can cover several fields (Allergies and notes covers the allergy status too).
 */
export function sectionUpdates(section: EssentialsSectionId, childId: Signal<string>) {
  const store = inject(EssentialsUpdatesStore);
  const dot = signal(false);
  const highlighted = signal<ReadonlySet<string>>(new Set());
  let visit = '';
  effect(() => {
    const child = childId();
    const unopened = store.unopened(child, section);
    const rows = store.rows(child, section);
    untracked(() => {
      // A new child is a new visit.
      if (child !== visit) {
        visit = child;
        dot.set(false);
        highlighted.set(new Set());
      }
      if (unopened) dot.set(true);
      if (rows.some((row) => !highlighted().has(row))) highlighted.set(new Set([...highlighted(), ...rows]));
    });
  });
  return {
    dot: computed(() => dot()),
    updated: (...fields: string[]) => fields.some((field) => highlighted().has(field)),
    sectionOnScreen: () => store.sectionOpened(childId(), section),
    rowOnScreen: (...fields: string[]) => store.rowsSeen(childId(), section, fields),
  };
}

export type SectionUpdates = ReturnType<typeof sectionUpdates>;
