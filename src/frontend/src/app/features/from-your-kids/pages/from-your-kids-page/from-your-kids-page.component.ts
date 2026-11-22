import { LocaleService } from '../../../../core/i18n/locale.service';
import { TranslatePipe, translate } from '../../../../core/i18n/translations';
import { ChangeDetectionStrategy, Component, DestroyRef, ElementRef, Injector, afterNextRender, computed, effect, inject, isDevMode, signal, untracked, viewChild } from '@angular/core';
import { Api, Child } from '../../../../core/api/api';
import { AuthStore } from '../../../../core/auth/auth.store';
import { KidsGallery } from '../../components/kids-gallery/kids-gallery.component';
import { KidsDiary } from '../../components/kids-diary/kids-diary.component';
import { CommentState, KidsPhotos, KidsPhotosView } from '../../components/kids-photos/kids-photos.component';
import { KidsGalleryItem } from '../../from-your-kids-contract';
import { Avatar } from '../../../../shared/components/avatar/avatar';
import { previewDiary, previewGallery } from '../../from-your-kids-preview';

/**
 * M4 parent-facing presentation shell (#531). Sample content is opt-in in development builds.
 * M5 will supply parent-authorized entries, artwork and photos through an API.
 *
 * Photos (#710): the corkboard here, then the newest-first gallery and a photo's detail in place of the page, each
 * with "Back to From Your Kids" at the top and the same child selected. There's no From Your Kids API yet, so
 * hearts and comments only change the development sample (and say so); nothing is sent to the child.
 */
@Component({
  selector: 'app-from-your-kids-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Avatar, KidsGallery, KidsDiary, KidsPhotos, TranslatePipe],
  templateUrl: './from-your-kids-page.component.html',
  styleUrl: './from-your-kids-page.component.scss',
})
export class FromYourKidsPage {
  protected readonly locale = inject(LocaleService);
  private readonly api = inject(Api);
  private readonly auth = inject(AuthStore);
  private readonly destroy = inject(DestroyRef);
  private readonly injector = inject(Injector);
  private readonly viewHeading = viewChild<ElementRef<HTMLElement>>('viewHeading');
  private requestId = 0;
  protected readonly developmentBuild = isDevMode();
  protected readonly previewAt = signal<number | null>(null);
  protected readonly diaryEntries = computed(() => {
    const now = this.previewAt();
    return now === null ? [] : previewDiary(now, this.locale.locale());
  });
  protected readonly artwork = computed(() => {
    const now = this.previewAt();
    return now === null ? [] : previewGallery('Artwork', now, this.locale.locale());
  });
  /** The parent's hearts and comment on sample photos, kept only while the preview is on. */
  private readonly photoChanges = signal<Readonly<Record<string, Partial<Pick<KidsGalleryItem, 'heartedByViewer' | 'viewerComment'>>>>>({});
  protected readonly photos = computed(() => {
    const now = this.previewAt();
    if (now === null) return [];
    const changes = this.photoChanges();
    return previewGallery('Photo', now, this.locale.locale()).map(photo => ({ ...photo, ...changes[photo.id] }));
  });
  protected readonly photoView = signal<KidsPhotosView>('board');
  protected readonly photoId = signal<string | null>(null);
  protected readonly heartPending = signal(false);
  protected readonly commentState = signal<CommentState>('idle');
  protected readonly timeZone = computed(() => this.auth.currentFamily()?.timeZone);
  protected readonly sections = [
    { id: 'diary', title: 'feature.diary', description: 'feature.thoughts.stories.and.daily.adventures' },
    { id: 'artwork', title: 'feature.artwork', description: 'feature.creative.drawings.projects.and.more' },
    { id: 'photos', title: 'feature.photos', description: 'feature.photo.adventures.from.your.kid' },
  ] as const;
  protected readonly section = signal<(typeof this.sections)[number]['id']>('diary');
  protected readonly children = signal<readonly Child[]>([]);
  protected readonly selectedChildId = signal<string | null>(null);
  protected readonly selectedChild = computed(() => this.children().find(child => child.id === this.selectedChildId()) ?? null);
  protected readonly contentName = computed(() => this.previewAt() === null ? this.selectedChild()?.firstName : translate('kids.preview.sampleChild', this.locale.locale()));
  protected readonly loading = signal(true);
  protected readonly failed = signal(false);

  constructor() {
    effect(() => {
      const familyId = this.auth.currentFamily()?.id;
      untracked(() => void this.loadChildren(familyId));
    });
  }

  protected selectChild(childId: string): void {
    if (!this.children().some(child => child.id === childId) || childId === this.selectedChildId()) return;
    this.selectedChildId.set(childId);
    // Photos stay on Photos for the chosen child (#710); an open photo was the other child's, so show their gallery.
    // Diary and Artwork keep their earlier behavior and open the chosen child's Diary.
    if (this.photoView() === 'detail') this.showPhotos('gallery', null);
    else if (this.section() !== 'photos') this.section.set('diary');
  }

  protected setPreview(event: Event): void {
    const checked = (event.target as HTMLInputElement).checked;
    this.photoChanges.set({});
    this.previewAt.set(this.developmentBuild && checked ? Date.now() : null);
  }

  /** Shows the board, the gallery or one photo, and moves focus to the new view's heading. */
  protected showPhotos(view: KidsPhotosView, photoId: string | null = null): void {
    this.photoView.set(view);
    this.photoId.set(photoId);
    this.section.set('photos');
    this.heartPending.set(false);
    this.commentState.set('idle');
    afterNextRender({ write: () => this.viewHeading()?.nativeElement.focus() }, { injector: this.injector });
  }

  protected heart({ id, value }: { id: string; value: boolean }): void {
    if (this.previewAt() === null) return;
    this.photoChanges.update(changes => ({ ...changes, [id]: { ...changes[id], heartedByViewer: value } }));
  }

  protected comment({ id, text }: { id: string; text: string }): void {
    if (this.previewAt() === null) return;
    this.photoChanges.update(changes => ({ ...changes, [id]: { ...changes[id], viewerComment: text || null } }));
    this.commentState.set('saved');
  }

  protected retry(): void {
    void this.loadChildren(this.auth.currentFamily()?.id);
  }

  private async loadChildren(familyId: string | undefined): Promise<void> {
    const request = ++this.requestId;
    this.previewAt.set(null);
    this.photoChanges.set({});
    this.photoView.set('board');
    this.photoId.set(null);
    this.children.set([]);
    this.selectedChildId.set(null);
    this.loading.set(!!familyId);
    this.failed.set(false);
    if (!familyId) return;
    try {
      const children = (await this.api.children(familyId)).filter(child => child.status === 'Active');
      if (this.destroy.destroyed || request !== this.requestId || this.auth.currentFamily()?.id !== familyId) return;
      this.children.set(children);
      this.selectedChildId.set(children[0]?.id ?? null);
    } catch {
      if (!this.destroy.destroyed && request === this.requestId && this.auth.currentFamily()?.id === familyId) {
        this.failed.set(true);
      }
    } finally {
      if (!this.destroy.destroyed && request === this.requestId && this.auth.currentFamily()?.id === familyId) {
        this.loading.set(false);
      }
    }
  }
}
