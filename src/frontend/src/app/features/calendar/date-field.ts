import { ChangeDetectionStrategy, Component, ElementRef, afterRenderEffect, inject, input, viewChild } from '@angular/core';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { DOCUMENT } from '@angular/common';
import { MatDatepicker, MatDatepickerModule } from '@angular/material/datepicker';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { Icon } from '../../shared/icon/icon';
import { CalendarHeader } from './calendar-header';

/**
 * One date of an event's range, as its own field (#249, owner decision October 23, 2026): a bordered field whose
 * whole area opens that date's calendar. Its text is display-only (no typing, and no phone keyboard), so a date is
 * only ever chosen in the calendar. Choosing a day sets this date alone and closes the calendar; nothing else opens.
 * The calendar icon is decoration, part of the same field. An invalid date shows red, with its reason for screen
 * readers only (#248), and focus returns to the field when the calendar closes.
 */
@Component({
  selector: 'app-date-field',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule, MatFormFieldModule, MatInputModule, MatDatepickerModule, Icon],
  template: `
    <mat-form-field appearance="outline" subscriptSizing="dynamic" class="date-field" (click)="openFromField($event, picker)">
      <mat-label>{{ label() }}</mat-label>
      <input
        matInput
        readonly
        inputmode="none"
        aria-haspopup="dialog"
        [id]="inputId()"
        [name]="name()"
        [formControl]="control()"
        [matDatepicker]="picker"
        [matDatepickerFilter]="dateFilter()"
        #dateInput
        [class.date-invalid]="!!issue()"
        (keydown)="openOnKey($event, picker)"
        (dateChange)="closeAfterSelection(picker)"
      />
      <app-icon matSuffix class="date-field__icon" name="calendar" [size]="20" aria-hidden="true" />
      @if (issue(); as reason) {
        <mat-hint class="visually-hidden">{{ reason }}</mat-hint>
      }
      <mat-datepicker #picker [startAt]="startAt()" [calendarHeaderComponent]="calendarHeader" />
    </mat-form-field>
  `,
  styles: `
    :host {
      display: block;
      min-width: 0;
    }
    .date-field {
      width: 100%;
      cursor: pointer;
    }
    input {
      cursor: pointer;
      caret-color: transparent;
    }
    .date-field__icon {
      margin-inline-end: 8px;
      color: var(--color-text-secondary);
    }
    @media (max-width: 359px) {
      .date-field__icon {
        margin-inline-end: 4px;
      }
    }
  `,
})
export class DateField {
  private readonly document = inject(DOCUMENT);
  private readonly pendingClose = new WeakSet<Element>();
  protected readonly calendarHeader = CalendarHeader;
  readonly label = input.required<string>();
  /** The field's name, for forms and tests ("startDate"). */
  readonly name = input.required<string>();
  /** The input's id (the host keeps none, so the id is unique). */
  readonly inputId = input.required<string>();
  readonly control = input.required<FormControl<string>>();
  /** The days the calendar offers (only past days are disabled, #248). */
  readonly dateFilter = input.required<(day: string | null) => boolean>();
  /** Where an empty field's calendar opens: End opens at the start's month, not today's. */
  readonly startAt = input<string | null>(null);
  /** Why the date is invalid, for screen readers; null when it's fine. */
  readonly issue = input<string | null>(null);

  private readonly dateInput = viewChild.required<ElementRef<HTMLInputElement>>('dateInput');

  constructor() {
    // aria-invalid is set after rendering: Material's input sets its own value ("false") when it's created, which
    // would otherwise hide a date that's already invalid when the field appears (Swap going back to its dates).
    afterRenderEffect(() => {
      this.dateInput().nativeElement.setAttribute('aria-invalid', String(!!this.issue()));
    });
  }

  /** Enter, Space or Alt+Down opens the calendar, as a tap does. */
  protected openOnKey(event: KeyboardEvent, picker: MatDatepicker<string>): void {
    if (event.key === 'Enter' || event.key === ' ' || (event.altKey && event.key === 'ArrowDown')) {
      event.preventDefault();
      picker.open();
    }
  }

  protected openFromField(event: MouseEvent, picker: MatDatepicker<string>): void {
    // A selection belongs to the calendar. It must not bubble into the field and reopen the closed picker.
    if (event.composedPath().some(node => node instanceof Element && node.tagName.toLowerCase() === 'mat-calendar')) {
      return;
    }
    picker.open();
  }

  protected closeAfterSelection(picker: MatDatepicker<string>): void {
    // Material ignores close() during its opening animation. A fast keyboard selection still changes the date,
    // so finish closing after that animation's end handler has run. Keep normal animation and focus restoration.
    const content = this.document.getElementById(picker.id)?.closest('mat-datepicker-content');
    if (content && !this.pendingClose.has(content) && content.getAnimations().some(animation => animation.playState === 'running')) {
      this.pendingClose.add(content);
      const finish = (event: Event) => {
        if (event.target !== content) return;
        content.removeEventListener('animationend', finish);
        this.pendingClose.delete(content);
        picker.close();
      };
      content.addEventListener('animationend', finish);
    }
    picker.close();
  }

}
