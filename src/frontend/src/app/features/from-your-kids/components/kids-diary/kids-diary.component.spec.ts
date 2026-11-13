import { TestBed } from '@angular/core/testing';
import { KidsDiary } from './kids-diary.component';
import { KidsDiaryEntry } from '../../from-your-kids-contract';

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
    expect(host.querySelector('.mood img')?.getAttribute('src')).toBe('/art/from-your-kids/journal-sun.webp');
    const book = host.querySelector('.book')!;
    const swipe = (type: string, clientX: number) => {
      const event = new Event(type);
      Object.defineProperty(event, 'changedTouches', { value: [{ clientX }] });
      book.dispatchEvent(event);
    };
    swipe('touchstart', 100);
    swipe('touchend', 110);
    fixture.detectChanges();
    expect(host.textContent).toContain('Page 2 of 2');
    swipe('touchstart', 100);
    swipe('touchend', 180);
    fixture.detectChanges();
    expect(host.textContent).toContain('Page 1 of 2');
  });

  it('opens a selected entry with its mood and returns to the diary index', async () => {
    const fixture = TestBed.createComponent(KidsDiary);
    fixture.componentRef.setInput('entries', [
      entry('newer', '2026-11-01T00:00:00Z'),
      { ...entry('older', '2026-10-01T00:00:00Z'), title: 'Older entry', mood: 'Proud' },
    ]);
    fixture.autoDetectChanges();
    const host = fixture.nativeElement as HTMLElement;
    const choice = host.querySelectorAll<HTMLButtonElement>('.entry-choice')[1];
    const back = host.querySelector<HTMLButtonElement>('.back-to-entries')!;

    choice.focus();
    choice.click();
    await fixture.whenStable();
    expect(host.querySelector('article h3')?.textContent).toBe('Older entry');
    expect(host.querySelector('.mood span')?.textContent).toBeTruthy();
    expect(host.querySelector('.mood')?.textContent).toContain('Proud');
    expect(host.querySelector('.book')?.classList.contains('reading')).toBe(true);

    back.click();
    await fixture.whenStable();
    expect(host.querySelector('.book')?.classList.contains('reading')).toBe(false);
    expect(choice.getAttribute('aria-current')).toBe('page');
  });
});
