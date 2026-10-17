import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

/**
 * The Parenthesis logo (docs/design/BRANDING.md): two parenthesis-shaped caregivers, one muted blue and one sage,
 * embracing an abstract coral child, with the two-tone wordmark. The geometry follows the provisional concept in
 * docs/design/assets/parenthesis-logo-concept.svg and will be swapped for the final artwork once it's approved.
 *
 * The child has no skin tone, hair or gender cues, and the two colours mean "two equal caregivers", never a
 * particular parent, role or custody arrangement.
 */
@Component({
  selector: 'app-logo',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'logo',
    '[attr.role]': 'decorative() ? null : "img"',
    '[attr.aria-label]': 'decorative() ? null : "Parenthesis"',
    '[attr.aria-hidden]': 'decorative() ? "true" : null',
  },
  template: `
    <svg
      class="logo__mark"
      viewBox="1 -6 122 122"
      [attr.width]="markSize()"
      [attr.height]="markSize()"
      aria-hidden="true"
      focusable="false"
    >
      <g fill="none" stroke-linecap="round">
        <path class="caregiver caregiver--blue" d="M36 18 C10 37 10 73 36 94" />
        <path class="caregiver caregiver--sage" d="M87 18 C113 37 113 73 87 94" />
        <circle class="child" cx="61" cy="47" r="12" />
        <path class="child-arms" d="M39 67 Q61 101 83 67" />
        <path class="smile" d="M56 48 Q61 53 66 48" />
        @if (showRays()) {
          <path class="rays" d="M61 18 v-6 M45 22 l-4 -5 M77 22 l4 -5" />
        }
      </g>
    </svg>
    @if (variant() === 'full') {
      <span class="logo__wordmark"><span class="parent">Parent</span><span class="hesis">hesis</span></span>
    }
  `,
  styles: `
    :host {
      display: inline-flex;
      align-items: center;
      gap: 0.5em;
      line-height: 1;
    }
    .logo__mark {
      flex: none;
    }
    .caregiver {
      stroke-width: 12;
    }
    .caregiver--blue {
      stroke: var(--brand-blue);
    }
    .caregiver--sage {
      stroke: var(--brand-sage);
    }
    .child {
      fill: var(--brand-coral);
    }
    .child-arms {
      stroke: var(--brand-coral);
      stroke-width: 11;
    }
    .smile {
      stroke: var(--brand-on-coral);
      stroke-width: 2.5;
    }
    .rays {
      stroke: var(--brand-gold);
      stroke-width: 4;
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
    // High contrast: one-colour logo in the system text colour.
    @media (forced-colors: active) {
      .caregiver,
      .child-arms,
      .rays {
        stroke: CanvasText;
      }
      .child {
        fill: CanvasText;
      }
      .smile {
        stroke: Canvas;
      }
      .parent,
      .hesis {
        color: CanvasText;
      }
    }
  `,
})
export class Logo {
  /** "full" is icon + wordmark (desktop headers); "mark" is the icon alone (compact spaces). */
  readonly variant = input<'full' | 'mark'>('full');
  readonly markSize = input(32);
  /** Hide from assistive technology when nearby text already names the link. */
  readonly decorative = input(false);

  /** The golden rays are dropped at very small sizes, where they hurt clarity (BRANDING.md). */
  protected readonly showRays = computed(() => this.markSize() >= 24);
}
