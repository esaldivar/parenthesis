import { ChangeDetectionStrategy, Component, computed, input, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { KidsDiaryEntry } from './from-your-kids-contract';

/** Parent-only, read-only diary: newest first; no reactions or editing. */
@Component({
  selector: 'app-kids-diary',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (ordered().length === 0) {
      <div class="book empty-book" aria-label="Empty diary">
        <div class="paper cover"><h2>Dear Diary</h2><p>Little stories, big feelings.</p></div>
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
            <p class="mood">{{ entry.mood }}</p>
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
    :host { display: grid; gap: 1rem; }
    .book { display: grid; grid-template-columns: repeat(2,minmax(0,1fr)); border: 7px solid #5e8f7e; border-radius: 1rem; overflow: hidden; box-shadow: 0 8px 20px #0002; color: #20303f; }
    .paper { min-height: 19rem; padding: clamp(1rem,3vw,2rem); background: repeating-linear-gradient(#fff9ed,#fff9ed 30px,#e5ded1 31px); }
    .paper + .paper { border-left: 2px solid #d6cbb9; }
    .cover { display: grid; align-content: center; justify-items: center; text-align: center; }
    .index-page nav { display: grid; gap: .6rem; margin-top: 1rem; }
    .entry-choice { display: grid; gap: .3rem; width: 100%; text-align: left; background: #fff9ed; border: 1px solid #e2d4c5; }
    .entry-choice[aria-current="page"] { background: #e8d9f1; border-color: #a38aba; }
    .entry-choice time { font-size: .8rem; }
    h2,h3 { font-family: Georgia,serif; }
    h2 { font-size: clamp(1.5rem,3vw,2.3rem); }
    .mood { font-weight: 700; color: #5e8f7e; }
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
