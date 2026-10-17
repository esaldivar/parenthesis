import { TestBed } from '@angular/core/testing';
import { provideRouter, withComponentInputBinding } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { routes } from '../app.routes';
import { axeViolations } from '../../testing/axe';

describe('application shells', () => {
  async function open(url: string) {
    TestBed.configureTestingModule({ providers: [provideRouter(routes, withComponentInputBinding())] });
    const harness = await RouterTestingHarness.create(url);
    return harness.routeNativeElement!.ownerDocument.body;
  }

  const linkTexts = (root: Element) =>
    [...root.querySelectorAll('a')].map((a) => a.textContent!.replace(/\s+/g, ' ').trim());

  describe('parent shell', () => {
    it('offers the planned navigation with visible labels, and marks Messages as later', async () => {
      const body = await open('/');
      const sidenav = body.querySelector('nav.sidenav')!;

      expect(linkTexts(sidenav)).toEqual([
        'Dashboard',
        'Calendar',
        'Children',
        'Memories',
        'Messages, Later', // Visually hidden comma, so screen readers don't hear "MessagesLater".
        'Approvals',
        'Settings',
      ]);
      expect(linkTexts(body.querySelector('nav.bottomnav')!)).toEqual(['Home', 'Calendar', 'Memories', 'Approvals', 'More']);
    });

    it('marks the current page for assistive technology', async () => {
      const body = await open('/calendar');

      const current = [...body.querySelectorAll('[aria-current="page"]')].map((a) => a.textContent!.trim());
      expect(current).toEqual(['Calendar', 'Calendar']); // Side and bottom navigation; only one is visible at a time.
    });

    it('orders the dashboard by immediate need', async () => {
      const body = await open('/');

      expect([...body.querySelectorAll('main h2')].map((h) => h.textContent)).toEqual([
        'Today',
        'Waiting for you',
        'Coming up',
        'Recent memories',
      ]);
    });

    it('says plainly that unbuilt features are not available', async () => {
      const body = await open('/approvals');

      expect(body.querySelector('main')!.textContent).toContain('Approvals aren’t available yet');
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
      for (const adultOnly of ['Approvals', 'Messages', 'Calendar', 'Children', 'Dashboard']) {
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
