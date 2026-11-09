import { TestBed } from '@angular/core/testing';
import { provideRouter, withComponentInputBinding } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { routes } from '../app.routes';
import { CHAT_CONNECTION, ChatStore } from '../core/chat/chat.store';
import { LocaleService } from '../core/i18n/locale.service';
import { SharedRecordsAttentionStore } from '../core/shared-records/shared-records-attention.store';
import { EssentialsUpdatesStore } from '../core/essentials/essentials-updates.store';
import { axeViolations } from '../../testing/axe';
import { fakeAuth } from '../../testing/fake-auth';

describe('application shells', () => {
  async function open(url: string) {
    TestBed.configureTestingModule({
      providers: [
        provideRouter(routes, withComponentInputBinding()),
        fakeAuth(),
        // No live chat connection in these tests: it never opens.
        { provide: CHAT_CONNECTION, useValue: () => new Promise(() => undefined) },
      ],
    });
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
        'Shared records',
        'Settings',
      ]);
      expect(linkTexts(body.querySelector('nav.bottomnav')!)).toEqual(['Home', 'Calendar', 'Messages', 'Memories', 'More']);
    });

    it('lists the remaining destinations under More on phones, in the same order', async () => {
      const body = await open('/more');

      expect(linkTexts(body.querySelector('main ul')!)).toEqual(['From Your Kids', 'Child Essentials', 'Shared records', 'Settings']);
    });

    it('sends old /children links to Child Essentials', async () => {
      const body = await open('/children');

      expect(body.querySelector('main h1')!.textContent).toBe('Child Essentials');
    });

    it('offers one account menu, in the top bar, instead of a bare sign-out button', async () => {
      const body = await open('/');

      const menus = [...body.querySelectorAll('button.account')];
      expect(menus).toHaveLength(1);
      expect(menus[0].getAttribute('aria-label')).toBeNull();
      expect(menus[0].querySelector('.visually-hidden')?.textContent).toContain('account menu');
      expect(menus[0].closest('header.topbar')).not.toBeNull();
      expect(menus[0].textContent).toContain('Alex');
      expect(body.querySelector('.sidebar')!.textContent).not.toContain('Hi, Alex');
    });

    it('marks the current page for assistive technology', async () => {
      const body = await open('/calendar');

      const current = [...body.querySelectorAll('[aria-current="page"]')].map((a) => a.textContent!.trim());
      expect(current).toEqual(['Calendar', 'Calendar']); // Side and bottom navigation; only one is visible at a time.
    });

    it('links the bell to Notifications without a placeholder count', async () => {
      const body = await open('/');

      expect(body.querySelector('.dot')).toBeNull();
      expect(body.querySelector('a.bell')?.getAttribute('href')).toBe('/notifications');
      expect(body.querySelector('a.bell')!.getAttribute('aria-label')).toBe('Notifications');
    });

    it('shows placeholder counts only in the sample preview, labelled as sample data', async () => {
      const body = await open('/?sample=1');
      const sidenav = body.querySelector('nav.sidenav')!;

      expect(sidenav.textContent).toContain('2 unread (sample data)'); // From Your Kids
      expect(sidenav.textContent).not.toContain('3 unread'); // Messages have real unread state (#125)
      expect(body.querySelector('a.bell')!.getAttribute('aria-label')).toBe('Notifications');
      // The notification bell only uses real data, even in the sample preview.
      expect(body.querySelector('a.bell .dot.dot--bell')).toBeNull();
      expect(body.querySelector('a.bell')!.textContent).not.toContain('3');
      expect(sidenav.querySelectorAll('.dot')).toHaveLength(1);
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
        'Family Memories',
      ]);
    });

    it('says plainly that unbuilt features are not available', async () => {
      const body = await open('/from-your-kids');

      expect(body.querySelector('main')!.textContent).toContain('Sharing from your children’s space isn’t available yet');
    });

    it('opens Messages full screen on phones, with its own way back', async () => {
      const body = await open('/messages');

      expect(body.querySelector('.shell')!.classList).toContain('shell--full-screen');
      expect(body.querySelector('main a[aria-label="Back to Home"]')!.getAttribute('href')).toBe('/');
    });

    it('shows a dot on Messages, with words for assistive technology, when the co-parent wrote something unread', async () => {
      const body = await open('/');
      expect(body.querySelector('.dot')).toBeNull();

      TestBed.inject(ChatStore).unread.set(2);
      TestBed.tick();

      expect(body.querySelectorAll('nav.sidenav .dot, nav.bottomnav .dot')).toHaveLength(2);
      const messages = [...body.querySelectorAll('nav a')].filter((a) => a.getAttribute('href') === '/messages');
      expect(messages).toHaveLength(2);
      expect(messages.every((a) => a.querySelector('.visually-hidden')!.textContent === ', unread messages')).toBe(true);
    });

    it('shows a dot on Child Essentials (More on phones) when the co-parent updated a shared detail', async () => {
      const body = await open('/');
      expect(body.querySelector('.dot')).toBeNull();

      TestBed.inject(EssentialsUpdatesStore).view.set({ newUpdates: true, sections: [] });
      TestBed.tick();

      const essentials = body.querySelector('nav.sidenav a[href="/child-essentials"]')!;
      expect(essentials.querySelector('.dot')).not.toBeNull();
      expect(essentials.querySelector('.visually-hidden')!.textContent).toBe(', updated by your co-parent');
      const more = body.querySelector('nav.bottomnav a[href="/more"]')!;
      expect(more.querySelector('.dot')).not.toBeNull();
      expect(more.querySelector('.visually-hidden')!.textContent).toBe(', Child Essentials updated');
      expect(await axeViolations(body)).toEqual([]);
    });

    it('announces what needs attention from More in both supported languages', async () => {
      const body = await open('/');
      const more = body.querySelector('nav.bottomnav a[href="/more"]')!;
      const records = TestBed.inject(SharedRecordsAttentionStore);
      const locale = TestBed.inject(LocaleService);
      const originalLocale = locale.locale();

      expect(more.querySelector('.visually-hidden')).toBeNull();
      try {
        records.count.set(1);
        locale.setLocale('en');
        TestBed.tick();
        expect(more.querySelector('.dot')).not.toBeNull();
        expect(more.querySelector('.visually-hidden')?.textContent).toBe(', Shared records waiting on your response');

        locale.setLocale('es-419');
        TestBed.tick();
        expect(more.querySelector('.visually-hidden')?.textContent).toBe(', Registros compartidos pendientes de tu respuesta');

        records.count.set(0);
        TestBed.tick();
        expect(more.querySelector('.visually-hidden')).toBeNull();
        expect(more.querySelector('.dot')).toBeNull();
      } finally {
        locale.setLocale(originalLocale);
      }
    });

    it.each(['/', '/calendar', '/settings', '/more', '/messages'])('has no automatically detectable accessibility issues at %s', async (url) => {
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
