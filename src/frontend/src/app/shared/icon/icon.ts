import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

/** Simple outline icons drawn on a 24px grid. Self-hosted: no icon font or third-party request. */
const PATHS = {
  home: 'M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z',
  calendar: 'M4 6h16v14H4z M4 10h16 M8 3v4 M16 3v4',
  image: 'M4 5h16v14H4z M4 16l5-5 4 4 3-3 4 4 M15.5 9.5h.01',
  approvals: 'M12 3a9 9 0 1 0 0 18a9 9 0 0 0 0-18z M8 12l3 3 5-6',
  more: 'M5 12h.01 M12 12h.01 M19 12h.01',
  children: 'M9 11a3 3 0 1 0 0-6a3 3 0 0 0 0 6z M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6 M16 5.5a2.5 2.5 0 0 1 0 5 M21 20c0-2.6-1.7-4.8-4-5.6',
  messages: 'M4 5h16v11H9l-5 4z',
  settings: 'M4 7h9 M17 7h3 M15 5v4 M4 17h3 M11 17h9 M9 15v4',
  palette: 'M12 3a9 9 0 0 0 0 18c1 0 1.6-.8 1.6-1.6c0-1.2-1-1.4-1-2.4c0-.8.7-1.5 1.5-1.5H17a4 4 0 0 0 4-4c0-4.7-4-8.5-9-8.5z M7.5 11h.01 M10 7h.01 M14.5 7h.01',
  book: 'M5 4h11a3 3 0 0 1 3 3v13H8a3 3 0 0 1-3-3z M5 17a3 3 0 0 1 3-3h11',
  star: 'M12 3l2.6 5.6 6.1.7-4.5 4.1 1.2 6-5.4-3-5.4 3 1.2-6-4.5-4.1 6.1-.7z',
  leaf: 'M5 19c0-8 6-14 15-14c0 9-6 15-14 15 M5 19l7-7',
} as const;

export type IconName = keyof typeof PATHS;

@Component({
  selector: 'app-icon',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { 'aria-hidden': 'true', class: 'app-icon' },
  template: `
    <svg viewBox="0 0 24 24" [attr.width]="size()" [attr.height]="size()" focusable="false">
      <path [attr.d]="path()" />
    </svg>
  `,
  styles: `
    :host {
      display: inline-flex;
      flex: none;
    }
    svg {
      fill: none;
      stroke: currentColor;
      stroke-width: 1.8;
      stroke-linecap: round;
      stroke-linejoin: round;
    }
  `,
})
export class Icon {
  readonly name = input.required<IconName>();
  readonly size = input(24);
  protected readonly path = computed(() => PATHS[this.name()]);
}
