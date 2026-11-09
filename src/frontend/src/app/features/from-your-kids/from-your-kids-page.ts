import { ChangeDetectionStrategy, Component, DestroyRef, computed, effect, inject, isDevMode, signal, untracked } from '@angular/core';
import { Api, Child } from '../../core/api/api';
import { AuthStore } from '../../core/auth/auth.store';
import { KidsGallery } from './kids-gallery';
import { KidsDiary } from './kids-diary';
import { Avatar } from '../../shared/avatar/avatar';
import { previewDiary, previewGallery } from './from-your-kids-preview';

/**
 * M4 parent-facing presentation shell (#531). Sample content is opt-in in development builds.
 * M5 will supply parent-authorized entries, artwork and photos through an API.
 */
@Component({
  selector: 'app-from-your-kids-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Avatar, KidsGallery, KidsDiary],
  templateUrl: './from-your-kids-page.html',
  styleUrl: './from-your-kids-page.scss',
})
export class FromYourKidsPage {
  private readonly api = inject(Api);
  private readonly auth = inject(AuthStore);
  private readonly destroy = inject(DestroyRef);
  private requestId = 0;
  protected readonly developmentBuild = isDevMode();
  protected readonly previewAt = signal<number | null>(null);
  protected readonly diaryEntries = computed(() => {
    const now = this.previewAt();
    return now === null ? [] : previewDiary(now);
  });
  protected readonly artwork = computed(() => {
    const now = this.previewAt();
    return now === null ? [] : previewGallery('Artwork', now);
  });
  protected readonly photos = computed(() => {
    const now = this.previewAt();
    return now === null ? [] : previewGallery('Photo', now);
  });
  protected readonly sections = [
    { id: 'diary', title: 'Diary', description: 'Thoughts, stories, and daily adventures' },
    { id: 'artwork', title: 'Artwork', description: 'Creative drawings, projects, and more' },
    { id: 'photos', title: 'Photos', description: 'Photo adventures from your kid' },
  ] as const;
  protected readonly section = signal<(typeof this.sections)[number]['id']>('diary');
  protected readonly children = signal<readonly Child[]>([]);
  protected readonly selectedChildId = signal<string | null>(null);
  protected readonly selectedChild = computed(() => this.children().find(child => child.id === this.selectedChildId()) ?? null);
  protected readonly contentName = computed(() => this.previewAt() === null ? this.selectedChild()?.firstName : 'Sample child');
  protected readonly loading = signal(true);
  protected readonly failed = signal(false);

  constructor() {
    effect(() => {
      const familyId = this.auth.currentFamily()?.id;
      untracked(() => void this.loadChildren(familyId));
    });
  }

  protected selectChild(childId: string): void {
    if (!this.children().some(child => child.id === childId)) return;
    this.selectedChildId.set(childId);
    this.section.set('diary');
  }

  protected setPreview(event: Event): void {
    const checked = (event.target as HTMLInputElement).checked;
    this.previewAt.set(this.developmentBuild && checked ? Date.now() : null);
  }

  protected retry(): void {
    void this.loadChildren(this.auth.currentFamily()?.id);
  }

  private async loadChildren(familyId: string | undefined): Promise<void> {
    const request = ++this.requestId;
    this.previewAt.set(null);
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
