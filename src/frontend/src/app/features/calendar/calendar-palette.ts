import { Directive, computed, input } from '@angular/core';
import { FamilyMember } from '../../core/api/api';

export type CalendarPaletteKey = 'parent-a' | 'parent-b' | 'parenting' | 'activity' | 'family' | 'task' | 'reminder' | 'unavailable' | 'concealed';

/** The founder's membership and family share one persisted timestamp. Never use viewer identity or a name.
 * The later parent retains B even after the founder leaves. Legacy fixtures without family metadata use stable
 * joinedAt/ID ordering, never caller array order. No storage, permissions or API payloads change.
 */
export function parentPalette(id: string | null, members: readonly FamilyMember[], createdAt?: string): CalendarPaletteKey {
  const member = members.find(m => m.membershipId === id && m.role === 'Parent');
  if (!member) return 'parenting'; // Historical/unknown caregiver: no invented identity.
  if (createdAt) return Date.parse(member.joinedAt) === Date.parse(createdAt) ? 'parent-a' : 'parent-b';
  const parents = members.filter(m => m.role === 'Parent').sort((a, b) =>
    Date.parse(a.joinedAt) - Date.parse(b.joinedAt) || a.membershipId.localeCompare(b.membershipId));
  return parents[0]?.membershipId === id ? 'parent-a' : 'parent-b';
}

/** Apply the shared category pairing to a small, already laid-out item, never an entire form or dialog.
 * Inline color properties win over legacy per-view fills; proposal hatching/borders remain independent.
 */
@Directive({
  selector: '[appCalendarPalette]',
  host: {
    '[attr.data-palette]': 'key()',
    '[style.background-color]': 'background()',
    '[style.color]': 'foreground()',
    '[style.--color-text]': 'foreground()',
    '[style.--color-text-secondary]': 'foreground()',
    '[style.--color-calendar-label]': 'foreground()',
    '[style.border-color]': 'foreground()',
    '[style.background-image]': 'hatch()',
  },
})
export class CalendarPalette {
  readonly appCalendarPalette = input<string | undefined>();
  protected readonly key = computed(() => {
    const key = this.appCalendarPalette();
    return key === 'event' ? 'family' : key === 'review' || !key ? undefined : key;
  });
  protected readonly background = computed(() => this.key() === 'concealed' ? 'transparent' : this.key() ? `var(--color-calendar-${this.key()}-bg)` : null);
  protected readonly foreground = computed(() => this.key() === 'concealed' ? 'var(--color-disabled-text)' : this.key() ? `var(--color-calendar-${this.key()}-fg)` : null);
  protected readonly hatch = computed(() => this.key() === 'unavailable'
    ? 'repeating-linear-gradient(-45deg, transparent 0 7px, color-mix(in srgb, currentColor 12%, transparent) 7px 9px)'
    : null);
}
