import { TestBed } from '@angular/core/testing';
import { axeViolations } from '../../../testing/axe';
import { ToastHost } from './toast-host';
import { MAX_DURATION, MIN_DURATION, Toasts, toastDuration } from './toasts';

describe('toasts (#226)', () => {
  it('shows short messages for 6 seconds and longer ones a little longer, up to 10', () => {
    expect(toastDuration('“Soccer practice” is on the calendar.')).toBe(MIN_DURATION);
    // 20 words: 8 more than 12, a quarter-second each.
    expect(toastDuration(Array(20).fill('word').join(' '))).toBe(8000);
    expect(toastDuration(Array(60).fill('word').join(' '))).toBe(MAX_DURATION);
  });

  describe('the host', () => {
    let toasts: Toasts;
    let host: HTMLElement;
    let detect: () => void;

    beforeEach(() => {
      vi.useFakeTimers();
      const fixture = TestBed.createComponent(ToastHost);
      toasts = TestBed.inject(Toasts);
      host = fixture.nativeElement as HTMLElement;
      document.body.append(host);
      detect = () => fixture.detectChanges();
      detect();
    });

    afterEach(() => {
      vi.useRealTimers();
      host.remove();
    });

    const shown = () =>
      [...host.querySelectorAll('.toast__message')].map((p) => p.textContent?.trim());

    it('shows each message in one polite live region, without taking focus', () => {
      const before = document.activeElement;
      toasts.show('“Soccer practice” is on the calendar.');
      detect();

      expect(shown()).toEqual(['“Soccer practice” is on the calendar.']);
      expect(host.querySelector('[role="status"][aria-live="polite"] .toast')).not.toBeNull();
      expect(document.activeElement).toBe(before);
    });

    it('leaves after its time', () => {
      toasts.show('Saved.');
      detect();
      vi.advanceTimersByTime(MIN_DURATION - 1);
      detect();
      expect(shown()).toEqual(['Saved.']);

      vi.advanceTimersByTime(1);
      detect();
      expect(shown()).toEqual([]);
    });

    it('pauses while pointed at or focused, and carries on with the time that was left', () => {
      toasts.show('Saved.');
      detect();
      vi.advanceTimersByTime(4000);

      host.dispatchEvent(new MouseEvent('mouseenter'));
      vi.advanceTimersByTime(30000);
      detect();
      expect(shown()).toEqual(['Saved.']);

      host.dispatchEvent(new MouseEvent('mouseleave'));
      host
        .querySelector<HTMLButtonElement>('.toast__close')!
        .dispatchEvent(new FocusEvent('focusin', { bubbles: true }));
      vi.advanceTimersByTime(30000);
      detect();
      expect(shown()).toEqual(['Saved.']);

      host
        .querySelector<HTMLButtonElement>('.toast__close')!
        .dispatchEvent(new FocusEvent('focusout', { bubbles: true }));
      vi.advanceTimersByTime(1999);
      detect();
      expect(shown()).toEqual(['Saved.']);
      vi.advanceTimersByTime(1);
      detect();
      expect(shown()).toEqual([]);
    });

    it('pauses while the tab is hidden', () => {
      toasts.show('Saved.');
      detect();
      const hidden = vi.spyOn(document, 'hidden', 'get').mockReturnValue(true);
      document.dispatchEvent(new Event('visibilitychange'));
      vi.advanceTimersByTime(60000);
      detect();
      expect(shown()).toEqual(['Saved.']);

      hidden.mockReturnValue(false);
      document.dispatchEvent(new Event('visibilitychange'));
      vi.advanceTimersByTime(MIN_DURATION);
      detect();
      expect(shown()).toEqual([]);
    });

    it('closes with its Close button or Escape', () => {
      toasts.show('One.');
      toasts.show('Two.');
      detect();

      const close = host.querySelectorAll<HTMLButtonElement>('.toast__close');
      expect(close[0].getAttribute('aria-label')).toBe('Close notification');
      close[0].click();
      detect();
      expect(shown()).toEqual(['Two.']);

      host
        .querySelector('.toast__close')!
        .dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      detect();
      expect(shown()).toEqual([]);
    });

    it('shows at most three, the oldest leaving first, and doesn’t repeat the same message', () => {
      for (const message of ['One.', 'Two.', 'Three.', 'Four.']) {
        toasts.show(message);
      }
      toasts.show('Four.');
      detect();

      expect(shown()).toEqual(['Two.', 'Three.', 'Four.']);
    });

    it('has no automatically detectable accessibility issues', async () => {
      toasts.show('“Soccer practice” is on the calendar.');
      detect();
      vi.useRealTimers();
      expect(await axeViolations(host)).toEqual([]);
    });
  });
});
