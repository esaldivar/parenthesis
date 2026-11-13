import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { Api, Child, EssentialsBanner, EssentialsUpdates } from '../../core/api/api';
import { axeViolations } from '../../../testing/axe';
import { fakeAuth } from '../../../testing/fake-auth';
import { BANNER_MS, ChildEssentialsPage } from './child-essentials-page';
import { bannerText } from './essentials-updates';

// Synthetic family only: Kai and Aurora. Jamie (the co-parent) changed Kai's shoe size; the API is faked.
const child = (id: string, firstName: string): Child => ({
  id,
  firstName,
  status: 'Active',
  changeRequestId: null,
  signIn: { enabled: false } as Child['signIn'],
});

/** A stand-in IntersectionObserver: tests decide when an element comes on screen. */
class FakeObserver {
  static all: FakeObserver[] = [];
  readonly elements: Element[] = [];
  constructor(private readonly callback: IntersectionObserverCallback) {
    FakeObserver.all.push(this);
  }
  observe(element: Element) {
    this.elements.push(element);
  }
  disconnect() {
    FakeObserver.all = FakeObserver.all.filter((o) => o !== this);
  }
  /** Puts matching elements on screen: fully by default, or as described (a tall element only partly in view). */
  static show(match: (element: Element) => boolean, view: Partial<IntersectionObserverEntry> = { intersectionRatio: 1 }) {
    for (const observer of [...FakeObserver.all]) {
      const target = observer.elements.find(match);
      if (target) {
        observer.callback([{ isIntersecting: true, target, ...view } as IntersectionObserverEntry], observer as unknown as IntersectionObserver);
      }
    }
  }
}

