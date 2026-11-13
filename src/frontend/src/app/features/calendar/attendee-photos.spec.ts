import { TestBed } from '@angular/core/testing';
import { ProfilePhotos } from '../../core/profile-photos/profile-photos';
import { CalendarItem } from './calendar-items';
import { CalendarList } from './components/calendar-list/calendar-list.component';
import { CalendarWeek } from './components/calendar-week/calendar-week.component';

const item: CalendarItem = {
  id: 'event', title: 'Family outing', kind: 'family', category: 'Joint', categoryLabel: 'Family event', icon: 'calendar',
  start: '2026-11-09T09:00', end: '2026-11-09T10:00', firstDate: '2026-11-09', lastDate: '2026-11-09',
  allDay: false, spansDays: false, status: 'confirmed', pendingChange: 'None', beforeCoParentJoined: false,
  parents: [{ id: 'parent-1', name: 'Sam' }], children: [{ id: 'child-1', name: 'Sam' }, { id: 'child-2', name: 'Jo' }],
  ownerName: 'Sam', isMine: true, location: null, notes: null, warnings: [],
};

describe('Calendar attendee photos (#581)', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [{ provide: ProfilePhotos, useValue: {
      url: (kind: string, id: string) => id === 'child-2' ? null : `/viewer/${kind}/${id}.png`,
    } }] });
    vi.stubGlobal('ResizeObserver', class {
      constructor(private readonly callback: ResizeObserverCallback) {}
      observe() { this.callback([{ contentRect: { width: 100 } } as ResizeObserverEntry], this as unknown as ResizeObserver); }
      disconnect() { /* test observer */ }
    });
  });
  afterEach(() => vi.unstubAllGlobals());

  for (const view of ['week', 'list'] as const) {
    it(`${view} uses viewer-authorized photos at every breakpoint and falls back after a failed image`, async () => {
      const fixture = view === 'week' ? TestBed.createComponent(CalendarWeek) : TestBed.createComponent(CalendarList);
      fixture.componentRef.setInput(view === 'week' ? 'weekStart' : 'from', '2026-11-09');
      if (view === 'list') fixture.componentRef.setInput('to', '2026-11-16');
      fixture.componentRef.setInput('today', '2026-11-09'); fixture.componentRef.setInput('items', [item]);
      fixture.detectChanges(); await fixture.whenStable(); fixture.detectChanges();
      const host = fixture.nativeElement as HTMLElement;
      const avatars = [...host.querySelectorAll('app-avatar')];
      const parent = avatars.find(a => a.getAttribute('data-kind') === 'parent')!;
      const child = avatars.find(a => a.getAttribute('data-kind') === 'child' && a.getAttribute('title') === 'Sam')!;
      expect(parent.querySelector('img')?.getAttribute('src')).toBe('/viewer/parent/parent-1.png');
      expect(child.querySelector('img')?.getAttribute('src')).toBe('/viewer/child/child-1.png');
      expect(parent.getAttribute('data-photo')).toBe('any'); expect(child.getAttribute('data-photo')).toBe('any');
      expect(avatars.find(a => a.getAttribute('title') === 'Jo')?.querySelector('img')).toBeNull();
      child.querySelector('img')!.dispatchEvent(new Event('error')); fixture.detectChanges();
      expect(child.querySelector('img')).toBeNull(); expect(child.textContent?.trim()).toBe('S');
      expect(host.textContent).toContain('Family outing');
    });
  }
});
