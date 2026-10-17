import { ChangeDetectionStrategy, Component, input } from '@angular/core';

/**
 * Gentle organic leaves from the approved dashboard: decoration only (hidden from assistive technology), kept
 * outside text and task areas, in sage and soft gold. Not part of the logo.
 */
@Component({
  selector: 'app-leaves',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { 'aria-hidden': 'true', '[class]': '"leaves leaves--" + variant()' },
  template: `
    <svg viewBox="0 0 160 200" focusable="false">
      <path class="stem" d="M30 200 C 40 150 60 110 100 70" />
      <path class="leaf a" d="M52 150 C 20 140 10 110 18 92 C 40 98 58 120 52 150 z" />
      <path class="leaf b" d="M66 118 C 74 88 98 72 120 74 C 116 98 92 116 66 118 z" />
      <path class="leaf c" d="M80 100 C 60 76 62 50 74 36 C 92 52 94 80 80 100 z" />
      <path class="leaf d" d="M96 74 C 112 52 136 46 152 54 C 140 74 118 82 96 74 z" />
    </svg>
  `,
  styles: `
    :host {
      display: block;
      pointer-events: none;
    }
    svg {
      width: 100%;
      height: 100%;
    }
    .stem {
      fill: none;
      stroke: var(--color-leaf-strong);
      stroke-width: 2;
      opacity: 0.5;
    }
    .leaf {
      fill: var(--color-leaf);
    }
    .leaf.b,
    .leaf.d {
      fill: var(--color-leaf-strong);
      opacity: 0.55;
    }
    .leaf.c {
      fill: var(--color-leaf-gold);
      opacity: 0.6;
    }
    @media (forced-colors: active) {
      :host {
        display: none;
      }
    }
  `,
})
export class Leaves {
  readonly variant = input<'sidebar' | 'header'>('sidebar');
}
