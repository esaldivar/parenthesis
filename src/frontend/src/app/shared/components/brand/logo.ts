import { ChangeDetectionStrategy, Component, input } from '@angular/core';

/**
 * Parenthesis brand slot — approved icon + text wordmark (WORDMARK ASSET PENDING).
 *
 * The brand is locked (docs/design/BRANDING.md): Variation 1 (Default) icon + Option B wordmark, from the original
 * board at docs/design/assets/F61791C0-BC62-4584-9C48-B5E8CA9A7BFE.jpeg.
 *
 * - Icon: the user-approved export docs/design/assets/parenthesis-icon.svg, copied unchanged to
 *   public/brand/parenthesis-icon.svg. Never redraw, recolour or edit it.
 * - Wordmark: rendered as text in the Option B colours (sage "Parent", charcoal "hesis"; ivory in dark mode) because
 *   the horizontal lockup exports are defective.
 *
 * TODO(brand): corrected parenthesis-logo-horizontal.svg and parenthesis-logo-horizontal-dark.svg are needed from
 * ChatGPT (the user's asset tool): the exact board artwork, lettering converted to outlines, transparent background,
 * uploaded to docs/design/assets/ on feat/angular-shell. Once they're visually verified against the board, render
 * them here instead of the text wordmark. Every screen uses this component.
 */
@Component({
  selector: 'app-logo',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'logo',
    'data-asset-status': 'wordmark-pending',
    '[attr.role]': 'decorative() ? null : "img"',
    '[attr.aria-label]': 'decorative() ? null : "Parenthesis"',
    '[attr.aria-hidden]': 'decorative() ? "true" : null',
  },
  template: `
    <img class="logo__icon" src="/brand/parenthesis-icon.svg" alt="" width="188" height="174" />
    <span class="logo__wordmark"><span class="parent">Parent</span><span class="hesis">hesis</span></span>
  `,
  styles: `
    :host {
      display: inline-flex;
      align-items: center;
      gap: 0.3em;
      line-height: 1;
    }
    .logo__icon {
      width: auto;
      height: 1.9em;
    }
    .logo__wordmark {
      font-family: var(--font-family);
      font-weight: 700;
      font-size: 1.25em;
      letter-spacing: -0.01em;
      white-space: nowrap;
    }
    .parent {
      color: var(--brand-wordmark-parent);
    }
    .hesis {
      color: var(--brand-wordmark-hesis);
    }
    @media (forced-colors: active) {
      .parent,
      .hesis {
        color: CanvasText;
      }
    }
  `,
})
export class Logo {
  /** Hide from assistive technology when nearby text already names the link. */
  readonly decorative = input(false);
}
