import {
  DestroyRef, Directive, ElementRef, Signal, afterNextRender, effect, inject, output, signal, untracked,
} from '@angular/core';
import { EssentialsBanner, EssentialsSectionId } from '../../core/api/api';
import { EssentialsUpdatesStore } from '../../core/essentials/essentials-updates.store';

/** Each shared section's name and the label of each field a notice can name. */
export const ESSENTIALS_SECTIONS: Record<
  EssentialsSectionId,
  { readonly name: string; readonly fields: Readonly<Record<string, string>> }
> = {
  school: {
    name: 'School',
    fields: { grade: 'grade', homeroomTeacher: 'homeroom teacher', parentConcerns: 'parent concerns' },
  },
  allergiesFood: {
    name: 'Allergies & Food',
    fields: { allergies: 'allergies', noKnownAllergies: 'allergy status', foodPreferences: 'food preferences' },
  },
  clothing: {
    name: 'Clothing & Shoes',
    fields: { topSize: 'top size', bottomSize: 'bottom size', shoeSize: 'shoe size', fitNotes: 'fit notes' },
  },
  whatHelps: {
    name: 'What Helps',
    fields: { comfortItems: 'comfort items', calmingStrategies: 'calming strategies' },
  },
  routines: {
    name: 'Routines',
    fields: { bedtime: 'shared bedtime', naps: 'shared naps' },
  },
  // The co-parent's own routines at their home: their Routines tab.
  householdRoutines: {
    name: 'routines at your co-parent’s home',
    fields: { bedtime: 'bedtime at your co-parent’s home', naps: 'naps at your co-parent’s home' },
  },
  // Entries are named by position or id, never by their details, so the banner names the section.
  emergencyContacts: {
    name: 'Emergency Contacts',
    fields: {},
  },
  caregivers: {
    name: 'Shared Caregivers',
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
 * A section's changed row highlights stay for this visit once shown,
 * even after the server has been told they were seen, so they don't vanish under the parent's eyes; the next visit
 * won't show them. A row can cover several fields (Allergies and notes covers the allergy status too).
 */
export function sectionUpdates(section: EssentialsSectionId, childId: Signal<string>) {
  const store = inject(EssentialsUpdatesStore);
  const highlighted = signal<ReadonlySet<string>>(new Set());
  let visit = '';
  effect(() => {
    const child = childId();
    const rows = store.rows(child, section);
    untracked(() => {
      // A new child is a new visit.
      if (child !== visit) {
        visit = child;
        highlighted.set(new Set());
      }
      if (rows.some((row) => !highlighted().has(row))) highlighted.set(new Set([...highlighted(), ...rows]));
    });
  });
  return {
    updated: (...fields: string[]) => fields.some((field) => highlighted().has(field)),
    rowOnScreen: (...fields: string[]) => store.rowsSeen(childId(), section, fields),
  };
}

export type SectionUpdates = ReturnType<typeof sectionUpdates>;
