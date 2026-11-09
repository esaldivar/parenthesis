import { AppDatePipe } from '../../core/i18n/locale-formatting';
import { TranslatePipe } from '../../core/i18n/translations';
import { ChangeDetectionStrategy, Component, computed, input, signal } from '@angular/core';
import { KidsDiaryEntry, KidsMood } from './from-your-kids-contract';

const MOOD_CHARACTER: Record<KidsMood, string> = {
  Happy: '🌞',
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
        <div class="paper cover"><h2>{{ 'feature.dear.diary' | tr }}</h2><p>{{ 'feature.little.stories.big.feelings' | tr }}</p></div>
        <div class="paper"><p>{{ 'feature.no.diary.entries.shared.with.you.yet' | tr }}</p>
          <p>{{ 'feature.when.your.child.shares.an.entry.you' | tr }}</p>
        </div>
      </div>
    } @else {
      <section class="book" aria-label="{{ 'feature.shared.diary' | tr }}" (touchstart)="onTouchStart($event)" (touchend)="onTouchEnd($event)">
        <div class="paper index-page"><h2>{{ 'feature.diary.entries' | tr }}</h2>
          <nav aria-label="{{ 'feature.choose.diary.entry' | tr }}">
            @for (entry of ordered(); track entry.id; let i = $index) {
              <button type="button" class="entry-choice" [attr.aria-current]="index() === i ? 'page' : null" (click)="index.set(i)">
                <time [attr.datetime]="entry.createdAt">{{ entry.createdAt | appDate:'mediumDate' }}</time>
                <strong>{{ entry.title || 'A diary entry' }}</strong>
              </button>
            }
          </nav>
        </div>
        <article class="paper" aria-live="polite">
          @if (current(); as entry) {
            <time [attr.datetime]="entry.createdAt">{{ entry.createdAt | appDate:'mediumDate' }}</time>
            <p class="mood"><span aria-hidden="true">{{ moodCharacter[entry.mood] }}</span> {{ entry.mood }}</p>
            @if (entry.title) { <h3>{{ entry.title }}</h3> }
            <p class="entry">{{ entry.body }}</p>
          }
        </article>
      </section>
      <nav class="pager" aria-label="{{ 'feature.diary.pages' | tr }}">
        <button type="button" (click)="previous()" [disabled]="index() === 0" aria-label="{{ 'feature.previous.diary.page' | tr }}">{{ 'feature.previous' | tr }}</button>
        <span aria-live="polite">{{ 'feature.page' | tr }} {{ index() + 1 }} {{ 'feature.of' | tr }} {{ ordered().length }}</span>
        <button type="button" (click)="next()" [disabled]="index() >= ordered().length - 1" aria-label="{{ 'feature.next.diary.page' | tr }}">{{ 'feature.next' | tr }}</button>
      </nav>
    }
  `,
  imports: [TranslatePipe, AppDatePipe],
  styles: `
    :host { display: grid; gap: 1rem; }
    .book { display: grid; grid-template-columns: repeat(2,minmax(0,1fr)); border: 7px solid #5e8f7e; border-radius: 1rem; overflow: hidden; box-shadow: 0 8px 20px #0002; color: #20303f; }
    .paper { min-height: 19rem; padding: clamp(1rem,3vw,2rem); background: repeating-linear-gradient(#fff9ed,#fff9ed 30px,#e5ded1 31px); }
    .paper + .paper { border-left: 2px solid #d6cbb9; }
    .cover { display: grid; align-content: center; justify-items: center; text-align: center; }
    .index-page nav { display: grid; gap: .6rem; margin-top: 1rem; }
    .entry-choice { display: grid; gap: .3rem; width: 100%; text-align: left; background: var(--color-surface); border: 1px solid var(--color-divider); }
    .entry-choice[aria-current="page"] { background: var(--color-selected); border-color: var(--color-action); }
    .entry-choice time { font-size: .8rem; }
    h2,h3 { font-family: Georgia,serif; }
    h2 { font-size: clamp(1.5rem,3vw,2.3rem); }
    .mood { display: flex; align-items: center; gap: .4rem; font-weight: 700; }
    .mood span { font-size: 1.5rem; }
    .entry { white-space: pre-wrap; overflow-wrap: anywhere; }
    .pager { display: flex; justify-content: center; align-items: center; flex-wrap: wrap; gap: 1rem; }
    button { min-height: 44px; border: 1px solid var(--color-outline); border-radius: .5rem; padding: .5rem 1rem; color: var(--color-text); background: var(--color-surface); cursor: pointer; }
    button:disabled { opacity: .5; cursor: default; }
    button:focus-visible { outline: 3px solid var(--color-focus); outline-offset: 2px; }
    @media (max-width: 40rem) { .book { grid-template-columns: 1fr; } .cover,.index-page { display: none; } .paper + .paper { border-left: 0; } }
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
