import { vi } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { KidsDiary } from './kids-diary.component';
import { KidsDiaryEntry } from '../../from-your-kids-contract';
import { LocaleService } from '../../../../core/i18n/locale.service';

const entry = (day: number): KidsDiaryEntry => ({
  id: `entry-${day}`,
  createdAt: `2026-11-${String(day).padStart(2, '0')}T14:15:00Z`,
  childId: 'child-1',
  kind: 'Diary',
  visibleToViewer: true,
  body: `Shared story ${day}`,
  title: `Title ${day}`,
  mood: 'Happy',
});

describe('KidsDiary approved design (#712)', () => {
  const open = (entries: KidsDiaryEntry[] = []) => {
    const fixture = TestBed.createComponent(KidsDiary);
    fixture.componentRef.setInput('entries', entries);
    fixture.detectChanges();
    return { fixture, host: fixture.nativeElement as HTMLElement };
  };
  const click = (host: HTMLElement, label: string) =>
    host.querySelector<HTMLButtonElement>(`[aria-label="${label}"]`)!.click();
  const titles = (host: HTMLElement) =>
    [...host.querySelectorAll('.desktop-book h3')].map((n) => n.textContent?.trim());

  it('keeps the empty artwork blank and offers no authoring or reaction controls', () => {
    const { host } = open();
    expect(host.querySelector('[role="img"]')?.getAttribute('aria-label')).toBe('Empty diary');
    expect(host.querySelector('h3, button, textarea, .mood, img')).toBeNull();
    expect(host.textContent).toContain('No diary entries shared with you yet');
  });

  it('orders newest first in pairs and hides unavailable paging controls', async () => {
    const { fixture, host } = open([entry(1), entry(5), entry(3), entry(4), entry(2)]);
    expect(titles(host)).toEqual(['Title 5', 'Title 4']);
    expect(host.querySelector('[aria-label="Newer diary entries"]')).toBeNull();
    expect(host.querySelector('.newer-controls button')).toBeNull();
    click(host, 'Older diary entries');
    fixture.detectChanges();
    await fixture.whenStable();
    expect(titles(host)).toEqual(['Title 3', 'Title 2']);
    expect(host.querySelector('[role="status"]')?.textContent).toContain('Page 2 of 3');
    expect(document.activeElement).toBe(host.querySelector('.desktop-book .paper'));
    click(host, 'Older diary entries');
    fixture.detectChanges();
    expect(titles(host)).toEqual(['Title 1']);
    expect(host.querySelector('[aria-label="Older diary entries"]')).toBeNull();
    click(host, 'Newer diary entries');
    fixture.detectChanges();
    expect(titles(host)).toEqual(['Title 3', 'Title 2']);
    click(host, 'Return to newest diary entry');
    fixture.detectChanges();
    expect(titles(host)).toEqual(['Title 5', 'Title 4']);
    expect(host.querySelector('.newer-controls button')).toBeNull();
  });

  it('renders separate alternating mobile sheets in newest-first order with date only', () => {
    const { host } = open([entry(1), entry(3), entry(2)]);
    const sheets = [...host.querySelectorAll('.diary-sheet')];
    expect(sheets.map((n) => n.querySelector('h3')?.textContent)).toEqual([
      'Title 3',
      'Title 2',
      'Title 1',
    ]);
    expect(sheets.map((n) => n.classList.contains('right-sheet'))).toEqual([false, true, false]);
    expect(sheets[0].querySelector('time')?.textContent).toContain('November 3, 2026');
    expect(sheets[0].querySelector('time')?.textContent).not.toMatch(/AM|PM|14:15/);
    expect(host.querySelector('textarea, .mood')).toBeNull();
  });

  it('resets the spread and animation when changing child or data, including an empty diary', () => {
    const { fixture, host } = open([entry(5), entry(4), entry(3)]);
    click(host, 'Older diary entries');
    fixture.detectChanges();
    expect(titles(host)).toEqual(['Title 3']);
    fixture.componentRef.setInput('scope', 'another-child');
    fixture.detectChanges();
    expect(titles(host)).toEqual(['Title 5', 'Title 4']);
    expect(host.querySelector('.turning-sheet')).toBeNull();
    fixture.componentRef.setInput('entries', []);
    fixture.detectChanges();
    expect(host.querySelector('.empty-book')).not.toBeNull();
    expect(host.querySelector('.back-to-newest, .desktop-book')).toBeNull();
  });

  it('changes page-turn direction', async () => {
    const { fixture, host } = open([entry(5), entry(4), entry(3)]);
    click(host, 'Older diary entries');
    fixture.detectChanges();
    await fixture.whenStable();
    expect(host.querySelector('.turning-sheet')).not.toBeNull();
    expect(host.querySelector('.turning-sheet')?.classList.contains('to-newer')).toBe(false);
    click(host, 'Newer diary entries');
    fixture.detectChanges();
    await fixture.whenStable();
    expect(host.querySelector('.turning-sheet')?.classList.contains('to-newer')).toBe(true);
  });

  it('has no scroll box to tab to; a long entry opens whole from a button and gives focus back (Web:S6845)', async () => {
    // jsdom has no layout: entry 2's text is taller than its page, entry 1's fits.
    const long = (el: HTMLElement) => el.dataset['entry'] === 'entry-2';
    const scrollHeight = vi.spyOn(HTMLElement.prototype, 'scrollHeight', 'get').mockImplementation(function (this: HTMLElement) {
      return long(this) ? 600 : 200;
    });
    const clientHeight = vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(276);
    const { fixture, host } = open([entry(2), entry(1)]);
    await fixture.whenStable();
    fixture.detectChanges();
    scrollHeight.mockRestore();
    clientHeight.mockRestore();
    // Pages are focusable only for page turns, never in the tab order.
    expect(host.querySelector('.desktop-book [tabindex="0"], .desktop-book [role="region"]')).toBeNull();
    expect(host.querySelector('.desktop-book .paper')?.getAttribute('tabindex')).toBe('-1');
    const readAll = host.querySelector<HTMLButtonElement>('.read-more');
    expect(readAll?.textContent).toContain('Read the whole entry: Title 2');
    expect(host.querySelectorAll('.read-more')).toHaveLength(1);
    const dialog = host.querySelector<HTMLDialogElement>('dialog.reader')!;
    dialog.showModal = vi.fn(() => dialog.setAttribute('open', ''));
    readAll!.focus();
    readAll!.click();
    fixture.detectChanges();
    await fixture.whenStable();
    expect(dialog.showModal).toHaveBeenCalled();
    expect(dialog.querySelector('h3')?.textContent).toBe('Title 2');
    dialog.dispatchEvent(new Event('close'));
    fixture.detectChanges();
    expect(dialog.querySelector('h3')).toBeNull();
    expect(document.activeElement).toBe(readAll);
  });

  it('shows the mobile return arrow only away from the newest entry and returns with reduced motion', async () => {
    vi.stubGlobal('matchMedia', vi.fn().mockReturnValue({ matches: true }));
    const { fixture, host } = open([entry(3), entry(2)]);
    await fixture.whenStable();
    const anchor = host.querySelector<HTMLElement>('.diary-sheet')!;
    const rect = vi.spyOn(anchor, 'getBoundingClientRect').mockReturnValue({ top: -40 } as DOMRect);
    const scroll = vi.fn();
    const focus = vi.spyOn(anchor, 'focus');
    anchor.scrollIntoView = scroll;
    window.dispatchEvent(new Event('scroll'));
    fixture.detectChanges();
    expect(host.querySelector('.back-to-newest')).not.toBeNull();
    host.querySelector<HTMLButtonElement>('.back-to-newest')!.click();
    expect(scroll).toHaveBeenCalledWith({ block: 'start', behavior: 'instant' });
    expect(focus).toHaveBeenCalledWith({ preventScroll: true });
    rect.mockReturnValue({ top: -0.5 } as DOMRect);
    window.dispatchEvent(new Event('scroll'));
    fixture.detectChanges();
    expect(host.querySelector('.back-to-newest')).toBeNull();
    fixture.destroy();
    vi.unstubAllGlobals();
  });

  it('localizes dates and navigation in Spanish without translating child-written text', () => {
    const locale = TestBed.inject(LocaleService);
    const original = locale.locale();
    try {
      locale.setLocale('es-419');
      const { host } = open([entry(3), entry(2), entry(1)]);
      expect(host.querySelector('.desktop-book time')?.textContent).toContain('noviembre');
      expect(host.querySelector('[aria-label="Entradas anteriores del diario"]')).not.toBeNull();
      expect(titles(host)).toEqual(['Title 3', 'Title 2']);
    } finally {
      locale.setLocale(original);
    }
  });
});
