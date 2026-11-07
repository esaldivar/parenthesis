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
};

/** "Kai’s shoe size updated" for one field, otherwise "Kai’s Clothing & Shoes updated". Never a value. */
export function bannerText(childName: string, banner: EssentialsBanner): string {
  const section = ESSENTIALS_SECTIONS[banner.section];
  const field = banner.fields.length === 1 ? section?.fields[banner.fields[0]] : undefined;
  return `${childName}’s ${field ?? section?.name ?? 'Child Essentials'} updated`;
}

/**
 * Emits once, the first time its element is on screen (half of it, or all of a tall one). Without
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
          if (entries.some((e) => e.isIntersecting)) {
            observer.disconnect();
            this.appOnScreen.emit();
          }
        },
        { threshold: 0.5 },
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