describe('Child Essentials updates (#128)', () => {
  let banners: EssentialsBanner[];
  let updates: EssentialsUpdates;

  async function render() {
    const api = {
      children: vi.fn(async () => [child('kai', 'Kai'), child('aurora', 'Aurora')]),
      clothing: vi.fn(async () => ({ revision: 2, values: { topSize: 'Youth M', bottomSize: null, shoeSize: 'Size 3', fitNotes: null } })),
      school: vi.fn(async () => ({ revision: 0, values: { grade: null, homeroomTeacher: null, parentConcerns: null } })),
      whatHelps: vi.fn(async () => ({ revision: 0, values: { comfortItems: null, calmingStrategies: null } })),
      allergiesFood: vi.fn(async () => ({
        revision: 0,
        values: { allergies: null, foodPreferences: null, noKnownAllergies: false },
      })),
      routines: vi.fn(async () => ({ revision: 1, values: { entries: [{ id: 'r-teeth', title: 'Brushing teeth', details: null }] } })),
      householdRoutines: vi.fn(async () => [
        {
          ownerId: 'm-jamie',
          ownerName: 'Jamie',
          isMine: false,
          latest: { revision: 2, values: { entries: [{ id: 'r-lights', title: 'Lights out', details: '8:30 PM' }] } },
          shared: null,
          canAccept: true,
        },
      ]),
      caregivers: vi.fn(async () => ({
        version: 1,
        caregivers: [
          {
            id: 'cg-ava',
            details: { name: 'Ava Park', phone: '+15125550100', city: 'Katy', hourlyRate: 20, schoolPickup: true },
            averageRating: null,
            myRating: null,
            addedBy: 'Jamie',
          },
        ],
      })),
      emergencyContacts: vi.fn(async () => ({ version: 0, contacts: [] })),
      essentialsUpdates: vi.fn(async () => updates),
      essentialsOpened: vi.fn(async () => banners),
      essentialsSectionOpened: vi.fn(async () => undefined),
      essentialsRowsSeen: vi.fn(async () => undefined),
    };
    TestBed.configureTestingModule({ providers: [provideRouter([]), fakeAuth(), { provide: Api, useValue: api }] });
    const fixture = TestBed.createComponent(ChildEssentialsPage);
    document.body.appendChild(fixture.nativeElement);
    await settle(fixture);
    return { fixture, api, el: fixture.nativeElement as HTMLElement };
  }

  async function settle(fixture: { whenStable(): Promise<unknown>; detectChanges(): void }) {
    for (let i = 0; i < 5; i++) {
      fixture.detectChanges();
      await fixture.whenStable();
    }
  }

  const text = (el: Element | null) => el?.textContent?.replace(/\s+/g, ' ').trim() ?? '';
  const shoeRow = (el: HTMLElement) => [...el.querySelectorAll('.row')].find((row) => text(row).startsWith('Shoe size'))!;

  beforeEach(() => {
    FakeObserver.all = [];
    vi.stubGlobal('IntersectionObserver', FakeObserver);
    banners = [{ childId: 'kai', section: 'clothing', fields: ['shoeSize'] }];
    updates = { newUpdates: true, sections: [{ childId: 'kai', section: 'clothing', unopened: true, rows: ['shoeSize'] }] };
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
    document.body.innerHTML = '';
  });

  it('names one changed field, or the section when several changed, and never a value', () => {
    expect(bannerText('Kai', { childId: 'kai', section: 'clothing', fields: ['shoeSize'] })).toBe('Kai’s shoe size updated');
    expect(bannerText('Kai', { childId: 'kai', section: 'clothing', fields: ['shoeSize', 'topSize'] })).toBe(
      'Kai’s Clothing & Shoes updated',
    );
    expect(bannerText('Aurora', { childId: 'aurora', section: 'allergiesFood', fields: ['noKnownAllergies'] })).toBe(
      'Aurora’s allergy status updated',
    );
  });

  it('opening the page shows the banner, the child’s dot, the section dot and the highlighted row', async () => {
    const { el, api } = await render();

    expect(api.essentialsOpened).toHaveBeenCalledTimes(1);
    const banner = el.querySelector('.banner')!;
    expect(text(banner)).toBe('Kai’s shoe size updated');
    expect(banner.closest('[aria-live="polite"]')).not.toBeNull();
    const kai = [...el.querySelectorAll<HTMLButtonElement>('.children button')].find((b) => text(b).includes('Kai'))!;
    expect(text(kai)).toContain(', has updates');
    const aurora = [...el.querySelectorAll<HTMLButtonElement>('.children button')].find((b) => text(b).includes('Aurora'))!;
    expect(text(aurora)).not.toContain('has updates');
    expect(text(el.querySelector('[data-section=clothing] summary'))).toBe('Clothing & Shoes, Sizes and fit notes, updated');
    expect(shoeRow(el).classList).toContain('row--updated');
    expect(text(shoeRow(el))).toContain('Updated');
    const top = [...el.querySelectorAll('.row')].find((row) => text(row).startsWith('Top size'))!;
    expect(top.classList).not.toContain('row--updated');
    expect(await axeViolations(el)).toEqual([]);
  });

  it('clears each indicator on its own: banner on X, section dot when opened, row when on screen', async () => {
    const { fixture, el, api } = await render();

    const dismiss = el.querySelector<HTMLButtonElement>('.banner .dismiss')!;
    expect(dismiss.getAttribute('aria-label')).toBe('Dismiss: Kai’s shoe size updated');
    dismiss.focus();
    dismiss.click();
    await settle(fixture);
    expect(el.querySelector('.banner')).toBeNull();
    expect(document.activeElement).toBe(el.querySelector('h1'));
    // The banner's gone; the section dot and the row highlight stay.
    expect(text(el.querySelector('[data-section=clothing] summary'))).toContain('updated');
    expect(shoeRow(el).classList).toContain('row--updated');
    expect(api.essentialsSectionOpened).not.toHaveBeenCalled();

    const tile = el.querySelector<HTMLDetailsElement>('[data-section=clothing]')!;
    tile.open = true;
    tile.dispatchEvent(new Event('toggle'));
    await settle(fixture);
    expect(api.essentialsSectionOpened).toHaveBeenCalledWith('family-1', 'kai', 'clothing');
    expect(api.essentialsRowsSeen).not.toHaveBeenCalled();
    expect(text(tile.querySelector('summary'))).toBe('Clothing & Shoes, Sizes and fit notes');

    FakeObserver.show((element) => element === shoeRow(el));
    await settle(fixture);
    expect(api.essentialsRowsSeen).toHaveBeenCalledWith('family-1', 'kai', 'clothing', ['shoeSize']);
    // Seen rows stay highlighted for the rest of this visit.
    expect(shoeRow(el).classList).toContain('row--updated');
    const kai = [...el.querySelectorAll<HTMLButtonElement>('.children button')].find((b) => text(b).includes('Kai'))!;
    expect(text(kai)).not.toContain('has updates');
  });

  it('opens an illustrated detail screen at desktop width and returns focus to the same child’s tile on Back', async () => {
    vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: false })));
    const { fixture, el } = await render();
    const tile = el.querySelector<HTMLDetailsElement>('[data-section=caregivers]')!;
    tile.open = true;
    tile.dispatchEvent(new Event('toggle'));
    await settle(fixture);

    const hero = tile.querySelector('.section-hero')!;
    expect(el.querySelector('.layout')?.classList).toContain('focused');
    expect(hero.closest('section')?.getAttribute('aria-labelledby')).toBe('essentials-heading');
    expect(text(hero.querySelector('h2'))).toBe('Shared Caregivers');
    expect(hero.querySelector('img')?.getAttribute('src')).toBe('art/child-essentials/caregivers.webp');
    expect(document.activeElement).toBe(hero.querySelector('h2'));
    expect(await axeViolations(el)).toEqual([]);

    el.querySelector<HTMLButtonElement>('.back')!.click();
    await settle(fixture);
    expect(tile.open).toBe(false);
    expect(el.querySelector('.layout')?.classList).not.toContain('focused');
    expect(el.querySelector('.children [aria-pressed=true]')?.textContent).toContain('Kai');
    expect(tile.querySelector('.section-hero')).toBeNull();
    expect(document.activeElement).toBe(tile.querySelector('summary'));
  });

  it('a banner leaves by itself after about ten seconds, but not while the parent is reading it', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const { fixture, el } = await render();
    const region = el.querySelector('.banners')!;

    region.dispatchEvent(new Event('mouseenter'));
    vi.advanceTimersByTime(BANNER_MS + 1000);
    fixture.detectChanges();
    expect(el.querySelector('.banner')).not.toBeNull();

    region.dispatchEvent(new Event('mouseleave'));
    vi.advanceTimersByTime(BANNER_MS - 1000);
    fixture.detectChanges();
    expect(el.querySelector('.banner')).not.toBeNull();
    vi.advanceTimersByTime(1000);
    fixture.detectChanges();
    expect(el.querySelector('.banner')).toBeNull();
  });

  it('marks the co-parent’s Routines tab until opened, and a changed caregiver until seen', async () => {
    banners = [
      { childId: 'kai', section: 'householdRoutines', fields: ['r-lights'] },
      { childId: 'kai', section: 'caregivers', fields: ['cg-ava'] },
    ];
    updates = {
      newUpdates: true,
      sections: [
        { childId: 'kai', section: 'householdRoutines', unopened: true, rows: ['r-lights'] },
        { childId: 'kai', section: 'caregivers', unopened: true, rows: ['cg-ava'] },
      ],
    };
    const { fixture, el, api } = await render();

    expect([...el.querySelectorAll('.banner')].map(text)).toEqual([
      'Kai’s routines at your co-parent’s home updated',
      'Kai’s Shared Caregivers updated',
    ]);
    const tab = [...el.querySelectorAll<HTMLButtonElement>('app-routines-section button')].find((b) => text(b).startsWith('Jamie’s routines'))!;
    expect(text(tab)).toBe('Jamie’s routines, updated');
    const ava = el.querySelector('app-caregivers-section article')!;
    expect(ava.classList).toContain('row--updated');
    expect(text(ava.querySelector('.caregiver-name'))).toBe('Ava Park');
    expect(text(ava.querySelector('.updated-pill'))).toBe('Updated');
    expect(ava.querySelector('h4 [role="img"]')?.getAttribute('aria-label')).toBe('Unrated');
    expect(text(ava.querySelector('.contact-line > span'))).toBe('512-555-0100');
    expect(text(ava.querySelector('.call'))).toBe('Call');
    expect(ava.querySelector('.call')?.getAttribute('href')).toBe('tel:+15125550100');
    expect([...ava.querySelectorAll('p:not(.contact-line)')].map(text)).toEqual([
      'School pickup', 'City: Katy', 'Hourly rate: $20.00', 'Added by Jamie',
    ]);
    expect([...ava.querySelectorAll('.management button')].map(text)).toEqual(['Edit', 'Remove', 'Rate']);

    tab.click();
    await settle(fixture);
    expect(api.essentialsSectionOpened).toHaveBeenCalledWith('family-1', 'kai', 'householdRoutines');
    expect(text(tab)).toBe('Jamie’s routines');
    const lightsOut = [...el.querySelectorAll('app-routines-section .row')].find((row) => text(row).startsWith('Lights out'))!;
    expect(lightsOut.classList).toContain('row--updated');
    expect(await axeViolations(el)).toEqual([]);

    FakeObserver.show((element) => element === ava);
    await settle(fixture);
    expect(api.essentialsRowsSeen).toHaveBeenCalledWith('family-1', 'kai', 'caregivers', ['cg-ava']);
  });

  it('counts a row taller than the screen as seen once it fills half the screen', async () => {
    const { fixture, el, api } = await render();
    const shoes = (element: Element) => element === shoeRow(el);
    const screen = { height: 800 } as DOMRectReadOnly;

    FakeObserver.show(shoes, { intersectionRatio: 0.1, rootBounds: screen, intersectionRect: { height: 120 } as DOMRectReadOnly });
    await settle(fixture);
    expect(api.essentialsRowsSeen).not.toHaveBeenCalled();

    FakeObserver.show(shoes, { intersectionRatio: 0.3, rootBounds: screen, intersectionRect: { height: 640 } as DOMRectReadOnly });
    await settle(fixture);
    expect(api.essentialsRowsSeen).toHaveBeenCalledWith('family-1', 'kai', 'clothing', ['shoeSize']);
  });

  it('shows nothing when there’s nothing new', async () => {
    banners = [];
    updates = { newUpdates: false, sections: [] };
    const { el } = await render();

    expect(el.querySelector('.banner')).toBeNull();
    expect(el.querySelector('.updated-badge')).toBeNull();
    expect(el.querySelector('.row--updated')).toBeNull();
    expect(text(el)).not.toContain('has updates');
  });
});
