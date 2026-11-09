import { ChangeDetectionStrategy, Component, computed, input, output, signal } from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { A11yModule } from '@angular/cdk/a11y';
import { KidsGalleryItem, daysUntilExpiry } from './from-your-kids-contract';

/**
 * Read-only M4 gallery. Parent actions are emitted, never persisted locally;
 * M5 must authorize every mutation and return the updated viewer-specific item.
 */
@Component({
  selector: 'app-kids-gallery',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [A11yModule, NgTemplateOutlet],
  template: `
    <ng-template #card let-item>
      <button type="button" class="memory" (click)="open(item.id, thumbnail)" #thumbnail
        [attr.aria-label]="'View ' + item.altText + ', ' + item.retention">
        <span class="pin" aria-hidden="true"></span>
        <img [src]="item.thumbnailUrl" [alt]="item.altText" loading="lazy" />
        <span class="retention">{{ item.retention }}</span>
      </button>
    </ng-template>
    @if (kind() === 'Artwork') {
      <div class="artwork">
        <div class="artwork-display">
          <div class="fridge-door" role="group" aria-label="Closed refrigerator with magnet-pinned artwork">
            <div class="on-door">
              @for (item of artworkCards().slice(0, 2); track item.id) {
                <ng-container *ngTemplateOutlet="card; context: { $implicit: item }" />
              }
            </div>
          </div>
          <div class="artwork-grid">
            @for (item of artworkCards().slice(2); track item.id) {
              <ng-container *ngTemplateOutlet="card; context: { $implicit: item }" />
            }
          </div>
        </div>
        @if (artworkPageCount() > 1) {
          <nav class="artwork-pager" aria-label="Artwork pages">
            <button type="button" [disabled]="currentArtworkPage() === 0"
              (click)="artworkPage.set(currentArtworkPage() - 1)">Previous</button>
            <span aria-live="polite">{{ currentArtworkPage() + 1 }} / {{ artworkPageCount() }}</span>
            <button type="button" [disabled]="currentArtworkPage() + 1 === artworkPageCount()"
              (click)="artworkPage.set(currentArtworkPage() + 1)">Next</button>
          </nav>
        }
      </div>
    } @else {
      <div class="gallery-items photos">
        @for (item of ordered(); track item.id) {
          <ng-container *ngTemplateOutlet="card; context: { $implicit: item }" />
        }
      </div>
    }
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
    :host { display: block; width: 100%; min-width: 0; }
    .artwork { display: grid; justify-items: center; gap: var(--space-3); }
    .artwork-display { display: grid; width: min(100%, 18rem); }
    .artwork-display > * { grid-area: 1 / 1; }
    .fridge-door {
      position: relative;
      width: 100%;
      aspect-ratio: 2 / 3;
      background: url('/art/from-your-kids/fridge-illustration.webp') center / 100% 100% no-repeat;
    }
    .on-door {
      position: absolute;
      inset-inline: 24% 12%;
      display: grid;
      align-items: center;
      justify-items: center;
      gap: clamp(.25rem, 1vw, .65rem);
    }
    .on-door { top: 13%; bottom: 61%; grid-template-columns: repeat(2, minmax(0, 1fr)); }
    .artwork-grid {
      position: relative;
      align-self: start;
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      align-items: start;
      gap: .35rem;
      margin: 94% 12% 0 24%;
    }
    .artwork-grid .memory { padding: .25rem; }
    .artwork-grid .memory img { aspect-ratio: 1; object-fit: contain; background: #fff8e8; }
    .artwork-grid .retention { display: none; }
    @media (min-width: 56rem) {
      .artwork-display {
        width: min(100%, 42rem);
        grid-template-columns: minmax(0, 16rem) minmax(0, 1fr);
        align-items: center;
        gap: clamp(1.75rem, 4vw, 3.5rem);
      }
      .artwork-display > * { grid-area: auto; }
      .artwork-display:has(.artwork-grid:empty) { width: min(100%, 16rem); grid-template-columns: minmax(0, 1fr); }
      .artwork-grid {
        align-self: center;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 1.25rem;
        margin: 0;
      }
      .artwork-grid .memory { padding: .5rem; }
      .artwork-grid .retention { display: block; }
    }
    .on-door .memory { --card-tilt: -6deg; padding: clamp(.18rem, .5vw, .36rem); }
    .on-door .memory:nth-child(even) { --card-tilt: 5deg; }
    .on-door .memory img { aspect-ratio: 1; object-fit: contain; background: #fff8e8; }
    .on-door .retention { display: none; }
    .on-door .memory:nth-child(even) .pin { background: radial-gradient(circle at 35% 25%, #b5d7ec, #38688c 70%); }
    .on-door .memory:nth-child(3n) .pin { background: radial-gradient(circle at 35% 25%, #ffeda3, #b87924 70%); }
    .artwork-pager { display: flex; align-items: center; gap: .75rem; }
    .gallery-items {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(min(100%, 9rem), 1fr));
      gap: clamp(.65rem, 2vw, 1.2rem);
      width: 100%;
      padding: .55rem .2rem;
    }
    .pin { position: absolute; top: -.4rem; left: 50%; width: .85rem; height: .85rem; border-radius: 50%;
      background: radial-gradient(circle at 35% 25%, #f8aaa0, #ae374d 70%);
      box-shadow: 0 2px 3px #0006; transform: translateX(-50%); z-index: 1; }
    .photos .memory:nth-child(3n + 2) .pin { background: radial-gradient(circle at 35% 25%, #b5d7ec, #38688c 70%); }
    .photos .memory:nth-child(3n) .pin { background: radial-gradient(circle at 35% 25%, #ffeda3, #b87924 70%); }
    .memory { --card-tilt: -2deg; position: relative; width: 100%; padding: .5rem; border: 1px solid #d9c5a2; border-radius: .3rem;
      background: #fffaed; box-shadow: 0 .25rem .55rem #0004; cursor: pointer; transform: rotate(var(--card-tilt)); }
    .memory:nth-child(even) { --card-tilt: 2deg; }
    @media (hover: hover) and (pointer: fine) and (prefers-reduced-motion: no-preference) {
      .artwork .memory { transition: transform 180ms ease, box-shadow 180ms ease; }
      .artwork .memory:is(:hover, :focus-visible) {
        z-index: 2;
        transform: rotate(calc(var(--card-tilt) * -1.5)) scale(1.12);
        box-shadow: 0 .5rem 1rem #0005;
      }
    }
    .memory img { display: block; width: 100%; aspect-ratio: 4 / 3; object-fit: cover; }
    .retention { display: block; margin-top: .25rem; color: #20303f; font-size: .8rem; overflow-wrap: anywhere; }
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
    @media (max-width: 40rem) {
      .gallery-items.photos { grid-template-columns: repeat(2, minmax(0, 1fr)); }
      .photos .memory { padding: .3rem; }
      .photos .memory img { aspect-ratio: 1; }
      .photos .retention { font-size: .7rem; }
    }
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
  protected readonly artworkPage = signal(0);
  protected readonly artworkPageCount = computed(() => Math.ceil(this.ordered().length / 5));
  protected readonly currentArtworkPage = computed(() => Math.min(this.artworkPage(), Math.max(0, this.artworkPageCount() - 1)));
  protected readonly artworkCards = computed(() => {
    const start = this.currentArtworkPage() * 5;
    return this.ordered().slice(start, start + 5);
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
