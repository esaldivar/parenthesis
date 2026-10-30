import { ChangeDetectionStrategy, Component, computed, input, signal } from '@angular/core';

/**
 * A person's chosen image, with an initial when absent or unavailable. Calendar images are suppressed in the
 * phone layout (#388); account corners, profile tiles and PIN screens retain images at every width.
 * The caller must supply the image authorized for this viewer; names are never used to resolve private images.
 *
 * Decorative by default because the person's name is always available as text nearby; `label` adds a tooltip.
 */
@Component({
  selector: 'app-avatar',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    'aria-hidden': 'true',
    '[attr.title]': 'name()',
    '[attr.data-kind]': 'kind()',
    '[attr.data-calendar]': 'calendar() ? "true" : null',
    '[style.--size.px]': 'size()',
  },
  template: `
    <ng-container>{{ initial() }}</ng-container>
    @if (image(); as url) {
      <img [src]="url" alt="" (error)="imageFailed(url)" />
    }
  `,
  styles: `
    :host {
      display: inline-grid;
      position: relative;
      place-items: center;
      flex: none;
      width: var(--size);
      height: var(--size);
      border-radius: 50%;
      border: 2px solid var(--color-surface);
      background: var(--color-surface-soft);
      color: var(--color-text);
      font-weight: 700;
      font-size: calc(var(--size) * 0.42);
      line-height: 1;
      user-select: none;
    }
    img {
      position: absolute;
      inset: 0;
      width: 100%;
      height: 100%;
      border-radius: inherit;
      object-fit: cover;
    }
    @media (max-width: 1023px) {
      :host([data-calendar='true']) img {
        display: none;
      }
    }
    :host([data-kind='parent']) {
      background: var(--color-avatar-parent);
      box-shadow: 0 0 0 2px var(--color-outline);
    }
  `,
})
export class Avatar {
  readonly name = input.required<string>();
  readonly kind = input<'parent' | 'child'>('child');
  readonly size = input(32);
  readonly src = input<string | null>(null);
  readonly calendar = input(false);
  private readonly failedSource = signal<string | null>(null);
  protected readonly image = computed(() => this.src() && this.src() !== this.failedSource() ? this.src() : null);
  protected readonly initial = computed(() => this.name().trim().charAt(0).toUpperCase());

  protected imageFailed(url: string): void {
    this.failedSource.set(url);
  }
}
