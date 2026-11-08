import { ChangeDetectionStrategy, Component, DestroyRef, computed, effect, inject, signal, untracked } from '@angular/core';
import { Api, Child } from '../../core/api/api';
import { AuthStore } from '../../core/auth/auth.store';

/**
 * M4 parent-facing presentation shell (#531). No synthetic child data is exposed to parents.
 * M5 will supply parent-authorized entries, artwork and photos through an API.
 */
@Component({
  selector: 'app-from-your-kids-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="kids" aria-labelledby="kids-title">
      <header class="intro">
        <h1 id="kids-title">From Your Kids</h1>
        <p>A little window into the things your children choose to share.</p>
      </header>

      @if (loading()) {
        <p role="status">Loading children…</p>
      } @else if (failed()) {
        <p role="alert">We couldn't load your children's profiles.</p>
        <button type="button" class="retry" (click)="retry()">Try again</button>
      } @else if (children().length === 0) {
        <p>No active child profiles yet.</p>
      } @else {
      <nav class="child-tabs" aria-label="Choose a child">
        @for (child of children(); track child.id) {
          <button type="button" [attr.aria-pressed]="selectedChildId() === child.id"
            (click)="selectChild(child.id)">{{ child.firstName }}</button>
        }
      </nav>
      <nav class="sections" aria-label="From Your Kids sections">
        <button type="button" [attr.aria-current]="section() === 'diary' ? 'page' : null"
          (click)="section.set('diary')"><span aria-hidden="true">📖</span> Diary</button>
        <button type="button" [attr.aria-current]="section() === 'artwork' ? 'page' : null"
          (click)="section.set('artwork')"><span aria-hidden="true">🎨</span> Artwork</button>
        <button type="button" [attr.aria-current]="section() === 'photos' ? 'page' : null"
          (click)="section.set('photos')"><span aria-hidden="true">📷</span> Photos</button>
      </nav>

      <p class="sharing-note">Only things {{ selectedChild()?.firstName }} chooses to share with you will appear here.</p>
      @switch (section()) {
        @case ('diary') {
          <section class="book" aria-labelledby="diary-title">
            <div class="page">
              <h2 id="diary-title">Their diary</h2>
              <p>Thoughts, feelings and stories shared just with you.</p>
            </div>
            <div class="page">
              <p class="empty">No diary entries shared with you yet.</p>
              <p class="hint">When your child shares an entry, you'll be able to turn its pages here.</p>
            </div>
          </section>
        }
        @case ('artwork') {
          <section class="gallery" aria-labelledby="artwork-title">
            <h2 id="artwork-title">Their artwork</h2>
            <div class="fridge" role="img" aria-label="Empty closed refrigerator, ready for your child's shared drawings">
              <div class="fridge-door fridge-door--upper"><span class="fridge-handle" aria-hidden="true"></span></div>
              <div class="fridge-door fridge-door--lower"><span class="fridge-handle" aria-hidden="true"></span></div>
            </div>
            <p>No artwork shared with you yet.</p>
            <p class="hint">Drawings will appear on the outside of the fridge, held up by magnets.</p>
          </section>
        }
        @case ('photos') {
          <section class="gallery" aria-labelledby="photos-title">
            <h2 id="photos-title">Their photos</h2>
            <div class="corkboard"><h3>{{ selectedChild()?.firstName }}'s photos</h3><p>No photos shared with you yet.</p></div>
            <p class="hint">Your child's photos will be pinned here like little memories.</p>
          </section>
        }
      }
      }
    </section>
  `,
  styles: `
    :host { display: block; color: var(--color-text); }
    .kids { display: grid; gap: var(--space-4); max-width: 75rem; }
    h1,h2,p { margin: 0; }
    .intro { padding: var(--space-4); border-radius: var(--radius-card); background: var(--color-surface); }
    .intro h1 { font-family: Georgia, serif; font-size: clamp(1.7rem, 4vw, 2.6rem); }
    .intro p,.hint { color: var(--color-text-secondary); }
    .intro p { margin-top: var(--space-2); }
    .child-tabs { display: flex; flex-wrap: wrap; gap: var(--space-2); }
    .child-tabs button,.retry { min-height: var(--target-min); padding: var(--space-2) var(--space-4); border: 1px solid var(--color-outline); border-radius: var(--radius-pill); background: var(--color-surface); color: var(--color-text); font: inherit; cursor: pointer; }
    .child-tabs button[aria-pressed='true'] { background: var(--color-surface-soft); border: 2px solid var(--color-focus); font-weight: 700; }
    .sharing-note { color: var(--color-text-secondary); }
    .sections { display: grid; grid-template-columns: repeat(3,minmax(0,1fr)); gap: var(--space-2); }
    .sections button { min-height: var(--target-min); padding: var(--space-3); border: 1px solid var(--color-divider); border-radius: var(--radius-card); background: var(--color-surface); color: var(--color-text); cursor: pointer; font: inherit; font-weight: 650; }
    .sections button[aria-current='page'] { border: 2px solid var(--color-focus); background: var(--color-surface-soft); }
    .sections button span { display: block; font-size: 1.7rem; }
    button:focus-visible { outline: 3px solid var(--color-focus); outline-offset: 3px; }
    .book { display: grid; grid-template-columns: repeat(2,minmax(0,1fr)); border: 6px solid #5E8F7E; border-radius: 16px; background: #F7F5ED; color: #20303F; box-shadow: 0 8px 20px #0002; overflow: hidden; }
    .page { min-height: 18rem; padding: clamp(1rem,3vw,2rem); background: repeating-linear-gradient(#fff9ed,#fff9ed 30px,#e5ded1 31px); }
    .page + .page { border-left: 2px solid #d6cbb9; }
    .page h2 { font-family: Georgia, serif; margin-bottom: 1rem; }
    .page .empty { font-weight: 700; margin-top: 2rem; }
    .gallery { display: grid; justify-items: center; gap: var(--space-3); padding: var(--space-4); background: var(--color-surface); border-radius: var(--radius-card); text-align: center; }
    .fridge { display: grid; width: min(100%, 18rem); height: 24rem; padding: 0.65rem; gap: 0.5rem; border: 3px solid var(--color-outline); border-radius: 1.5rem; background: var(--color-surface-soft); box-shadow: 0 8px 15px #0002; }
    .fridge-door { position: relative; border: 2px solid var(--color-divider); border-radius: 0.75rem; background: var(--color-surface); }
    .fridge-door--upper { min-height: 9rem; }
    .fridge-door--lower { min-height: 11rem; }
    .fridge-handle { position: absolute; left: 0.8rem; top: 20%; width: 0.55rem; height: 45%; border-radius: 0.4rem; background: var(--color-outline); }
    .fridge p { margin-top: var(--space-2); }
    .corkboard { display: grid; place-items: center; width: min(100%,42rem); min-height: 16rem; border: 12px solid #996638; border-radius: 12px; background: #c48c55; color: #20303F; box-shadow: inset 0 0 12px #56351855; }
    .corkboard { gap: var(--space-3); padding: var(--space-3); }
    .corkboard h3 { margin: 0; font-family: Georgia, serif; }
    .corkboard p { padding: 1rem; background: #F7F5ED; transform: rotate(-2deg); }
    @media (max-width: 40rem) { .book { grid-template-columns: 1fr; } .page:first-child { display: none; } .page + .page { border-left: 0; } .sections button { padding: var(--space-2); } }
    @media (prefers-reduced-motion: reduce) { *,*::before,*::after { transition: none !important; animation: none !important; } }
  `,
})
export class FromYourKidsPage {
  private readonly api = inject(Api);
  private readonly auth = inject(AuthStore);
  private readonly destroy = inject(DestroyRef);
  private requestId = 0;
  protected readonly section = signal<'diary' | 'artwork' | 'photos'>('diary');
  protected readonly children = signal<readonly Child[]>([]);
  protected readonly selectedChildId = signal<string | null>(null);
  protected readonly selectedChild = computed(() => this.children().find(child => child.id === this.selectedChildId()) ?? null);
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

  protected retry(): void {
    void this.loadChildren(this.auth.currentFamily()?.id);
  }

  private async loadChildren(familyId: string | undefined): Promise<void> {
    const request = ++this.requestId;
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
