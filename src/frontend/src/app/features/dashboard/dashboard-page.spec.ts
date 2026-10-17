import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { axeViolations } from '../../../testing/axe';
import { fakeAuth } from '../../../testing/fake-auth';
import { LiveDashboardDataSource } from './dashboard-data';
import { DashboardPage, NOW } from './dashboard-page';

// Friday, October 16, 2026, 9:00 AM in the fake family's time zone (America/Chicago).
const FRIDAY_MORNING = new Date('2026-10-16T14:00:00Z');

describe('DashboardPage', () => {
  async function render(options: { sample?: boolean; failingSource?: boolean } = {}) {
    TestBed.configureTestingModule({
      providers: [provideRouter([]), fakeAuth(), { provide: NOW, useValue: () => FRIDAY_MORNING }],
    });
    let calls = 0;
    if (options.failingSource) {
      TestBed.overrideProvider(LiveDashboardDataSource, {
        useValue: { load: () => (++calls, Promise.reject(new Error('offline'))) },
      });
    }
    const fixture = TestBed.createComponent(DashboardPage);
    if (options.sample) {
      fixture.componentRef.setInput('sample', '1');
    }
    await settle(fixture);
    const el = fixture.nativeElement as HTMLElement;
    return { fixture, el, calls: () => calls };
  }

  async function settle(fixture: { whenStable(): Promise<unknown>; detectChanges(): void }) {
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  }

  const text = (el: Element | null) => el?.textContent?.replace(/\s+/g, ' ').trim() ?? '';
  const button = (el: HTMLElement, label: string | RegExp) =>
    [...el.querySelectorAll('button')].find((b) =>
      typeof label === 'string' ? text(b) === label || b.getAttribute('aria-label') === label : label.test(text(b)),
    )!;

  describe('live (no calendar API yet)', () => {
    it('greets the parent by first name in the family’s time of day', async () => {
      const { el } = await render();

      expect(text(el.querySelector('h1'))).toBe('Good morning, Alex');
      expect(text(el.querySelector('.welcome__date'))).toBe('Friday, October 16 · Rivera Family');
    });

    it('opens on the current week with today marked', async () => {
      const { el } = await render();

      expect(text(el.querySelector('#week-heading'))).toBe('This week');
      expect(text(el.querySelector('.week__label'))).toBe('Oct 12 – 18, 2026');
      expect(text(el.querySelector('[aria-current="date"]'))).toContain('Friday, October 16');
    });

    it('is honest that there is no schedule yet: no blocks, no sample data', async () => {
      const { el } = await render();

      expect(text(el)).toContain('The shared calendar isn’t available yet');
      expect(el.querySelector('.blocks, .proposals, .sample-banner')).toBeNull();
      expect(text(el.querySelector('.area-review'))).toContain('Approvals aren’t available yet');
    });

    it('offers View month in one step, and an unavailable (not fake) Propose an event', async () => {
      const { el } = await render();

      const month = [...el.querySelectorAll('a')].find((a) => text(a) === 'View month')!;
      expect(month.getAttribute('href')).toBe('/calendar?view=month');
      const propose = button(el, 'Propose an event');
      expect(propose.getAttribute('aria-disabled')).toBe('true');
      expect(text(el.querySelector(`#${propose.getAttribute('aria-describedby')}`))).toContain('opens with the shared calendar');
    });

    it('moves between weeks and back to this week', async () => {
      const { fixture, el } = await render();

      button(el, 'Next week').click();
      await settle(fixture);
      expect(text(el.querySelector('.week__label'))).toBe('Oct 19 – 25, 2026');
      expect(text(el.querySelector('#week-heading'))).toBe('Week');
      expect(el.querySelector('[aria-current="date"]')).toBeNull();

      button(el, 'This week').click();
      await settle(fixture);
      expect(text(el.querySelector('.week__label'))).toBe('Oct 12 – 18, 2026');

      button(el, 'Previous week').click();
      await settle(fixture);
      expect(text(el.querySelector('.week__label'))).toBe('Oct 5 – 11, 2026');
    });

    it('announces the week label politely to screen readers', async () => {
      const { el } = await render();

      expect(el.querySelector('.week__label')!.getAttribute('aria-live')).toBe('polite');
    });

    it('explains a failure and can try again', async () => {
      const { fixture, el, calls } = await render({ failingSource: true });

      expect(text(el.querySelector('[role="alert"]'))).toContain('We couldn’t load this week.');
      button(el, 'Try again').click();
      await settle(fixture);
      expect(calls()).toBe(2);
    });

    it('has no automatically detectable accessibility issues', async () => {
      const { el } = await render();

      expect(await axeViolations(el)).toEqual([]);
    });
  });

  describe('sample preview (development builds only)', () => {
    it('labels the data as a fictional sample', async () => {
      const { el } = await render({ sample: true });

      expect(text(el.querySelector('.sample-banner'))).toContain('Sample data preview');
      expect(text(el.querySelector('.sample-banner'))).toContain('not your family’s schedule');
    });

    it('groups children with the same schedule into one block with both names and the caregiver', async () => {
      const { el } = await render({ sample: true });
      const first = el.querySelector('.blocks > li')!;

      expect(text(first.querySelector('.block__names'))).toBe('Aurora & Kai');
      expect(text(first.querySelector('.block__caregiver'))).toBe('With Jordan');
      expect(first.querySelectorAll('app-child-avatars .avatar').length).toBe(2);
    });

    it('shows separate blocks when the children’s schedules differ', async () => {
      const { el } = await render({ sample: true });
      const names = [...el.querySelectorAll('.blocks .block__names')].map(text);

      expect(names).toEqual(['Aurora & Kai', 'Aurora & Kai', 'Aurora', 'Kai']);
    });

    it('never presents a proposal as confirmed', async () => {
      const { el } = await render({ sample: true });
      const proposal = el.querySelector('.proposals > li')!;

      expect(text(proposal)).toContain('Proposed');
      expect(text(proposal)).not.toContain('Confirmed');
      expect([...el.querySelectorAll('.blocks > li')].some((li) => text(li).includes('Kai With Alex Sat'))).toBe(false);
    });

    it('keeps a confirmed arrangement visible while its change is pending', async () => {
      const { el } = await render({ sample: true });
      const pending = [...el.querySelectorAll('.blocks > li')].find((li) => text(li).includes('Change pending'))!;

      expect(text(pending)).toContain('Confirmed');
      expect(text(pending)).toContain('With Alex');
    });

    it('splits children for this week only, as a reversible view preference', async () => {
      const { fixture, el } = await render({ sample: true });
      const toggle = () => button(el, /children separately|same schedule/);

      expect(toggle().getAttribute('aria-pressed')).toBe('false');
      toggle().click();
      await settle(fixture);
      expect(toggle().getAttribute('aria-pressed')).toBe('true');
      expect(el.querySelectorAll('.blocks > li').length).toBe(6);
      expect(text(el)).toContain('This only changes the view');

      button(el, 'Next week').click();
      await settle(fixture);
      expect(toggle().getAttribute('aria-pressed')).toBe('false');

      button(el, 'This week').click();
      await settle(fixture);
      expect(toggle().getAttribute('aria-pressed')).toBe('false'); // Changing week resets the view.
      expect(el.querySelectorAll('.blocks > li').length).toBe(4);
    });

    it('expands a group to show each child', async () => {
      const { fixture, el } = await render({ sample: true });
      const details = button(el, /^Details/);
      const list = el.querySelector(`#${details.getAttribute('aria-controls')}`)!;

      expect(details.getAttribute('aria-expanded')).toBe('false');
      expect(list.hasAttribute('hidden')).toBe(true);
      details.click();
      await settle(fixture);
      expect(details.getAttribute('aria-expanded')).toBe('true');
      expect([...list.querySelectorAll('li')].map(text)).toEqual([
        expect.stringMatching(/^Kai: with Jordan/),
        expect.stringMatching(/^Aurora: with Jordan/),
      ]);
    });

    it('lists what needs this parent’s review, with a route to approvals', async () => {
      const { el } = await render({ sample: true });
      const review = el.querySelector('.area-review')!;

      expect(text(review)).toContain('1 proposal waiting for your answer');
      expect(review.querySelector('a')!.getAttribute('href')).toBe('/approvals');
    });

    it('shows the next confirmed handoff without inventing a location', async () => {
      const { el } = await render({ sample: true });
      const card = el.querySelector('.area-handoff')!;
      const handoff = text(card);
      const people = [...card.querySelectorAll('.handoff')].map((li) => `${text(li.querySelector('.handoff__names'))} ${text(li.querySelector('.handoff__names + p'))}`);

      // At 9 AM Friday the next handoff is 3 PM, when Aurora stays with Alex and Kai goes to Jordan: both are shown.
      expect(handoff).toContain('Fri, Oct 16, 3:00 PM');
      expect(people).toEqual(['Aurora With Alex', 'Kai With Jordan']);
      expect(handoff).not.toMatch(/address|location|school/i);
    });

    it('has no automatically detectable accessibility issues', async () => {
      const { el } = await render({ sample: true });

      expect(await axeViolations(el)).toEqual([]);
    });
  });
});
