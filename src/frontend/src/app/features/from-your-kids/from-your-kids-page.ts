import { TranslatePipe } from '../../core/i18n/translations';
import { ChangeDetectionStrategy, Component, DestroyRef, computed, effect, inject, isDevMode, signal, untracked } from '@angular/core';
import { Api, Child } from '../../core/api/api';
import { AuthStore } from '../../core/auth/auth.store';
import { KidsGallery } from './kids-gallery';
import { KidsDiary } from './kids-diary';
import { previewDiary, previewGallery } from './from-your-kids-preview';

/**
 * M4 parent-facing presentation shell (#531). Sample content is opt-in in development builds.
 * M5 will supply parent-authorized entries, artwork and photos through an API.
 */
@Component({
  selector: 'app-from-your-kids-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [TranslatePipe, KidsGallery, KidsDiary],
  template: `
    <section class="kids" aria-labelledby="kids-title">
      <header class="intro">
        <h1 id="kids-title">{{ 'feature.from.your.kids' | tr }}</h1>
        <p>{{ 'feature.a.little.window.into.the.things.your' | tr }}</p>
      </header>

      @if (loading()) {
        <p role="status">{{ 'feature.loading.children' | tr }}</p>
      } @else if (failed()) {
        <p role="alert">{{ 'feature.we.couldn.t.load.your.children.s' | tr }}</p>
        <button type="button" class="retry" (click)="retry()">{{ 'feature.try.again' | tr }}</button>
      } @else if (children().length === 0) {
        <p>{{ 'feature.no.active.child.profiles.yet' | tr }}</p>
      } @else {
      <nav class="child-tabs" aria-label="{{ 'feature.choose.a.child' | tr }}">
        @for (child of children(); track child.id) {
          <button type="button" [attr.aria-pressed]="selectedChildId() === child.id"
            (click)="selectChild(child.id)">{{ child.firstName }}</button>
        }
      </nav>
      <nav class="sections" aria-label="{{ 'feature.from.your.kids.sections' | tr }}">
        <button type="button" [attr.aria-current]="section() === 'diary' ? 'page' : null"
          (click)="section.set('diary')"><span class="section-icon" aria-hidden="true">📖</span><span class="section-copy"><strong>{{ 'feature.diary' | tr }}</strong><small>{{ 'feature.thoughts.stories.and.daily.adventures' | tr }}</small></span><span aria-hidden="true">›</span></button>
        <button type="button" [attr.aria-current]="section() === 'artwork' ? 'page' : null"
          (click)="section.set('artwork')"><span class="section-icon" aria-hidden="true">🧲</span><span class="section-copy"><strong>{{ 'feature.artwork' | tr }}</strong><small>{{ 'feature.creative.drawings.projects.and.more' | tr }}</small></span><span aria-hidden="true">›</span></button>
        <button type="button" [attr.aria-current]="section() === 'photos' ? 'page' : null"
          (click)="section.set('photos')"><span class="section-icon" aria-hidden="true">📷</span><span class="section-copy"><strong>{{ 'feature.photos' | tr }}</strong><small>{{ 'feature.photo.adventures.from.your.kid' | tr }}</small></span><span aria-hidden="true">›</span></button>
      </nav>

      @if (developmentBuild) {
        <label class="preview-toggle">
          <input type="checkbox" [checked]="previewAt() !== null" (change)="setPreview($event)" />
          {{ 'feature.development.preview.with.sample.content' | tr }}
        </label>
      }
      @if (previewAt() !== null) {
        <p role="status">{{ 'feature.showing.synthetic.examples.for.ui.testing' | tr }}</p>
      } @else {
        <p class="sharing-note">{{ 'feature.only.things' | tr }} {{ selectedChild()?.firstName }} {{ 'feature.chooses.to.share.with.you.will.appear' | tr }}</p>
      }
      @switch (section()) {
        @case ('diary') {
          <div class="section-heading"><h2>{{ contentName() }}{{ 'feature.s.diary' | tr }}</h2><span aria-hidden="true">✧ ♡</span></div>
          <app-kids-diary [entries]="diaryEntries()" />
        }
        @case ('artwork') {
          <section class="gallery" aria-labelledby="artwork-title">
            <h2 id="artwork-title">{{ contentName() }}{{ 'feature.s.artwork' | tr }}</h2>
            <div class="fridge" role="group" aria-label="{{ 'feature.artwork.on.the.closed.refrigerator' | tr }}">
              <div class="fridge-door fridge-door--upper"><span class="fridge-handle" aria-hidden="true"></span></div>
              <div class="fridge-door fridge-door--lower">
                <span class="fridge-handle" aria-hidden="true"></span>
                <app-kids-gallery kind="Artwork" [items]="artwork()" />
              </div>
            </div>
            @if (!artwork().length) { <p>{{ 'feature.no.artwork.shared.with.you.yet' | tr }}</p> }
            <p class="hint">{{ 'feature.drawings.will.appear.on.the.outside.of' | tr }}</p>
          </section>
        }
        @case ('photos') {
          <section class="gallery" aria-labelledby="photos-title">
            <h2 id="photos-title">{{ contentName() }}{{ 'feature.s.photos.8cd4e2' | tr }}</h2>
            <div class="corkboard"><h3>{{ contentName() }}{{ 'feature.s.photos' | tr }}</h3><app-kids-gallery kind="Photo" [items]="photos()" />@if (!photos().length) { <p>{{ 'feature.no.photos.shared.with.you.yet' | tr }}</p> }</div>
            <p class="hint">{{ 'feature.your.child.s.photos.will.be.pinned' | tr }}</p>
          </section>
        }
      }
      }
    </section>
  `,
  styles: `
    :host { display: block; color: var(--color-text); }
    .kids { display: grid; grid-template-columns: minmax(0, 1fr); gap: var(--space-4); max-width: 75rem; }
    h1,h2,p { margin: 0; }
    .intro { position: relative; overflow: hidden; padding: clamp(1.25rem, 3vw, 2.5rem); border-radius: 1.25rem; background: var(--color-surface-soft); border: 1px solid var(--color-divider); }
    .intro::after { content: '✦  ♡  ✧'; position: absolute; right: 1rem; top: 1rem; font-size: 1.4rem; color: #5e8f7e; opacity: .75; }
    .intro h1::after { content: ' ♡'; color: #f08a6b; }
    .intro h1 { font-family: Georgia, serif; font-size: clamp(1.7rem, 4vw, 2.6rem); }
    .intro p,.hint { color: var(--color-text-secondary); }
    .intro p { margin-top: var(--space-2); }
    .child-tabs { display: flex; flex-wrap: wrap; gap: var(--space-2); }
    .child-tabs button,.retry { min-height: var(--target-min); padding: var(--space-2) var(--space-4); border: 1px solid var(--color-outline); border-radius: var(--radius-pill); background: var(--color-surface); color: var(--color-text); font: inherit; cursor: pointer; }
    .child-tabs button::before { content: '♡'; display: inline-grid; place-items: center; margin-right: .5rem; width: 1.6rem; height: 1.6rem; border-radius: 50%; background: var(--color-surface-soft); color: #5e8f7e; }
    .child-tabs button[aria-pressed='true'] { background: var(--color-surface-soft); border: 2px solid var(--color-focus); font-weight: 700; }
    .sharing-note { color: var(--color-text-secondary); }
    .sections { display: grid; grid-template-columns: repeat(3,minmax(0,1fr)); gap: var(--space-2); }
    .sections button { display: flex; align-items: center; gap: 1rem; text-align: left; min-height: 7.5rem; padding: clamp(.75rem,2vw,1.4rem); border: 2px solid var(--color-divider); border-radius: 1.25rem; background: var(--color-surface); color: var(--color-text); cursor: pointer; font: inherit; box-shadow: 0 4px 14px #0001; }
    .section-copy { display: grid; gap: .35rem; flex: 1; }
    .section-copy strong { font-family: Georgia,serif; font-size: 1.25rem; }
    .section-copy small { font-size: .8rem; line-height: 1.4; color: var(--color-text-secondary); }
    .section-heading { display: flex; align-items: center; justify-content: space-between; gap: 1rem; padding: .25rem .5rem; }
    .section-heading span { color: #f08a6b; font-size: 1.4rem; }
    .sections button[aria-current='page'] { border: 2px solid var(--color-focus); background: var(--color-surface-soft); }
    .sections .section-icon { display: grid; place-items: center; flex: 0 0 3.5rem; width: 3.5rem; height: 3.5rem; border-radius: .85rem; background: var(--color-surface-soft); font-size: 2rem; }
    button:focus-visible { outline: 3px solid var(--color-focus); outline-offset: 3px; }
    .gallery { display: grid; grid-template-columns: minmax(0, 1fr); justify-items: center; gap: var(--space-3); padding: var(--space-4); background: var(--color-surface); border: 1px solid var(--color-divider); border-radius: 1.25rem; text-align: center; }
    .gallery h2 { font-family: Georgia,serif; font-size: clamp(1.4rem,2.5vw,2rem); }
    .fridge { display: grid; width: min(100%, 18rem); min-height: 24rem; padding: 0.65rem; gap: 0.5rem; border: 3px solid var(--color-outline); border-radius: 1.5rem; background: var(--color-surface-soft); box-shadow: 0 8px 15px #0002; }
    .fridge-door { position: relative; border: 2px solid var(--color-divider); border-radius: 0.75rem; background: var(--color-surface); }
    .fridge-door--upper { min-height: 9rem; }
    .fridge-door--lower { min-height: 11rem; padding: 1rem .65rem 1rem 2rem; }
    .preview-toggle { display: flex; align-items: center; gap: .5rem; min-height: var(--target-min); }
    .fridge-handle { position: absolute; left: 0.8rem; top: 20%; width: 0.55rem; height: 45%; border-radius: 0.4rem; background: var(--color-outline); }
    .corkboard { display: grid; grid-template-columns: minmax(0, 1fr); place-items: center; width: min(100%,58rem); min-height: 20rem; border: 12px solid #996638; border-radius: 12px; background: #c48c55; color: #20303F; box-shadow: inset 0 0 12px #56351855; }
    .corkboard { gap: var(--space-3); padding: var(--space-3); }
    .corkboard h3 { margin: 0; font-family: Georgia, serif; }
    .corkboard p { padding: 1rem; background: #F7F5ED; transform: rotate(-2deg); }
    @media (max-width: 55rem) { .sections { grid-template-columns: 1fr; } .sections button { min-height: 5.5rem; } }
    @media (max-width: 40rem) {
      .sections button { padding: var(--space-2); }
      .gallery { padding: var(--space-2); }
      .fridge { width: min(100%, 16rem); }
      .corkboard { width: 100%; border-width: 8px; }
    }
    @media (prefers-reduced-motion: reduce) { *,*::before,*::after { transition: none !important; animation: none !important; } }
  `,
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
  protected readonly section = signal<'diary' | 'artwork' | 'photos'>('diary');
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
