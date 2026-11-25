import { TestBed } from '@angular/core/testing';
import { CalendarMonth } from './calendar-month.component';

describe('Calendar Month agenda', () => {
  it('reveals the selected day above navigation without moving keyboard focus off its date', async () => {
    const fixture = TestBed.createComponent(CalendarMonth);
    fixture.componentRef.setInput('date', '2026-11-24');
    fixture.componentRef.setInput('today', '2026-11-24');
    fixture.componentRef.setInput('items', []);
    const host: HTMLElement = fixture.nativeElement;
    vi.spyOn(host, 'getBoundingClientRect').mockReturnValue(new DOMRect(0, 0, 288, 400));
    fixture.detectChanges();
    await fixture.whenStable();

    const day = host.querySelector<HTMLButtonElement>('.day__number')!;
    const agenda = host.querySelector<HTMLElement>('.agenda')!;
    agenda.scrollIntoView = vi.fn();
    agenda.scrollTop = 100;
    day.focus();

    day.click();
    await fixture.whenStable();

    expect(day.getAttribute('aria-pressed')).toBe('true');
    expect(agenda.scrollTop).toBe(0);
    expect(agenda.scrollIntoView).toHaveBeenCalledWith({ block: 'nearest' });
    expect(document.activeElement).toBe(day);
  });
});
