import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { FamilyMember } from '../../core/api/api';
import { CalendarPalette, parentPalette } from './calendar-palette';

const createdAt = '2026-10-01T12:00:00Z';
const founder: FamilyMember = { membershipId: 'founder', displayName: 'Alex', role: 'Parent', joinedAt: createdAt, paletteSlot: 0, isYou: true };
const invited: FamilyMember = { membershipId: 'invited', displayName: 'Sam', role: 'Parent', joinedAt: '2026-10-02T12:00:00Z', paletteSlot: 1, isYou: false };

describe('Calendar parent color identity', () => {
  it('keeps distinct slots when the viewer, display names and roster order change', () => {
    const original = [founder, invited];
    const otherViewer = [{ ...invited, isYou: true, displayName: 'Renamed' }, { ...founder, isYou: false }];
    for (const members of [original, otherViewer]) {
      expect(parentPalette('founder', members)).toBe('parent-a');
      expect(parentPalette('invited', members)).toBe('parent-b');
    }
  });
  it('does not recolor the invited parent when the founder leaves', () => {
    expect(parentPalette('invited', [invited])).toBe('parent-b');
    expect(parentPalette('founder', [founder])).toBe('parent-a');
  });
  it('keeps the remaining parent B and a replacement A regardless of timestamps or viewer', () => {
    const replacement: FamilyMember = { ...founder, membershipId: 'replacement', joinedAt: '2026-10-26T00:00:00Z' };
    expect(parentPalette('invited', [replacement, invited])).toBe('parent-b');
    expect(parentPalette('replacement', [invited, replacement])).toBe('parent-a');
    expect(parentPalette('invited', [{ ...invited, paletteSlot: undefined }])).toBe('parenting');
  });
  it('does not invent a parent identity for an unknown historical caregiver', () => {
    expect(parentPalette('departed', [invited])).toBe('parenting');
  });
});

@Component({ imports: [CalendarPalette], template: '<button [appCalendarPalette]="kind()">Synthetic category</button>' })
class PaletteHost { kind = signal('event'); }

describe('Shared category surfaces', () => {
  it('maps only the generic Event chooser to family and clears unavailable hatching when the kind changes', async () => {
    const fixture = TestBed.createComponent(PaletteHost);
    fixture.detectChanges();
    await fixture.whenStable();
    const button = fixture.nativeElement.querySelector('button') as HTMLButtonElement;
    expect(button.dataset['palette']).toBe('family');
    expect(button.style.borderColor).toBe('');
    for (const kind of ['task', 'reminder', 'activity', 'parent-a', 'parent-b']) {
      fixture.componentInstance.kind.set(kind);
      fixture.detectChanges();
      expect(button.dataset['palette']).toBe(kind);
      expect(button.style.backgroundColor).toBe(`var(--color-calendar-${kind}-bg)`);
      expect(button.style.color).toBe(`var(--color-calendar-${kind}-fg)`);
    }
    fixture.componentInstance.kind.set('unavailable');
    fixture.detectChanges();
    expect(button.style.backgroundImage).toContain('repeating-linear-gradient');
    fixture.componentInstance.kind.set('task');
    fixture.detectChanges();
    expect(button.style.backgroundImage).toBe('');
    fixture.componentInstance.kind.set('concealed');
    fixture.detectChanges();
    expect(button.style.backgroundColor).toBe('transparent');
  });
});
