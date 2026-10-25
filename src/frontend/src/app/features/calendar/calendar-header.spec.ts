import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { CalendarHeader } from './calendar-header';
import { providePlainDates } from './plain-dates';

@Component({
  imports: [MatDatepickerModule],
  providers: [providePlainDates()],
  template: '<mat-calendar [headerComponent]="header" startAt="2026-10-27" />',
})
class Host {
  readonly header = CalendarHeader;
}

describe('Calendar period label (#279)', () => {
  beforeEach(() => {
    const noop = () => undefined;
    vi.stubGlobal('matchMedia', (query: string) => ({
      matches: false, media: query, onchange: null,
      addListener: noop, removeListener: noop, addEventListener: noop, removeEventListener: noop,
      dispatchEvent: () => false,
    }));
  });
  afterEach(() => vi.unstubAllGlobals());

  it('includes the visible period and Material action while navigating months and changing views', async () => {
    const fixture = TestBed.createComponent(Host);
    const settle = async () => { fixture.detectChanges(); await fixture.whenStable(); fixture.detectChanges(); };
    await settle();
    const button = () => fixture.nativeElement.querySelector('.mat-calendar-period-button') as HTMLButtonElement;
    const expectLabel = () => {
      expect(button().getAttribute('aria-label')).toContain(button().textContent!.trim());
      expect(button().getAttribute('aria-describedby')).toBeTruthy();
    };
    expect(button().textContent).toContain('OCT 2026');
    expectLabel();
    (fixture.nativeElement.querySelector('.mat-calendar-next-button') as HTMLButtonElement).click();
    await settle();
    expect(button().textContent).toContain('NOV 2026');
    expectLabel();
    button().click();
    await settle();
    expectLabel();
    expect(fixture.nativeElement.querySelector('mat-multi-year-view')).not.toBeNull();
  });
});
