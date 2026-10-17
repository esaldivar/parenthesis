import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { CalendarPage } from './calendar-page';

describe('CalendarPage', () => {
  function render(inputs: Record<string, string>) {
    TestBed.configureTestingModule({ providers: [provideRouter([])] });
    const fixture = TestBed.createComponent(CalendarPage);
    for (const [name, value] of Object.entries(inputs)) {
      fixture.componentRef.setInput(name, value);
    }
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  it('keeps the view and week chosen on the dashboard', () => {
    const el = render({ view: 'month', week: '2026-10-21' });

    expect(el.querySelector('.context')!.textContent!.replace(/\s+/g, ' ').trim()).toBe(
      'Month view · week of Oct 18 – 24, 2026',
    );
    expect(el.querySelector('a')!.getAttribute('href')).toBe('/?week=2026-10-21');
  });

  it('says plainly that the full calendar is not available yet', () => {
    const el = render({ view: 'list' });

    expect(el.textContent).toContain('The full calendar isn’t available yet');
    expect(el.textContent).toContain('List view');
  });

  it('ignores a malformed week', () => {
    const el = render({ week: 'not-a-date' });

    expect(el.querySelector('.context')!.textContent!.trim()).toBe('Week view');
  });
});
