import { Directive, computed, input } from '@angular/core';
import { FamilyMember } from '../../core/api/api';

export type CalendarPaletteKey = 'parent-a' | 'parent-b' | 'parenting' | 'activity' | 'family' | 'task' | 'reminder' | 'unavailable' | 'concealed' | 'event' | 'review';

/** Parent identity comes only from the persisted membership slot. Missing metadata is neutral,
 * never inferred from timestamps, viewer, names or the remaining roster.
 */
export function parentPalette(id: string | null, members: readonly FamilyMember[]): CalendarPaletteKey {
  const member = members.find(m => m.membershipId === id && m.role === 'Parent');
  return member?.paletteSlot === 0 ? 'parent-a' : member?.paletteSlot === 1 ? 'parent-b' : 'parenting';
}

/** Event aliases family for the generic Add chooser; review leaves the surface unchanged.
 * Apply the shared category pairing to a small, already laid-out item, never an entire form or dialog.
 * Inline color properties win over legacy per-view fills; proposal hatching/borders remain independent.
 */
@Directive({
  selector: '[appCalendarPalette]',
  host: {
    '[attr.data-palette]': 'key()',
    '[style.background-color]': 'fill()',
    '[style.--calendar-palette-bg]': 'background()',
    '[style.color]': 'foreground()',
    '[style.--color-text]': 'foreground()',
    '[style.--color-text-secondary]': 'foreground()',
    '[style.--color-calendar-label]': 'foreground()',
    '[style.background-image]': 'hatch()',
  },
})
export class CalendarPalette {
  readonly appCalendarPalette = input<CalendarPaletteKey | undefined>();
  protected readonly key = computed(() => {
    const key = this.appCalendarPalette();
    return key === 'event' ? 'family' : key === 'review' || !key ? undefined : key;
  });
  protected readonly background = computed(() => this.key() === 'concealed' ? 'transparent' : this.key() ? `var(--color-calendar-${this.key()}-bg)` : null);
  protected readonly fill = computed(() => this.key() ? 'var(--calendar-palette-fill, var(--calendar-palette-bg))' : null);
  protected readonly foreground = computed(() => this.key() === 'concealed' ? 'var(--color-disabled-text)' : this.key() ? `var(--color-calendar-${this.key()}-fg)` : null);
  protected readonly hatch = computed(() => this.key() === 'unavailable'
    ? 'repeating-linear-gradient(-45deg, transparent 0 7px, color-mix(in srgb, currentColor 12%, transparent) 7px 9px)'
    : null);
}
