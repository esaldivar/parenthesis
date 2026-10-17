import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

/**
 * A person's avatar. Until people can upload their own pictures, this is an initial on a neutral fill: no stock or
 * generated faces, skin tones or gender cues (approved photo avatars are pending; see the PR notes). Parents and
 * children differ by a ring and by the text label next to them, never by colour alone.
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
    '[style.--size.px]': 'size()',
  },
  template: `{{ initial() }}`,
  styles: `
    :host {
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
  `,
})
export class Avatar {
  readonly name = input.required<string>();
  readonly kind = input<'parent' | 'child'>('child');
  readonly size = input(32);
  protected readonly initial = computed(() => this.name().trim().charAt(0).toUpperCase());
}
