import { ChangeDetectionStrategy, Component, input } from '@angular/core';

/**
 * A memory's real cover photo with two plain paper sheets behind it, like an album page (#717). The API has one
 * cover per memory, so the sheets are only paper. Decorative: the memory's title names it.
 */
@Component({
  selector: 'app-memory-cover',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { 'aria-hidden': 'true' },
  template: `<img [src]="src()" alt="" [attr.loading]="lazy() ? 'lazy' : null" />`,
  styles: `
    :host {
      --paper: light-dark(#fffdf8, #e9e4d8);
      position: relative;
      display: block;
      margin: 4px 8px 8px 0;
    }
    :host::before,
    :host::after {
      content: '';
      position: absolute;
      inset: 0;
      border-radius: 8px;
      background: var(--paper);
      box-shadow: 0 2px 5px rgb(0 0 0 / 12%);
      transform: translate(6px, 5px) rotate(-5deg);
    }
    :host::after {
      transform: translate(3px, 3px) rotate(4deg);
    }
    img {
      position: relative;
      z-index: 1;
      display: block;
      width: 100%;
      aspect-ratio: 1.39;
      object-fit: cover;
      border: 3px solid #ffffff;
      border-radius: 8px;
      background: var(--color-surface-soft);
      box-shadow: 0 3px 8px rgb(0 0 0 / 16%);
    }
  `,
})
export class MemoryCover {
  readonly src = input.required<string>();
  readonly lazy = input(true);
}

/**
 * How much of a photo's 28 days is left, as a thin coral bar (#717). Decorative: the words beside it say when the
 * photos go.
 */
@Component({
  selector: 'app-time-left',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { 'aria-hidden': 'true' },
  template: `<span [style.width.%]="percent()"></span>`,
  styles: `
    :host {
      display: block;
      width: min(100%, 17.5rem);
      height: 6px;
      border-radius: 3px;
      background: light-dark(#e3eae6, #2c463b);
      overflow: hidden;
    }
    span {
      display: block;
      height: 100%;
      min-width: 6px;
      border-radius: 3px;
      background: light-dark(#e0714f, #f08a6b);
    }
  `,
})
export class TimeLeft {
  /** 0–100. */
  readonly percent = input.required<number>();
}
