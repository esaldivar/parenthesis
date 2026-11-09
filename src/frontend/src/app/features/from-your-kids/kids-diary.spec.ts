import { TestBed } from '@angular/core/testing';
import { KidsDiary } from './kids-diary';
import { KidsDiaryEntry } from './from-your-kids-contract';

describe('KidsDiary (#531)', () => {
  const entry = (id: string, createdAt: string): KidsDiaryEntry => ({
    id, createdAt, childId: 'child-1', kind: 'Diary',
    visibleToViewer: true, body: 'A shared story', title: null, mood: 'Happy',
  });

  it('renders an honest empty diary without parent authoring controls', () => {
    const fixture = TestBed.createComponent(KidsDiary);
    fixture.detectChanges();
    const host = fixture.nativeElement as HTMLElement;
    expect(host.textContent).toContain('No diary entries shared with you yet');
    expect(host.querySelector('textarea')).toBeNull();
  });

  it('shows newest entry first and allows accessible page turns', () => {
    const fixture = TestBed.createComponent(KidsDiary);
    fixture.componentRef.setInput('entries', [
      entry('older', '2026-10-01T00:00:00Z'),
      entry('newer', '2026-11-01T00:00:00Z'),
    ]);
    fixture.detectChanges();
    const host = fixture.nativeElement as HTMLElement;
    expect(host.querySelector('article time')?.getAttribute('datetime')).toBe('2026-11-01T00:00:00Z');
    host.querySelector<HTMLButtonElement>('[aria-label="Next diary page"]')!.click();
    fixture.detectChanges();
    expect(host.querySelector('article time')?.getAttribute('datetime')).toBe('2026-10-01T00:00:00Z');
    expect(host.textContent).toContain('Page 2 of 2');
  });
});
