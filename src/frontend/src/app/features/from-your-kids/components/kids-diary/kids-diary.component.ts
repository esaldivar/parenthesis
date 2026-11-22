import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  Injector,
  afterNextRender,
  computed,
  effect,
  inject,
  input,
  signal,
  untracked,
  viewChildren,
} from '@angular/core';
import { AppDatePipe } from '../../../../core/i18n/locale-formatting';
import { TranslatePipe } from '../../../../core/i18n/translations';
import { KidsDiaryEntry } from '../../from-your-kids-contract';

/** Parent-only presentation of authorized entries. No authoring or reactions (#712). */
@Component({
  selector: 'app-kids-diary',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [TranslatePipe, AppDatePipe],
  templateUrl: './kids-diary.component.html',
  styleUrl: './kids-diary.component.scss',
})
export class KidsDiary {
  readonly entries = input<readonly KidsDiaryEntry[]>([]);
  readonly scope = input<string | null>(null);
  protected readonly ordered = computed(() =>
    [...this.entries()].sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
  );
  protected readonly spread = signal(0);
  protected readonly spreadCount = computed(() => Math.ceil(this.ordered().length / 2));
  protected readonly current = computed(() =>
    this.ordered().slice(this.spread() * 2, this.spread() * 2 + 2),
  );
  protected readonly turn = signal<'older' | 'newer' | null>(null);
  protected readonly turnId = signal(0);
  protected readonly awayFromTop = signal(false);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly injector = inject(Injector);
  private readonly destroy = inject(DestroyRef);
  private readonly sheets = viewChildren<ElementRef<HTMLElement>>('sheet');

  constructor() {
    effect(() => {
      this.entries();
      this.scope();
      untracked(() => {
        this.spread.set(0);
        this.turn.set(null);
        this.awayFromTop.set(false);
      });
    });
    afterNextRender(
      () => {
        // Capture also sees the stationary parent shell's scrolling main pane.
        const update = () => this.updateScrollPosition();
        window.addEventListener('scroll', update, { capture: true, passive: true });
        window.addEventListener('resize', update, { passive: true });
        this.destroy.onDestroy(() => {
          window.removeEventListener('scroll', update, true);
          window.removeEventListener('resize', update);
        });
      },
      { injector: this.injector },
    );
  }

  protected newer(): void {
    this.goTo(this.spread() - 1);
  }
  protected older(): void {
    this.goTo(this.spread() + 1);
  }
  protected newest(): void {
    this.goTo(0);
  }

  private goTo(next: number): void {
    if (next < 0 || next >= this.spreadCount() || next === this.spread()) return;
    this.turn.set(next > this.spread() ? 'older' : 'newer');
    this.spread.set(next);
    this.turnId.update((value) => value + 1);
    afterNextRender(
      () => {
        const papers = this.host.nativeElement.querySelectorAll<HTMLElement>(
          '.desktop-book .entry-scroll',
        );
        papers.forEach((paper) => {
          paper.scrollTop = 0;
        });
        papers[0]?.focus({ preventScroll: true });
      },
      { injector: this.injector },
    );
  }

  protected top(): void {
    const sheet = this.sheets()[0]?.nativeElement;
    if (!sheet) return;
    sheet.focus({ preventScroll: true });
    sheet.scrollIntoView({
      block: 'start',
      behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches
        ? 'instant'
        : 'smooth',
    });
  }

  private updateScrollPosition(): void {
    const sheet = this.sheets()[0]?.nativeElement;
    this.awayFromTop.set(
      !!sheet &&
        window.matchMedia('(max-width: 48rem)').matches &&
        // Fractional layout rounding can leave a sheet a fraction of a pixel above zero after scrollIntoView.
        sheet.getBoundingClientRect().top < -2,
    );
  }
}
