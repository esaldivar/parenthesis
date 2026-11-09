import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { Child } from '../../core/api/api';
import { TranslatePipe } from '../../core/i18n/translations';

@Component({
  selector: 'app-calendar-note-children',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatButtonModule, MatCheckboxModule, TranslatePipe],
  template: `
    <fieldset [attr.aria-describedby]="error() ? 'calendar-note-children-error' : null">
      <legend>{{ 'feature.about.optional' | tr }}</legend>
      <button mat-stroked-button type="button" [attr.aria-pressed]="selected().length === 0" (click)="changed.emit([])">
        {{ 'feature.no.one.in.particular' | tr }}
      </button>
      @if (children().length > 0) {
        <mat-checkbox
          [checked]="allSelected()"
          [indeterminate]="someSelected() && !allSelected()"
          (change)="changed.emit($event.checked ? childIds() : [])"
        >{{ 'feature.all' | tr }}</mat-checkbox>
        @for (child of children(); track child.id) {
          <mat-checkbox [checked]="selected().includes(child.id)" (change)="toggle(child.id, $event.checked)">
            {{ child.firstName }}
          </mat-checkbox>
        }
      }
      @if (error(); as message) {
        <p id="calendar-note-children-error" class="field-error" role="alert">{{ message }}</p>
      }
    </fieldset>
  `,
  styles: `
    fieldset {
      display: grid;
      justify-items: start;
      gap: var(--space-1);
      min-inline-size: 0;
      margin: 0;
      padding: var(--space-2);
      border: 1px solid var(--color-outline);
      border-radius: var(--radius-control);
    }
    button {
      min-height: var(--target-min);
    }
    button[aria-pressed='true'] {
      background: var(--color-selected);
    }
    p {
      margin: 0;
      color: var(--color-danger);
    }
  `,
})
export class CalendarNoteChildren {
  readonly children = input.required<readonly Child[]>();
  readonly selected = input.required<readonly string[]>();
  readonly error = input<string | null>(null);
  readonly changed = output<string[]>();

  protected readonly childIds = computed(() => this.children().map(child => child.id));
  protected readonly allSelected = computed(() => this.childIds().every(id => this.selected().includes(id)));
  protected readonly someSelected = computed(() => this.childIds().some(id => this.selected().includes(id)));

  protected toggle(id: string, checked: boolean): void {
    const selected = this.selected();
    this.changed.emit(checked ? [...selected, id] : selected.filter(child => child !== id));
  }
}
