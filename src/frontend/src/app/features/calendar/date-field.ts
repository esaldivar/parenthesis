import { ChangeDetectionStrategy, Component, ElementRef, afterRenderEffect, input, viewChild } from '@angular/core';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { MatDatepicker, MatDatepickerModule } from '@angular/material/datepicker';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { Icon } from '../../shared/icon/icon';

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
    <mat-form-field appearance="outline" subscriptSizing="dynamic" class="date-field" (click)="picker.open()">
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
      />
      <app-icon matSuffix class="date-field__icon" name="calendar" [size]="20" aria-hidden="true" />
      @if (issue(); as reason) {
        <mat-hint class="visually-hidden">{{ reason }}</mat-hint>
      }
      <mat-datepicker #picker [startAt]="startAt()" />
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
}
