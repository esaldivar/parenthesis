import { TestBed } from '@angular/core/testing';
import { provideRouter, withComponentInputBinding } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { routes } from '../app.routes';
import { axeViolations } from '../../testing/axe';
import { fakeAuth } from '../../testing/fake-auth';

describe('application shells', () => {
  async function open(url: string) {
    TestBed.configureTestingModule({ providers: [provideRouter(routes, withComponentInputBinding()), fakeAuth()] });
    const harness = await RouterTestingHarness.create(url);
    return harness.routeNativeElement!.ownerDocument.body;
  }

  const linkTexts = (root: Element) =>
    [...root.querySelectorAll('a')].map((a) => a.textContent!.replace(/\s+/g, ' ').trim());

  describe('parent shell', () => {
    it('offers the approved navigation, in its exact order, with Calendar as one standalone item', async () => {
      const body = await open('/');
      const sidenav = body.querySelector('nav.sidenav')!;

      expect(linkTexts(sidenav)).toEqual([
        'Home',
        'Calendar',
        'Messages',
        'From Your Kids',
        'Family Memories',
        'Child Essentials',
        'Settings',
      ]);
      expect(linkTexts(body.querySelector('nav.bottomnav')!)).toEqual(['Home', 'Calendar', 'Messages', 'Memories', 'More']);
    });

    it('lists the remaining destinations under More on phones, in the same order', async () => {
      const body = await open('/more');

      expect(linkTexts(body.querySelector('main ul')!)).toEqual(['From Your Kids', 'Child Essentials', 'Settings']);
    });

    it('sends old /children links to Child Essentials', async () => {
      const body = await open('/children');

      expect(body.querySelector('main h1')!.textContent).toBe('Child Essentials');
    });

    it('offers one account menu, in the top bar, instead of a bare sign-out button', async () => {
      const body = await open('/');

      const menus = [...body.querySelectorAll('button[aria-label="Account menu"]')];
      expect(menus).toHaveLength(1);
      expect(menus[0].closest('header.topbar')).not.toBeNull();
      expect(menus[0].textContent).toContain('Alex');
      expect(body.querySelector('.sidebar')!.textContent).not.toContain('Hi, Alex');
    });

    it('marks the current page for assistive technology', async () => {
      const body = await open('/calendar');

      const current = [...body.querySelectorAll('[aria-current="page"]')].map((a) => a.textContent!.trim());
      expect(current).toEqual(['Calendar', 'Calendar']); // Side and bottom navigation; only one is visible at a time.
    });

    it('never shows unread counts for real data: the bell says notifications are not available yet', async () => {
      const body = await open('/');

      expect(body.querySelector('.badge')).toBeNull();
      expect(body.querySelector('button.bell')!.getAttribute('aria-label')).toBe('Notifications');
    });

    it('shows placeholder counts only in the sample preview, labelled as sample data', async () => {
      const body = await open('/?sample=1');
      const sidenav = body.querySelector('nav.sidenav')!;

      expect(sidenav.textContent).toContain('3 unread (sample data)'); // Messages
      expect(sidenav.textContent).toContain('2 unread (sample data)'); // From Your Kids
      expect(body.querySelector('button.bell')!.getAttribute('aria-label')).toBe('Notifications, 3 unread (sample data)');
    });

    it('keeps Home current when the dashboard URL carries a query, and only Home', async () => {
      const body = await open('/?week=2026-10-18');

      const current = [...body.querySelectorAll('[aria-current="page"]')].map((a) => a.textContent!.trim());
      expect(current).toEqual(['Home', 'Home']);
    });

    it('shows the approved dashboard sections', async () => {
      const body = await open('/');

      expect([...body.querySelectorAll('main h2')].map((h) => h.textContent!.replace(/\s+/g, ' ').trim()).slice(1)).toEqual([
        'Upcoming',
        'Quick Add',
        'From Your Kids',
        'Recent Messages',
        'Family Memories',
      ]);
    });

    it('says plainly that unbuilt features are not available', async () => {
      const body = await open('/memories');

      expect(body.querySelector('main')!.textContent).toContain('Family memories aren’t available yet');
    });

    it.each(['/', '/calendar', '/settings', '/more'])('has no automatically detectable accessibility issues at %s', async (url) => {
      const body = await open(url);

      expect(await axeViolations(body)).toEqual([]);
    });
  });

  describe('child shell', () => {
    it('only links to child destinations', async () => {
      const body = await open('/kid');
      const text = body.textContent!;

      expect(linkTexts(body.querySelector('nav')!)).toEqual(['My Artwork', 'My Diary', 'My Photos', 'My Memories']);
      for (const adultOnly of ['Approvals', 'Messages', 'Calendar', 'Child Essentials', 'From Your Kids', 'Family Memories']) {
        expect(text).not.toContain(adultOnly);
      }
    });

    it('explains that diary entries are private unless shared with both parents', async () => {
      const body = await open('/kid/diary');

      expect(body.querySelector('main')!.textContent).toContain(
        'only you can see an entry unless you choose to share it with both parents',
      );
    });

    it.each(['/kid', '/kid/diary', '/kid/settings'])('has no automatically detectable accessibility issues at %s', async (url) => {
      const body = await open(url);

      expect(await axeViolations(body)).toEqual([]);
    });
  });
});
