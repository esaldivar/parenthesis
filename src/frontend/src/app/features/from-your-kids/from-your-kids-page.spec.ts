import { vi } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { Api, Child } from '../../core/api/api';
import { AuthStore } from '../../core/auth/auth.store';
import { FromYourKidsPage } from './from-your-kids-page';

describe('From Your Kids parent-facing shell (#531)', () => {
  const family = signal<{ id: string; role: 'Parent' } | null>({ id: 'family-1', role: 'Parent' });
  const children: Child[] = [
    { id: 'kid-1', firstName: 'Kai', status: 'Active', changeRequestId: null, signIn: { enabled: false, locked: false, pinChangePending: false } },
    { id: 'kid-2', firstName: 'Aurora', status: 'Active', changeRequestId: null, signIn: { enabled: false, locked: false, pinChangePending: false } },
  ];
  let load: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    family.set({ id: 'family-1', role: 'Parent' });
    load = vi.fn().mockResolvedValue(children);
    TestBed.configureTestingModule({
      providers: [
        { provide: AuthStore, useValue: { currentFamily: family } },
        { provide: Api, useValue: { children: load } },
      ],
    });
  });

  it('loads real active child tabs and switches the parent-only sections', async () => {
    const fixture = TestBed.createComponent(FromYourKidsPage);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    const host = fixture.nativeElement as HTMLElement;
    expect(load).toHaveBeenCalledWith('family-1');
    const tabs = [...host.querySelectorAll<HTMLButtonElement>('.child-tabs button')];
    expect(tabs.map(button => button.querySelector('.child-name')?.textContent.trim())).toEqual(['Kai', 'Aurora']);
    tabs[1].click();
    fixture.detectChanges();
    expect(tabs[1].getAttribute('aria-pressed')).toBe('true');
    const photos = [...host.querySelectorAll<HTMLButtonElement>('.sections button')].find(button => button.textContent.includes('Photos'))!;
    photos.click();
    fixture.detectChanges();
    expect(host.textContent).toContain('No photos shared with you yet');
    expect(host.querySelector('.corkboard-sticker')).toBeNull();
    expect(host.querySelector('button[aria-label="Add Photo"]')).toBeNull();
  });

  it('shows labeled sample content only after opting into the development preview', async () => {
    const fixture = TestBed.createComponent(FromYourKidsPage);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    const host = fixture.nativeElement as HTMLElement;
    const toggle = host.querySelector<HTMLInputElement>('.preview-toggle input')!;
    expect(host.textContent).toContain('No diary entries shared with you yet');
    toggle.click();
    fixture.detectChanges();
    expect(host.textContent).toContain('Showing synthetic examples');
    expect(host.querySelector('article .mood')?.textContent).toContain('Happy');
    const [, artwork, photos] = host.querySelectorAll<HTMLButtonElement>('.sections button');
    artwork.click();
    fixture.detectChanges();
    expect(host.querySelectorAll('.fridge-door .memory')).toHaveLength(2);
    expect(host.querySelectorAll('.artwork-grid .memory')).toHaveLength(3);
    expect(host.textContent).not.toContain('No artwork shared with you yet');
    photos.click();
    fixture.detectChanges();
    expect(host.querySelectorAll('.corkboard .memory')).toHaveLength(3);
    expect(host.querySelectorAll('.corkboard-sticker')).toHaveLength(2);
    toggle.click();
    fixture.detectChanges();
    expect(host.querySelector('.corkboard .memory')).toBeNull();
    expect(host.querySelector('.corkboard-sticker')).toBeNull();
    expect(host.textContent).toContain('No photos shared with you yet');
  });

  it('never renders pending child profiles', async () => {
    load.mockResolvedValue([...children, { ...children[0], id: 'pending', firstName: 'Hidden', status: 'PendingApproval' }]);
    const fixture = TestBed.createComponent(FromYourKidsPage);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    expect((fixture.nativeElement as HTMLElement).querySelector('.child-tabs')?.textContent).not.toContain('Hidden');
  });

  it('shows retry when child profiles cannot load', async () => {
    load.mockRejectedValue(new Error('offline'));
    const fixture = TestBed.createComponent(FromYourKidsPage);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    const host = fixture.nativeElement as HTMLElement;
    expect(host.querySelector('[role="alert"]')?.textContent).toContain("couldn't load");
    load.mockResolvedValue(children);
    host.querySelector<HTMLButtonElement>('.retry')!.click();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(host.querySelector('.child-tabs')).not.toBeNull();
  });
  it('does not expose child tabs from a previous family after switching families', async () => {
    let resolveFirst!: (value: Child[]) => void;
    const first = new Promise<Child[]>(resolve => { resolveFirst = resolve; });
    load.mockImplementation((familyId: string) => familyId === 'family-1' ? first : Promise.resolve([
      { ...children[0], id: 'new-family-child', firstName: 'New family child' },
    ]));
    const fixture = TestBed.createComponent(FromYourKidsPage);
    fixture.detectChanges();
    family.set({ id: 'family-2', role: 'Parent' });
    fixture.detectChanges();
    await Promise.resolve();
    fixture.detectChanges();
    resolveFirst(children);
    await fixture.whenStable();
    fixture.detectChanges();
    const tabs = (fixture.nativeElement as HTMLElement).querySelector('.child-tabs')?.textContent ?? '';
    expect(tabs).toContain('New family child');
    expect(tabs).not.toContain('Aurora');
  });

});
