import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { EventThemesService } from '../../core/theme/event-themes.service';
import { CalendarPaletteKey } from './calendar-palette';
import { EventTheme, eventTheme } from './event-theme';

const POSITION: Record<EventTheme, string> = {
  party: '0% 14%', meals: '33.333333% 14%', sports: '66.666667% 14%', holiday: '100% 14%',
  travel: '0% 50%', beach: '33.333333% 50%', camping: '66.666667% 50%', school: '100% 50%',
  arts: '0% 86%', outings: '33.333333% 86%', nature: '66.666667% 86%',
};

/** Purely decorative, local title matching; never receives private notes or location. */
@Component({
  selector: 'app-event-decoration',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { 'aria-hidden': 'true', '[attr.data-theme-motif]': 'theme()' },
  template: `
    @if (theme(); as theme) {
      <span class="art" [style.mask-position]="position()" [style.background-color]="color()"></span>
    }
  `,
  styles: `
    :host { position: absolute; inset: 0; overflow: hidden; pointer-events: none; z-index: 0; }
    .art {
      position: absolute; inset: 0; opacity: .16;
      mask-image: url('/art/event-themes/illustrations.png');
      mask-size: 400% 372%; mask-repeat: no-repeat;
    }
    @media (forced-colors: active) { :host { display: none; } }
    @media print { :host { display: none; } }
  `,
})
export class EventDecoration {
  private readonly preferences = inject(EventThemesService);
  readonly title = input.required<string>();
  readonly palette = input.required<CalendarPaletteKey>();
  readonly allowed = input(true);
  protected readonly theme = computed(() => this.allowed() && this.preferences.enabled() ? eventTheme(this.title()) : null);
  protected readonly position = computed(() => { const theme = this.theme(); return theme ? POSITION[theme] : null; });
  protected readonly color = computed(() => `var(--color-calendar-${this.palette() === 'event' ? 'family' : this.palette()}-fg, var(--color-text-secondary))`);
}
