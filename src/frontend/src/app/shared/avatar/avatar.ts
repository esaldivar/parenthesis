import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import { ProfilePhotos } from '../../core/profile-photos/profile-photos';

/**
 * A person's avatar: their profile photo when the viewer has one for them (#388), otherwise an initial on a neutral
 * fill. No stock or generated faces, skin tones or gender cues. Parents and children differ by a ring and by the text
 * label next to them, never by colour alone. The circle's size and ring are the same with or without a photo.
 *
 * Which photo: `src` when given (the picker's and PIN screens' own photos, or a Settings preview); otherwise `personId`
 * looks up the photo this viewer sees for that parent (membership id) or child (child id). `photoOn="desktop"` keeps
 * the initial on phones and tablets (below 1024px), as calendar circles do (owner decision, October 30, 2026).
 * A photo that fails to load falls back to the initial.
 *
 * Decorative: the person's name is always available as text nearby.
 */
@Component({
  selector: 'app-avatar',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    'aria-hidden': 'true',
    '[attr.title]': 'name()',
    '[attr.data-kind]': 'kind()',
    '[attr.data-photo]': 'photo() ? photoOn() : null',
    '[style.--size.px]': 'size()',
  },
  template: `
    {{ initial() }}
    @if (photo(); as url) {
      <img [src]="url" alt="" decoding="async" (error)="failed.set(url)" />
    }
  `,
  styles: `
    :host {
      position: relative;
      display: inline-grid;
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
    :host([data-kind='parent']) {
      background: var(--color-avatar-parent);
      box-shadow: 0 0 0 2px var(--color-outline);
    }
    img {
      position: absolute;
      inset: 0;
      width: 100%;
      height: 100%;
      border-radius: 50%;
      object-fit: cover;
      /* Transparent parts of a photo show the circle's own fill, not the initial underneath. */
      background: inherit;
    }
    /* Calendar circles: photos on desktop only; phones and tablets keep the initial. */
    @media (max-width: 1023.98px) {
      :host([data-photo='desktop']) img {
        display: none;
      }
    }
  `,
})
export class Avatar {
  private readonly photos = inject(ProfilePhotos);

  readonly name = input.required<string>();
  readonly kind = input<'parent' | 'child'>('child');
  readonly size = input(32);
  /** An explicit photo URL. */
  readonly src = input<string | null | undefined>(undefined);
  /** A parent's membership id or a child's id, to show the photo this viewer sees for them. */
  readonly personId = input<string | null | undefined>(undefined);
  /** `desktop`: the photo shows only at 1024px and wider (calendar circles). */
  readonly photoOn = input<'any' | 'desktop'>('any');

  protected readonly initial = computed(() => this.name().trim().charAt(0).toUpperCase());
  protected readonly failed = signal<string | null>(null);
  protected readonly photo = computed(() => {
    const url = this.src() ?? (this.personId() ? this.photos.url(this.kind(), this.personId()) : null);
    return url && url !== this.failed() ? url : null;
  });
}
