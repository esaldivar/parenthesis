import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { ChildRef } from './model';

/**
 * Children's avatars side by side. Abstract initials on a neutral fill: no photos, skin tones or gender cues, and
 * no per-child colour coding. Decorative, because the children's names always appear as text next to them; when
 * space is tight, it shows the first few and "+N".
 */
@Component({
  selector: 'app-child-avatars',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { 'aria-hidden': 'true' },
  template: `
    @for (child of shown(); track child.id) {
      <span class="avatar">{{ child.name.charAt(0) }}</span>
    }
    @if (hidden() > 0) {
      <span class="avatar more">+{{ hidden() }}</span>
    }
  `,
  styles: `
    :host {
      display: inline-flex;
      flex: none;
    }
    .avatar {
      display: inline-grid;
      place-items: center;
      width: 32px;
      height: 32px;
      margin-inline-start: -6px;
      border-radius: 50%;
      border: 2px solid var(--color-surface);
      background: var(--color-surface-soft);
      color: var(--color-text);
      font-weight: 700;
      font-size: 0.875rem;
    }
    .avatar:first-child {
      margin-inline-start: 0;
    }
    .more {
      font-size: 0.75rem;
    }
  `,
})
export class ChildAvatars {
  readonly children = input.required<readonly ChildRef[]>();
  readonly max = input(3);

  protected readonly shown = computed(() =>
    this.children().length > this.max() ? this.children().slice(0, this.max() - 1) : this.children(),
  );
  protected readonly hidden = computed(() => this.children().length - this.shown().length);
}
