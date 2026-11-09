import { ChangeDetectionStrategy, Component, ElementRef, Injector, afterNextRender, computed, inject, input, signal, viewChild } from '@angular/core';
import { AppDatePipe } from '../../core/i18n/locale-formatting';
import { TranslatePipe } from '../../core/i18n/translations';
import { KidsDiaryEntry, KidsMood } from './from-your-kids-contract';

const MOOD_CHARACTER: Record<Exclude<KidsMood, 'Happy'>, string> = {
  Excited: '🤩',
  Calm: '😌',
  Sad: '😢',
  Worried: '😟',
  Proud: '😊',
  Other: '🙂',
};

/** Parent-only, read-only diary: newest first; no reactions or editing. */
@Component({
  selector: 'app-kids-diary',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (ordered().length === 0) {
      <div class="book empty-book" aria-label="{{ 'feature.empty.diary' | tr }}">
        <div class="paper cover"><h2>{{ 'feature.dear.diary' | tr }}</h2><p>{{ 'feature.little.stories.big.feelings' | tr }}</p><img src="/art/from-your-kids/journal-heart.webp" alt="" /></div>
        <div class="paper"><p>{{ 'feature.no.diary.entries.shared.with.you.yet' | tr }}</p>
          <p>{{ 'feature.when.your.child.shares.an.entry.you' | tr }}</p>
        </div>
      </div>
    } @else {
      <section class="book" [class.reading]="reading()" aria-label="{{ 'feature.shared.diary' | tr }}" (touchstart)="onTouchStart($event)" (touchend)="onTouchEnd($event)">
        <div class="paper index-page"><h2>{{ 'feature.diary.entries' | tr }}</h2>
          <nav aria-label="{{ 'feature.choose.diary.entry' | tr }}">
            @for (entry of ordered(); track entry.id; let i = $index) {
              <button type="button" class="entry-choice" [attr.aria-current]="index() === i ? 'page' : null" (click)="selectEntry(i)">
                <strong>{{ entry.title || ('feature.diary.entry.fallback' | tr) }}</strong>
                <time [attr.datetime]="entry.createdAt">{{ entry.createdAt | appDate:'mediumDate' }}</time>
                <span class="entry-chevron" aria-hidden="true">›</span>
              </button>
            }
          </nav>
        </div>
        <article class="paper" aria-live="polite">
          <button type="button" class="back-to-entries" #backToEntries (click)="showEntries()">‹ {{ 'feature.diary.all.entries' | tr }}</button>
          @if (current(); as entry) {
            <time [attr.datetime]="entry.createdAt">{{ entry.createdAt | appDate:'mediumDate' }}</time>
            <p class="mood">
              @if (entry.mood === 'Happy') {
                <img src="/art/from-your-kids/journal-sun.webp" alt="" />
              } @else {
                <span aria-hidden="true">{{ moodCharacter[entry.mood] }}</span>
              }
              {{ entry.mood }}
            </p>
            @if (entry.title) { <h3>{{ entry.title }}</h3> }
            <p class="entry">{{ entry.body }}</p>
          }
        </article>
      </section>
      <nav class="pager" [class.reading]="reading()" aria-label="{{ 'feature.diary.pages' | tr }}">
        <button type="button" (click)="previous()" [disabled]="index() === 0" aria-label="{{ 'feature.previous.diary.page' | tr }}">← {{ 'feature.previous' | tr }}</button>
        <span aria-live="polite">{{ 'feature.diary.page.count' | tr: { page: index() + 1, total: ordered().length } }}</span>
        <button type="button" (click)="next()" [disabled]="index() >= ordered().length - 1" aria-label="{{ 'feature.next.diary.page' | tr }}">{{ 'feature.next' | tr }} →</button>
      </nav>
    }
  `,
  imports: [TranslatePipe, AppDatePipe],
  styles: `
    :host { display: grid; gap: .85rem; }
    .book {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      min-height: clamp(21rem, 48vw, 33rem);
      padding: clamp(2.5rem, 6%, 4rem) 6%;
      background: url('/art/from-your-kids/journal-spread.webp') center / 100% 100% no-repeat;
      color: #20303f;
    }
    .paper { min-width: 0; }
    .paper:first-child { padding-inline-end: 13%; }
    .paper + .paper { padding-inline-start: 13%; }
    .cover { align-self: center; text-align: center; }
    .cover img { width: 3rem; }
    .empty-book .paper + .paper { align-self: center; }
    .empty-book p { margin: .55rem 0; }
    .index-page nav { display: grid; gap: .5rem; max-height: 19rem; overflow: auto; padding: .2rem; }
    .entry-choice { display: grid; grid-template-columns: minmax(0,1fr) auto; gap: .18rem .6rem; align-items: center;
      width: 100%; text-align: left; background: #fff8e8; border: 1px solid #c9ae8a; color: #20303f; }
    .entry-choice[aria-current="page"] { background: #dce8d7; border-color: #4f7669; }
    .entry-choice time { grid-column: 1; font-size: .8rem; }
    .entry-chevron { grid-column: 2; grid-row: 1 / span 2; font-size: 1.35rem; }
    article time { display: inline-block; justify-self: start; border-radius: var(--radius-pill); padding: .25rem .65rem; background: #f0dcb1; }
    article h3 { font-size: clamp(1.2rem, 2.8vw, 1.8rem); margin: .65rem 0 .55rem; }
    h2, h3 { font-family: Georgia, serif; overflow-wrap: anywhere; }
    h2 { font-size: clamp(1.2rem, 3vw, 1.85rem); margin: 0 0 .5rem; }
    .mood { display: flex; align-items: center; gap: .4rem; font-weight: 700; margin: .5rem 0; }
    .mood img { width: 1.85rem; height: 1.85rem; object-fit: contain; }
    .entry { white-space: pre-wrap; overflow-wrap: anywhere; line-height: 1.65; }
    article.paper::after { content: ''; display: block; width: 2.25rem; height: 2.25rem; margin-top: .75rem;
      background: url('/art/from-your-kids/journal-heart.webp') center / contain no-repeat; }
    .pager { display: flex; justify-content: center; align-items: center; flex-wrap: wrap; gap: .65rem; }
    button { min-height: 44px; border: 1px solid var(--color-outline); border-radius: .65rem; padding: .5rem .8rem; color: var(--color-text); background: var(--color-surface); cursor: pointer; }
    button:disabled { opacity: .5; cursor: default; }
    button:focus-visible { outline: 3px solid var(--color-focus); outline-offset: 2px; }
    .back-to-entries { display: none; }
    @media (max-width: 40rem) {
      .book { grid-template-columns: minmax(0, 1fr); min-height: 0; padding: 0; background: none; color: var(--color-text); }
      .book .paper { padding: 0; }
      .cover, article.paper, .pager, .reading .index-page { display: none; }
      .reading article.paper, .pager.reading { display: grid; }
      .pager.reading { display: flex; }
      .index-page nav { max-height: none; }
      .entry-choice { background: var(--color-surface); border-color: var(--color-divider); color: var(--color-text); }
      .entry-choice[aria-current="page"] { background: var(--color-surface); border-color: var(--color-divider); }
      .book article.paper, .empty-book .paper + .paper { padding: 1rem; border-radius: .85rem; background: #fff3d6 url('/art/from-your-kids/journal-page.webp') center / cover; color: #20303f; }
      .back-to-entries { display: block; justify-self: start; margin-bottom: .75rem; }
    }
  `,
})
export class KidsDiary {
  readonly entries = input<readonly KidsDiaryEntry[]>([]);
  protected readonly moodCharacter = MOOD_CHARACTER;
  protected readonly index = signal(0);
  protected readonly reading = signal(false);
  private readonly injector = inject(Injector);
  private readonly backToEntries = viewChild<ElementRef<HTMLButtonElement>>('backToEntries');
  private lastEntryButton: HTMLElement | null = null;

  protected selectEntry(index: number): void {
    this.lastEntryButton = typeof document === 'undefined' ? null : document.activeElement as HTMLElement | null;
    this.index.set(index);
    this.reading.set(true);
    afterNextRender(() => {
      const back = this.backToEntries()?.nativeElement;
      if (back?.getClientRects().length) back.focus();
    }, { injector: this.injector });
  }

  protected showEntries(): void {
    this.reading.set(false);
    afterNextRender(() => this.lastEntryButton?.focus(), { injector: this.injector });
  }

  protected readonly ordered = computed(() => [...this.entries()].sort((a,b) => b.createdAt.localeCompare(a.createdAt)));
  protected readonly current = computed(() => this.ordered()[Math.min(this.index(), this.ordered().length - 1)] ?? null);
  private touchStartX: number | null = null;
  protected onTouchStart(event: TouchEvent): void { this.touchStartX = event.changedTouches[0]?.clientX ?? null; }
  protected onTouchEnd(event: TouchEvent): void {
    const endX = event.changedTouches[0]?.clientX;
    if (this.touchStartX === null || endX === undefined) return;
    const delta = endX - this.touchStartX;
    this.touchStartX = null;
    if (Math.abs(delta) < 60) return;
    if (delta < 0) this.next(); else this.previous();
  }
  protected previous(): void { this.index.update(i => Math.max(0, i - 1)); }
  protected next(): void { this.index.update(i => Math.min(this.ordered().length - 1, i + 1)); }
}
