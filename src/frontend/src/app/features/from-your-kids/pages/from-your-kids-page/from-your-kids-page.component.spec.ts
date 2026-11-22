import { vi } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { Api, Child } from '../../../../core/api/api';
import { AuthStore } from '../../../../core/auth/auth.store';
import { FromYourKidsPage } from './from-your-kids-page.component';

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
    // #710: the empty board is decorated, says nothing on the board itself, and has no parent upload action.
    expect(host.querySelector('.board .visually-hidden')?.textContent).toContain('No photos shared with you yet');
    expect(host.querySelectorAll('.board .deco').length).toBeGreaterThan(0);
    expect(host.querySelector('.pinned-photo, .post-it')).toBeNull();
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
    expect(host.querySelector('.desktop-book h3')?.textContent).toContain('A little garden');
    const [, artwork, photos] = host.querySelectorAll<HTMLButtonElement>('.sections button');
    artwork.click();
    fixture.detectChanges();
    // #714: the three newest drawings on the fridge and the View all note for the other two.
    expect(host.querySelectorAll('.fridge .drawing')).toHaveLength(3);
    expect(host.querySelector('.fridge-note')?.textContent).toContain('View all artwork');
    expect(host.textContent).not.toContain('No artwork shared with you yet');
    photos.click();
    fixture.detectChanges();
    expect(host.querySelectorAll('.board .pinned-photo')).toHaveLength(3);
    expect(host.querySelector('.post-it')?.textContent).toContain('View all photos');
    toggle.click();
    fixture.detectChanges();
    expect(host.querySelector('.board .pinned-photo')).toBeNull();
    expect(host.textContent).toContain('No photos shared with you yet');
  });

  describe('Photos gallery and detail (#710)', () => {
    async function photosPreview() {
      const fixture = TestBed.createComponent(FromYourKidsPage);
      fixture.detectChanges();
      await fixture.whenStable();
      fixture.detectChanges();
      const host = fixture.nativeElement as HTMLElement;
      host.querySelector<HTMLInputElement>('.preview-toggle input')!.click();
      fixture.detectChanges();
      [...host.querySelectorAll<HTMLButtonElement>('.sections button')].find(button => button.textContent.includes('Photos'))!.click();
      fixture.detectChanges();
      return { fixture, host };
    }

    it('opens the newest-first gallery from the Post-it, with the back link at the top and the same child', async () => {
      const { fixture, host } = await photosPreview();
      host.querySelectorAll<HTMLButtonElement>('.child-tabs button')[1].click();
      fixture.detectChanges();
      expect(host.querySelector('.board')).not.toBeNull();
      host.querySelector<HTMLButtonElement>('.post-it')!.click();
      fixture.detectChanges();
      await fixture.whenStable();
      expect(host.querySelector('.kids')!.firstElementChild!.querySelector('.back-link')?.textContent).toContain('Back to From Your Kids');
      expect(host.querySelector('h1')?.textContent).toContain('Photos from your kids');
      expect(document.activeElement).toBe(host.querySelector('h1'));
      expect(host.querySelectorAll('.child-tabs button')[1].getAttribute('aria-pressed')).toBe('true');
      expect(host.querySelector('.sections')).toBeNull();
      expect(host.querySelectorAll('.gallery .tile')).toHaveLength(6);
      host.querySelector<HTMLButtonElement>('.back-link')!.click();
      fixture.detectChanges();
      expect(host.querySelector('.board')).not.toBeNull();
      expect(host.querySelector('.sections button[aria-current="page"]')?.textContent).toContain('Photos');
      expect(host.querySelectorAll('.child-tabs button')[1].getAttribute('aria-pressed')).toBe('true');
    });

    it('hearts and comments a sample photo on the page only, and says nothing was sent', async () => {
      const { fixture, host } = await photosPreview();
      host.querySelector<HTMLButtonElement>('.pinned-photo')!.click();
      fixture.detectChanges();
      const heart = host.querySelector<HTMLButtonElement>('.heart')!;
      expect(heart.getAttribute('aria-pressed')).toBe('false');
      heart.click();
      fixture.detectChanges();
      expect(host.querySelector('.heart')!.getAttribute('aria-pressed')).toBe('true');
      const field = host.querySelector<HTMLTextAreaElement>('#photo-comment')!;
      field.value = '  Love this kite!  ';
      field.dispatchEvent(new Event('input'));
      host.querySelector<HTMLButtonElement>('.save')!.click();
      fixture.detectChanges();
      expect(host.querySelector('.status')?.textContent).toContain('Nothing was sent');
      expect(host.querySelector('.status')?.textContent).not.toContain('Comment saved');
      host.querySelector<HTMLButtonElement>('.back-photos')!.click();
      fixture.detectChanges();
      expect(host.querySelector('.gallery .tile')?.getAttribute('aria-label')).toContain('You hearted this photo');
      host.querySelector<HTMLButtonElement>('.gallery .tile')!.click();
      fixture.detectChanges();
      expect(host.querySelector<HTMLTextAreaElement>('#photo-comment')!.value).toBe('Love this kite!');
    });

    it('shows the other child’s gallery when switching child on an open photo', async () => {
      const { fixture, host } = await photosPreview();
      host.querySelector<HTMLButtonElement>('.pinned-photo')!.click();
      fixture.detectChanges();
      expect(host.querySelector('.detail')).not.toBeNull();
      host.querySelectorAll<HTMLButtonElement>('.child-tabs button')[1].click();
      fixture.detectChanges();
      expect(host.querySelector('.detail')).toBeNull();
      expect(host.querySelector('.gallery')).not.toBeNull();
    });
  });

  describe('Artwork fridge, gallery and detail (#714)', () => {
    async function artworkPage(preview: boolean) {
      const fixture = TestBed.createComponent(FromYourKidsPage);
      fixture.detectChanges();
      await fixture.whenStable();
      fixture.detectChanges();
      const host = fixture.nativeElement as HTMLElement;
      if (preview) {
        host.querySelector<HTMLInputElement>('.preview-toggle input')!.click();
        fixture.detectChanges();
      }
      [...host.querySelectorAll<HTMLButtonElement>('.sections button')].find(button => button.textContent.includes('Artwork'))!.click();
      fixture.detectChanges();
      return { fixture, host };
    }

    it('shows the same empty fridge with an honest message and no drawings', async () => {
      const { host } = await artworkPage(false);
      expect(host.querySelector('.fridge')).not.toBeNull();
      expect(host.querySelector('.fridge .drawing, .fridge-note')).toBeNull();
      expect(host.querySelector('.fridge-empty')?.textContent).toContain('No artwork shared with you yet.');
      expect(host.querySelector('[aria-label="Kai’s artwork fridge"]')).not.toBeNull();
    });

    it('opens the artwork gallery and a drawing, with back links, and keeps Artwork when switching child', async () => {
      const { fixture, host } = await artworkPage(true);
      host.querySelector<HTMLButtonElement>('.fridge-note')!.click();
      fixture.detectChanges();
      await fixture.whenStable();
      expect(host.querySelector('h1')?.textContent).toContain('Artwork from your kids');
      expect(document.activeElement).toBe(host.querySelector('h1'));
      expect(host.querySelector('.latest')?.textContent).toContain('Latest artwork');
      expect(host.querySelectorAll('.gallery .tile')).toHaveLength(5);
      expect(host.querySelector('.gallery .frame.mat')).not.toBeNull();
      host.querySelectorAll<HTMLButtonElement>('.gallery .tile')[1].click();
      fixture.detectChanges();
      expect(host.querySelector('.photo-frame.mat .full')?.getAttribute('alt')).toBe('Sample drawing of a rocket and the moon');
      expect(host.querySelector('.back-photos')?.textContent).toContain('Back to artwork');
      host.querySelector<HTMLButtonElement>('.heart')!.click();
      fixture.detectChanges();
      expect(host.querySelector('.heart')!.getAttribute('aria-pressed')).toBe('false');
      host.querySelectorAll<HTMLButtonElement>('.child-tabs button')[1].click();
      fixture.detectChanges();
      expect(host.querySelector('.gallery')).not.toBeNull();
      expect(host.querySelector('h1')?.textContent).toContain('Artwork from your kids');
      host.querySelector<HTMLButtonElement>('.back-link')!.click();
      fixture.detectChanges();
      expect(host.querySelector('.fridge')).not.toBeNull();
      expect(host.querySelector('.sections button[aria-current="page"]')?.textContent).toContain('Artwork');
      host.querySelectorAll<HTMLButtonElement>('.child-tabs button')[0].click();
      fixture.detectChanges();
      expect(host.querySelector('.sections button[aria-current="page"]')?.textContent).toContain('Artwork');
    });
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
