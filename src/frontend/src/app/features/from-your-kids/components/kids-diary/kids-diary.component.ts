import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  Injector,
  afterNextRender,
  afterRenderEffect,
  computed,
  effect,
  inject,
  input,
  signal,
  untracked,
  viewChild,
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
  private readonly entryTexts = viewChildren<ElementRef<HTMLElement>>('entryText');
  private readonly reader = viewChild<ElementRef<HTMLDialogElement>>('reader');
  /** Entries too long for their page: clipped, with a button that opens the whole entry (no scroll box). */
  protected readonly clipped = signal<ReadonlySet<string>>(new Set());
  /** The entry open in the reader dialog. */
  protected readonly reading = signal<KidsDiaryEntry | null>(null);
  private readerOpener: HTMLElement | null = null;

  constructor() {
    // Measure each page's text: what doesn't fit is clipped and offered whole from a button.
    afterRenderEffect((onCleanup) => {
      const texts = this.entryTexts().map((ref) => ref.nativeElement);
      const measure = () => {
        const next = new Set(texts.filter((el) => el.scrollHeight > el.clientHeight + 1).map((el) => el.dataset['entry'] ?? ''));
        const now = this.clipped();
        if (next.size !== now.size || [...next].some((id) => !now.has(id))) this.clipped.set(next);
      };
      measure();
      if (typeof ResizeObserver === 'undefined') return;
      const observer = new ResizeObserver(measure);
      texts.forEach((el) => observer.observe(el));
      onCleanup(() => observer.disconnect());
    });
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
        this.host.nativeElement
          .querySelector<HTMLElement>('.desktop-book .paper')
          ?.focus({ preventScroll: true });
      },
      { injector: this.injector },
    );
  }

  /** Opens the whole of a long entry in the reader dialog; focus returns to its button when it closes. */
  protected read(entry: KidsDiaryEntry): void {
    this.readerOpener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    this.reading.set(entry);
    afterNextRender(() => this.reader()?.nativeElement.showModal(), { injector: this.injector });
  }

  protected closeReader(): void {
    this.reading.set(null);
    this.readerOpener?.focus({ preventScroll: true });
    this.readerOpener = null;
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
