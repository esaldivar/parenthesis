import { CalendarPalette } from './calendar-palette';
import { A11yModule } from '@angular/cdk/a11y';
import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { Icon } from '../../shared/icon/icon';
import { CalendarFilters, DIMENSIONS, Dimension } from './calendar-filters';

/**
 * The Filters panel (#190): a popover on wide screens and a bottom sheet on phones, with the same choices. Changes
 * apply at once; Done closes it and returns focus to the Filters button (the page does that). Only this parent's view
 * changes. The child filter stays on the page itself.
 */
@Component({
  selector: 'app-calendar-filter-panel',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CalendarPalette, A11yModule, MatButtonModule, Icon],
  host: { '(keydown.escape)': 'closed.emit()' },
  template: `
    <div class="backdrop" (click)="closed.emit()" aria-hidden="true"></div>
    <section
      class="sheet"
      role="dialog"
      aria-modal="true"
      aria-labelledby="filters-title"
      cdkTrapFocus
      [cdkTrapFocusAutoCapture]="true"
    >
      <header class="sheet__head">
        <h2 id="filters-title" tabindex="-1" cdkFocusInitial>Filters</h2>
        <button mat-icon-button type="button" (click)="closed.emit()" aria-label="Close filters">
          <app-icon name="close" />
        </button>
      </header>
      <p class="sheet__note">Only your view changes. Your co-parent’s calendar, approvals and conflict checks stay the same.</p>
      @for (dimension of dimensions; track dimension.id) {
        <fieldset>
          <legend>{{ dimension.label }}</legend>
          @if (dimension.id === 'approval') {
            <p class="hint">Tasks and reminders have no approval, so they show only when all three are ticked.</p>
          }
          @for (option of dimension.options; track option.id) {
            <label>
              <input
                type="checkbox"
                [checked]="isChecked(dimension.id, option.id)"
                (change)="toggle(dimension.id, option.id, $any($event.target).checked)"
              />
              @if (dimension.id === 'types') {
                @if (option.id === 'parenting') {
                  <span appCalendarPalette="parent-a" aria-hidden="true" style="display:inline-block;width:16px;height:16px;border-radius:4px"></span>
                  <span appCalendarPalette="parent-b" aria-hidden="true" style="display:inline-block;width:16px;height:16px;border-radius:4px"></span>
                } @else {
                  <span [appCalendarPalette]="option.id" aria-hidden="true" style="display:inline-block;width:16px;height:16px;border-radius:4px"></span>
                }
              }
              {{ option.label }}
            </label>
          }
        </fieldset>
      }
      <div class="sheet__actions">
        <button mat-flat-button type="button" (click)="closed.emit()">Done</button>
        <button mat-stroked-button type="button" (click)="resetAll.emit()">Reset filters</button>
      </div>
    </section>
  `,
  styleUrl: './calendar-filter-panel.scss',
})
export class CalendarFilterPanel {
  readonly filters = input.required<CalendarFilters>();
  readonly changed = output<CalendarFilters>();
  readonly resetAll = output();
  readonly closed = output();

  protected readonly dimensions = DIMENSIONS;

  protected isChecked(dimension: Dimension, option: string): boolean {
    return (this.filters()[dimension] as readonly string[]).includes(option);
  }

  protected toggle(dimension: Dimension, option: string, checked: boolean): void {
    const all = DIMENSIONS.find((d) => d.id === dimension)!.options.map((o) => o.id);
    const current = this.filters()[dimension] as readonly string[];
    // Keep the options in their listed order, whatever order they were ticked in.
    const next = all.filter((id) => (id === option ? checked : current.includes(id)));
    this.changed.emit({ ...this.filters(), [dimension]: next });
  }
}
