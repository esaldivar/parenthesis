import { ChangeDetectionStrategy, Component, computed, effect, inject, input, output, signal } from '@angular/core';
import { TranslatePipe } from '../../../../core/i18n/translations';
import { AppLocale, LocaleService } from '../../../../core/i18n/locale.service';
import { KidsGalleryItem } from '../../from-your-kids-contract';

/** Which Photos view is showing: the corkboard on From Your Kids, the all-photos gallery, or one photo. */
export type KidsPhotosView = 'board' | 'gallery' | 'detail';

/** The single parent comment's save state for the open photo. */
export type CommentState = 'idle' | 'saving' | 'saved' | 'failed';

/** How many photos the corkboard previews: left tilt, straight, opposite tilt (#710). */
export const BOARD_PHOTOS = 3;

/** "Nov 18, 2026" and "2:15 PM" in the family's zone and the parent's language. */
export function sharedParts(iso: string, locale: AppLocale, timeZone: string | undefined): { date: string; time: string } {
  const at = new Date(iso);
  const options = timeZone ? { timeZone } : {};
  return {
    date: new Intl.DateTimeFormat(locale, { ...options, month: 'short', day: 'numeric', year: 'numeric' }).format(at),
    time: new Intl.DateTimeFormat(locale, { ...options, hour: 'numeric', minute: '2-digit' }).format(at),
  };
}

/** Newest submissions first; ties keep the server's order. */
export function newestFirst(photos: readonly KidsGalleryItem[]): readonly KidsGalleryItem[] {
  return photos
    .map((photo, index) => ({ photo, index, at: Date.parse(photo.createdAt) }))
    .sort((a, b) => b.at - a.at || a.index - b.index)
    .map(({ photo }) => photo);
}

/**
 * Parent-facing Photos from a child (#710, Figma "From Your Kids" Photos frames): the decorated corkboard, the
 * newest-first gallery and a photo's detail with the parent's heart and single comment. It only shows what it's given:
 * the page passes photos the child shared with this parent, and saves hearts and comments; it never uploads.
 */
@Component({
  selector: 'app-kids-photos',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [TranslatePipe],
  templateUrl: './kids-photos.component.html',
  styleUrl: './kids-photos.component.scss',
})
export class KidsPhotos {
  readonly view = input<KidsPhotosView>('board');
  readonly photos = input<readonly KidsGalleryItem[]>([]);
  readonly photoId = input<string | null>(null);
  readonly childName = input('');
  readonly timeZone = input<string | undefined>(undefined);
  /** Sample content: say that hearts and comments stay on the page. */
  readonly preview = input(false);
  readonly heartPending = input(false);
  readonly heartFailed = input(false);
  readonly commentState = input<CommentState>('idle');

  readonly viewAll = output<void>();
  readonly openPhoto = output<string>();
  readonly backToPhotos = output<void>();
  readonly heart = output<{ id: string; value: boolean }>();
  readonly comment = output<{ id: string; text: string }>();

  protected readonly ordered = computed(() => newestFirst(this.photos()));
  protected readonly board = computed(() => this.ordered().slice(0, BOARD_PHOTOS));
  protected readonly moreThanBoard = computed(() => this.ordered().length > BOARD_PHOTOS);
  protected readonly selected = computed(() => this.ordered().find(photo => photo.id === this.photoId()) ?? null);
  protected readonly draft = signal('');
  private readonly locale = inject(LocaleService).locale;

  constructor() {
    // The comment field starts from the parent's saved comment whenever another photo opens.
    effect(() => this.draft.set(this.selected()?.viewerComment ?? ''));
  }

  protected when(photo: KidsGalleryItem): string {
    const { date, time } = sharedParts(photo.createdAt, this.locale(), this.timeZone());
    return `${date} · ${time}`;
  }

  protected parts(photo: KidsGalleryItem): { date: string; time: string } {
    return sharedParts(photo.createdAt, this.locale(), this.timeZone());
  }

  protected toggleHeart(photo: KidsGalleryItem): void {
    if (this.heartPending()) return;
    this.heart.emit({ id: photo.id, value: !photo.heartedByViewer });
  }

  protected saveComment(photo: KidsGalleryItem): void {
    if (this.commentState() === 'saving') return;
    this.comment.emit({ id: photo.id, text: this.draft().trim() });
  }
}
