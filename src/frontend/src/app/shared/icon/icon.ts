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
  // A proper gear (approved dashboard spec).
  settings:
    'M12 15a3 3 0 1 0 0-6a3 3 0 0 0 0 6z M19.4 13a7.6 7.6 0 0 0 0-2l2-1.6-2-3.4-2.4 1a7.6 7.6 0 0 0-1.7-1L14.9 3.5h-3.8l-.4 2.5a7.6 7.6 0 0 0-1.7 1l-2.4-1-2 3.4 2 1.6a7.6 7.6 0 0 0 0 2l-2 1.6 2 3.4 2.4-1a7.6 7.6 0 0 0 1.7 1l.4 2.5h3.8l.4-2.5a7.6 7.6 0 0 0 1.7-1l2.4 1 2-3.4z',
  pencil: 'M4 20l4-1 11-11-3-3L5 16z M14 7l3 3',
  album: 'M3 6h14v13H3z M7 3h14v13 M3 15l4-4 3 3 2-2 5 5 M12.5 9.5h.01',
  car: 'M3 13l2-5h14l2 5v5h-3v-2H6v2H3z M3 13h18 M7 15.5h.01 M17 15.5h.01',
  tooth: 'M7 3C4.5 3 3 5 3 7.5c0 3 2 4.5 2.5 8 .4 3 1 5.5 2.5 5.5s1.5-3.5 2-5.5c.3-1 1.7-1 2 0 .5 2 .5 5.5 2 5.5s2.1-2.5 2.5-5.5c.5-3.5 2.5-5 2.5-8C19 5 17.5 3 15 3c-2 0-3 1-4 1S9 3 7 3z',
  music: 'M9 18V5l11-2v13 M9 18a3 3 0 1 1-6 0a3 3 0 0 1 6 0z M20 16a3 3 0 1 1-6 0a3 3 0 0 1 6 0z',
  soccer: 'M12 3a9 9 0 1 0 0 18a9 9 0 0 0 0-18z M12 8l3 2.2-1.1 3.6h-3.8L9 10.2z M12 8V4.5 M15 10.2l3.4-1.1 M13.9 13.8l2 3 M10.1 13.8l-2 3 M9 10.2 5.6 9.1',
  plus: 'M12 5v14 M5 12h14',
  close: 'M6 6l12 12 M18 6L6 18',
  check: 'M5 12.5l4.5 4.5L19 7.5',
  'arrow-right': 'M5 12h14 M13 6l6 6-6 6',
  swap: 'M5 8h13 M15 5l3 3-3 3 M19 16H6 M9 13l-3 3 3 3',
  alert: 'M12 3.5l9 16H3z M12 10v4 M12 16.8v.4',
  minus: 'M5 12h14',
  send: 'M21 3 3 10.5l7 3 3 7.5z M21 3 10 13.5',
  // A box with an arrow leaving it: the link opens outside Parenthesis.
  external: 'M14 4h6v6 M20 4l-9 9 M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5',
  link: 'M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1 M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1',
  block: 'M12 3a9 9 0 1 0 0 18a9 9 0 0 0 0-18z M5.6 5.6l12.8 12.8',
  bell: 'M6 16V11a6 6 0 0 1 12 0v5l1.5 2h-15z M10 20a2 2 0 0 0 4 0',
  note: 'M5 3h10l4 4v14H5z M15 3v4h4 M8 12h8 M8 16h6',
  'chevron-left': 'M15 6l-6 6 6 6',
  'chevron-right': 'M9 6l6 6-6 6',
  'chevron-down': 'M6 9l6 6 6-6',
  'chevron-up': 'M6 15l6-6 6 6',
  filter: 'M4 5h16l-6 7.5V18l-4 2v-7.5z',
  search: 'M10.5 4a6.5 6.5 0 1 0 0 13a6.5 6.5 0 0 0 0-13z M15.3 15.3 20 20',
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
