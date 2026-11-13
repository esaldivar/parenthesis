import { Component, ElementRef, afterEveryRender, inject, viewChild } from '@angular/core';
import { MatCalendarHeader } from '@angular/material/datepicker';

/** Keep Material's header and behavior; include its visible period in the view-switch button's name (#279). */
@Component({
  selector: 'app-calendar-header',
  imports: [MatCalendarHeader],
  template: '<mat-calendar-header />',
})
export class CalendarHeader {
  private readonly element = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly header = viewChild.required(MatCalendarHeader);

  constructor() {
    // Material updates its label when the active month/view changes. Apply the visible text after each render,
    // retaining its action label, live description, navigation, focus and default styles.
    afterEveryRender({ write: () => {
      const header = this.header();
      this.element.nativeElement.querySelector<HTMLButtonElement>('.mat-calendar-period-button')
        ?.setAttribute('aria-label', `${header.periodButtonText}: ${header.periodButtonLabel}`);
    } });
  }
}
