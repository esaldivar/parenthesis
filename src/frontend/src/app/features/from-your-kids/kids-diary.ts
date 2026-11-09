import { ChangeDetectionStrategy, Component, computed, input, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
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
      <div class="book empty-book" aria-label="Empty diary">
        <div class="paper cover"><h2>Dear Diary</h2><p>Little stories, big feelings.</p><img src="/art/from-your-kids/journal-heart.webp" alt="" /></div>
        <div class="paper"><p>No diary entries shared with you yet.</p>
          <p>When your child shares an entry, you'll be able to turn its pages here.</p>
        </div>
      </div>
    } @else {
      <section class="book" aria-label="Shared diary" (touchstart)="onTouchStart($event)" (touchend)="onTouchEnd($event)">
        <div class="paper index-page"><h2>Diary Entries</h2>
          <nav aria-label="Choose diary entry">
            @for (entry of ordered(); track entry.id; let i = $index) {
              <button type="button" class="entry-choice" [attr.aria-current]="index() === i ? 'page' : null" (click)="index.set(i)">
                <time [attr.datetime]="entry.createdAt">{{ entry.createdAt | date:'mediumDate' }}</time>
                <strong>{{ entry.title || 'A diary entry' }}</strong>
              </button>
            }
          </nav>
        </div>
        <article class="paper" aria-live="polite">
          @if (current(); as entry) {
            <time [attr.datetime]="entry.createdAt">{{ entry.createdAt | date:'mediumDate' }}</time>
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
      <nav class="pager" aria-label="Diary pages">
        <button type="button" (click)="previous()" [disabled]="index() === 0" aria-label="Previous diary page">← Previous</button>
        <span aria-live="polite">Page {{ index() + 1 }} of {{ ordered().length }}</span>
        <button type="button" (click)="next()" [disabled]="index() >= ordered().length - 1" aria-label="Next diary page">Next →</button>
      </nav>
    }
  `,
  imports: [DatePipe],
  styles: `
    :host { display: grid; gap: 1rem; --journal-ink: #20303f; --journal-paper: #fffaeb; --journal-edge: #eed9b6;
      --journal-line: #c9a97b; --journal-date: #f2dfb9; }
    :host-context([data-theme='dark']) { --journal-ink: #f7f5ed; --journal-paper: #223c31;
      --journal-edge: #152a22; --journal-line: #57796b; --journal-date: #345244; }
    @media (prefers-color-scheme: dark) {
      :host-context(html:not([data-theme])) { --journal-ink: #f7f5ed; --journal-paper: #223c31;
        --journal-edge: #152a22; --journal-line: #57796b; --journal-date: #345244; }
    }
    .book { position: relative; display: grid; grid-template-columns: repeat(2,minmax(0,1fr));
      padding: .3rem; border: .25rem solid var(--color-outline); border-radius: 1.45rem 1.2rem 1.4rem 1.15rem;
      background: var(--color-selected); box-shadow: 0 .45rem .85rem #0003; color: var(--journal-ink); }
    .book::after { content: ''; position: absolute; inset: 1.5rem auto 1.5rem 50%; width: 2.4rem;
      transform: translateX(-50%); background: url('/art/from-your-kids/journal-rings.webp') top center / 100% auto repeat-y;
      pointer-events: none; }
    .paper { min-height: 19rem; padding: clamp(1.25rem,3vw,2.65rem);
      border-radius: 1rem .35rem .5rem 1rem; border: 1px solid var(--journal-line);
      background: radial-gradient(ellipse at center, var(--journal-paper) 52%, var(--journal-edge)); }
    .paper + .paper { border-radius: .35rem 1rem 1rem .5rem; }
    article.paper { overflow-wrap: anywhere; }
    .cover img { width: 3rem; }
    .mood img { width: 1.85rem; height: 1.85rem; object-fit: contain; }
    article.paper::after { content: ''; display: block; width: 2.5rem; height: 2.5rem; margin-block-start: 1.15rem;
      background: url('/art/from-your-kids/journal-heart.webp') center / contain no-repeat; }
    .cover { display: grid; align-content: center; justify-items: center; text-align: center; }
    .index-page nav { display: grid; gap: .6rem; margin-top: 1rem; }
    .entry-choice { display: grid; gap: .3rem; width: 100%; text-align: left; background: var(--color-surface); border: 1px solid var(--color-divider); }
    .entry-choice[aria-current="page"] { background: var(--color-selected); border-color: var(--color-action); }
    .entry-choice time { font-size: .8rem; }
    article time { display: inline-block; border-radius: var(--radius-pill); padding: .25rem .65rem; background: var(--journal-date); }
    article h3 { font-size: clamp(1.15rem, 2.8vw, 1.7rem); margin-block: .75rem .5rem; }
    .entry { line-height: 1.65; }
    h2,h3 { font-family: Georgia,serif; }
    h2 { font-size: clamp(1.5rem,3vw,2.3rem); }
    .mood { display: flex; align-items: center; gap: .4rem; font-weight: 700; }
    .mood span { font-size: 1.5rem; }
    .entry { white-space: pre-wrap; overflow-wrap: anywhere; }
    .pager { display: flex; justify-content: center; align-items: center; flex-wrap: wrap; gap: 1rem; }
    button { min-height: 44px; border: 1px solid var(--color-outline); border-radius: .5rem; padding: .5rem 1rem; color: var(--color-text); background: var(--color-surface); cursor: pointer; }
    button:disabled { opacity: .5; cursor: default; }
    button:focus-visible { outline: 3px solid var(--color-focus); outline-offset: 2px; }
    @media (max-width: 40rem) { .book { grid-template-columns: 1fr; } .book::after,.cover,.index-page { display: none; } .paper { min-height: 14rem; } .paper + .paper { border-radius: .9rem; } }
  `,
})
export class KidsDiary {
  readonly entries = input<readonly KidsDiaryEntry[]>([]);
  protected readonly moodCharacter = MOOD_CHARACTER;
  protected readonly index = signal(0);
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
