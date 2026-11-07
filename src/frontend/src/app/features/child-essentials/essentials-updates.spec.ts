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
  static show(match: (element: Element) => boolean) {
    for (const observer of [...FakeObserver.all]) {
      const target = observer.elements.find(match);
      if (target) {
        observer.callback([{ isIntersecting: true, target } as IntersectionObserverEntry], observer as unknown as IntersectionObserver);
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
      routines: vi.fn(async () => ({ revision: 1, values: { bedtime: '8:00 PM', naps: null } })),
      householdRoutines: vi.fn(async () => [
        {
          ownerId: 'm-jamie',
          ownerName: 'Jamie',
          isMine: false,
          latest: { revision: 2, values: { bedtime: '8:30 PM', naps: '1 PM' } },
          shared: null,
          canAccept: true,
        },
      ]),
      caregivers: vi.fn(async () => ({
        version: 1,
        caregivers: [
          {
            id: 'cg-ava',
            details: { name: 'Ava Park', phone: '555-010-4000', city: null, hourlyRate: null, schoolPickup: true },
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
    expect(text(el.querySelector('[data-section=clothing] summary'))).toBe('Clothing & Shoes, updated');
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
    expect(text(tile.querySelector('summary'))).toBe('Clothing & Shoes');

    FakeObserver.show((element) => element === shoeRow(el));
    await settle(fixture);
    expect(api.essentialsRowsSeen).toHaveBeenCalledWith('family-1', 'kai', 'clothing', ['shoeSize']);
    // Seen rows stay highlighted for the rest of this visit.
    expect(shoeRow(el).classList).toContain('row--updated');
    const kai = [...el.querySelectorAll<HTMLButtonElement>('.children button')].find((b) => text(b).includes('Kai'))!;
    expect(text(kai)).not.toContain('has updates');
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
      { childId: 'kai', section: 'householdRoutines', fields: ['bedtime'] },
      { childId: 'kai', section: 'caregivers', fields: ['cg-ava'] },
    ];
    updates = {
      newUpdates: true,
      sections: [
        { childId: 'kai', section: 'householdRoutines', unopened: true, rows: ['bedtime'] },
        { childId: 'kai', section: 'caregivers', unopened: true, rows: ['cg-ava'] },
      ],
    };
    const { fixture, el, api } = await render();

    expect([...el.querySelectorAll('.banner')].map(text)).toEqual([
      'Kai’s bedtime at your co-parent’s home updated',
      'Kai’s Shared Caregivers updated',
    ]);
    const tab = [...el.querySelectorAll<HTMLButtonElement>('app-routines-section button')].find((b) => text(b).startsWith('Jamie’s routines'))!;
    expect(text(tab)).toBe('Jamie’s routines, updated');
    const ava = el.querySelector('app-caregivers-section article')!;
    expect(ava.classList).toContain('row--updated');
    expect(text(ava.querySelector('h4'))).toBe('Ava Park Updated');

    tab.click();
    await settle(fixture);
    expect(api.essentialsSectionOpened).toHaveBeenCalledWith('family-1', 'kai', 'householdRoutines');
    expect(text(tab)).toBe('Jamie’s routines');
    const bedtime = [...el.querySelectorAll('app-routines-section .row')].find((row) => text(row).startsWith('Bedtime'))!;
    expect(bedtime.classList).toContain('row--updated');
    expect(await axeViolations(el)).toEqual([]);

    FakeObserver.show((element) => element === ava);
    await settle(fixture);
    expect(api.essentialsRowsSeen).toHaveBeenCalledWith('family-1', 'kai', 'caregivers', ['cg-ava']);
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
