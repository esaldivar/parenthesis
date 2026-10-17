import { ChangeDetectionStrategy, Component, input } from '@angular/core';

/**
 * Parenthesis brand slot — LOGO ASSET PENDING.
 *
 * The brand is locked (docs/design/BRANDING.md): the approved artwork is Variation 1 (Default) icon + Option B
 * wordmark on the original board at docs/design/assets/F61791C0-BC62-4584-9C48-B5E8CA9A7BFE.jpeg. Production
 * exports aren't in the repository yet, and the rules forbid redrawing or approximating the icon, so until they are
 * this renders only the product name as text in the Option B colours (sage "Parent", charcoal "hesis"; ivory in
 * dark mode) — an explicit asset-pending state rather than a visually incorrect substitute.
 *
 * When verified exports land, render them here; every screen uses this component.
 */
@Component({
  selector: 'app-logo',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'logo',
    'data-asset-status': 'pending',
    '[attr.role]': 'decorative() ? null : "img"',
    '[attr.aria-label]': 'decorative() ? null : "Parenthesis"',
    '[attr.aria-hidden]': 'decorative() ? "true" : null',
  },
  template: `<span class="logo__wordmark"><span class="parent">Parent</span><span class="hesis">hesis</span></span>`,
  styles: `
    :host {
      display: inline-flex;
      align-items: center;
      line-height: 1;
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
