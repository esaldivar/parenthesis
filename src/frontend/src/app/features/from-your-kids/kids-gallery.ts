import { ChangeDetectionStrategy, Component, computed, input, output, signal } from '@angular/core';
import { A11yModule } from '@angular/cdk/a11y';
import { KidsGalleryItem, daysUntilExpiry } from './from-your-kids-contract';

/**
 * Read-only M4 gallery. Parent actions are emitted, never persisted locally;
 * M5 must authorize every mutation and return the updated viewer-specific item.
 */
@Component({
  selector: 'app-kids-gallery',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [A11yModule],
  template: `
    <div class="gallery-items" [class.artwork]="kind() === 'Artwork'" [class.photos]="kind() === 'Photo'">
      @for (item of ordered(); track item.id) {
        <button type="button" class="memory" (click)="open(item.id, thumbnail)" #thumbnail
          [attr.aria-label]="'View ' + item.altText + ', ' + item.retention">
          <span class="pin" aria-hidden="true"></span>
          <img [src]="item.thumbnailUrl" [alt]="item.altText" loading="lazy" />
          <span class="retention">{{ item.retention }}</span>
        </button>
      }
    </div>
    @if (active(); as item) {
      <div class="backdrop" (click)="close()" aria-hidden="true"></div>
      <section class="detail" role="dialog" aria-modal="true" aria-labelledby="memory-title"
        cdkTrapFocus [cdkTrapFocusAutoCapture]="true" (keydown.escape)="close()">
        <header>
          <h3 id="memory-title">{{ item.kind === 'Artwork' ? 'Artwork' : 'Photo' }} from your child</h3>
          <button type="button" (click)="close()" cdkFocusInitial aria-label="Close preview">✕</button>
        </header>
        <img class="full" [src]="item.imageUrl" [alt]="item.altText" />
        <p>{{ item.retention }}</p>
        @if (actionsEnabled()) {
        <div class="actions">
          <button type="button" [attr.aria-pressed]="item.heartedByViewer"
            (click)="heart.emit({ id: item.id, value: !item.heartedByViewer })">
            {{ item.heartedByViewer ? '♥ Hearted' : '♡ Heart' }}
          </button>
          <button type="button" [attr.aria-pressed]="item.bookmarked"
            (click)="bookmark.emit({ id: item.id, value: !item.bookmarked })">
            {{ item.bookmarked ? 'Saved' : 'Save' }}
          </button>
          @if (item.downloadUrl) {
            <a [href]="item.downloadUrl" download rel="noopener noreferrer">Download</a>
          }
          <button type="button" (click)="exportRequested.emit(item.id)">Export to Google Photos</button>
        </div>
        <label for="child-memory-comment">Your message to your child (one-way)</label>
        <textarea id="child-memory-comment" maxlength="500" rows="3"
          [value]="item.viewerComment ?? ''" #commentText></textarea>
        <button type="button" (click)="comment.emit({ id: item.id, text: commentText.value })">
          Save message
        </button>
        <p class="privacy">Your child can read your message but cannot reply here.</p>
        }
      </section>
    }
  `,
  styles: `
    :host { display: block; width: 100%; }
    .gallery-items { display: grid; grid-template-columns: repeat(auto-fit,minmax(min(100%,8rem),1fr)); justify-items: center; gap: 1rem; width: 100%; }
    .pin { display: block; position: absolute; top: -.45rem; left: 50%; width: 1rem; height: 1rem; border-radius: 50%; background: #f08a6b; border: 2px solid #e6b7a5; box-shadow: 0 2px 3px #0005; transform: translateX(-50%); z-index: 1; }
    .photos .memory:nth-child(3n + 2) .pin { background: #4e79a7; border-color: #b2c5da; }
    .photos .memory:nth-child(3n) .pin { background: #f4c15d; border-color: #e8d18c; }
    .memory { position: relative; padding: .5rem; border: 0; border-radius: .5rem; background: #f7f5ed; box-shadow: 0 3px 10px #0003; cursor: pointer; }
    .memory img { display: block; width: min(9rem,100%); aspect-ratio: 1; object-fit: cover; }
    .artwork .memory { transform: rotate(-2deg); border: 2px solid #f1ded0; }
    .artwork .memory:nth-child(even) { transform: rotate(2deg); }
    .photos .memory { transform: rotate(2deg); }
    .photos .memory:nth-child(even) { transform: rotate(-2deg); }
    .retention { display: block; margin-top: .25rem; color: #20303f; font-size: .8rem; }
    .backdrop { position: fixed; inset: 0; z-index: 1000; background: #000a; }
    .detail { position: fixed; inset: 50% auto auto 50%; transform: translate(-50%, -50%); z-index: 1001; width: min(calc(100% - 2rem), 42rem); max-height: 90dvh; overflow: auto; display: grid; gap: 1rem; padding: 1rem; border-radius: 1rem; background: var(--color-surface); color: var(--color-text); }
    header { display: flex; justify-content: space-between; align-items: center; }
    h3,p { margin: 0; }
    .full { display: block; max-width: 100%; max-height: 50dvh; object-fit: contain; margin: auto; }
    .actions { display: flex; flex-wrap: wrap; gap: .5rem; }
    button,a { min-height: 44px; padding: .5rem .8rem; border: 1px solid var(--color-outline); border-radius: .5rem; background: var(--color-surface-soft); color: var(--color-text); font: inherit; cursor: pointer; }
    textarea { width: 100%; box-sizing: border-box; background: var(--color-surface); color: var(--color-text); }
    .privacy { color: var(--color-text-secondary); font-size: .85rem; }
    :is(button,a,textarea):focus-visible { outline: 3px solid var(--color-focus); outline-offset: 2px; }
    @media (max-width: 40rem) { .gallery-items.photos { grid-auto-flow: column; grid-auto-columns: minmax(9rem,70%); grid-template-columns: none; overflow-x: auto; scroll-snap-type: x mandatory; padding: .75rem .25rem; justify-items: stretch; } .memory { scroll-snap-align: center; } .memory img { width: 100%; } }
    @media (prefers-reduced-motion: reduce) { .memory { transform: none !important; } }
  `,
})
export class KidsGallery {
  readonly kind = input.required<'Artwork' | 'Photo'>();
  readonly items = input<readonly KidsGalleryItem[]>([]);
  /** M5 turns these on only when authorized, persisted handlers are connected. */
  readonly actionsEnabled = input(false);
  readonly heart = output<{ id: string; value: boolean }>();
  readonly bookmark = output<{ id: string; value: boolean }>();
  readonly comment = output<{ id: string; text: string }>();
  readonly exportRequested = output<string>();
  protected readonly activeId = signal<string | null>(null);
  protected readonly ordered = computed(() => {
    const now = new Date();
    return [...this.items()]
      .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
      .map(item => ({ ...item, retention: this.retentionLabel(item, now) }));
  });
  protected readonly active = computed(() => this.ordered().find(item => item.id === this.activeId()) ?? null);

  protected open(id: string, thumbnail: HTMLButtonElement): void {
    thumbnail.focus();
    this.activeId.set(id);
  }

  private retentionLabel(item: KidsGalleryItem, now: Date): string {
    if (item.bookmarked) return 'Saved';
    const days = daysUntilExpiry(item.expiresAt, now);
    if (days === null) return 'Unsaved';
    if (days === 0) return 'Expired';
    return days === 1 ? 'Expires in 1 day' : `Expires in ${days} days`;
  }

  protected close(): void { this.activeId.set(null); }
}
