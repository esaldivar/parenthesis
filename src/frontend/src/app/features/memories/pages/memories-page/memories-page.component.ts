import { LocaleService } from '../../../../core/i18n/locale.service';
import { TranslatePipe, translate } from '../../../../core/i18n/translations';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  signal,
  untracked,
} from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { RouterLink } from '@angular/router';
import { Api, FamilyMember, Memory } from '../../../../core/api/api';
import { generalMessage, toProblem } from '../../../../core/api/problem';
import { AuthStore } from '../../../../core/auth/auth.store';
import {
  PHOTOS_NOW,
  RETENTION_DAYS,
  expiry,
  expiryChip,
  familyDate,
  shortDate,
  whoseText,
} from '../../photo-text';
import { monthYear } from '../../../../core/dates/dates';
import { MemoryCover, TimeLeft } from '../../components/memory-cover/memory-cover.component';

/**
 * Family Memories (#403): one memory per event with photos the viewer may see, newest event first. It replaces the
 * "coming soon" page. Photos are temporary, so each memory says when its first photo goes.
 */
@Component({
  selector: 'app-memories-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [TranslatePipe, MatButtonModule, RouterLink, MemoryCover, TimeLeft],
  template: `
    <header class="memories-header">
      <div>
        <h1>{{ 'feature.family.memories' | tr }}</h1>
        <p class="tagline">{{ 'feature.the.little.things.are.worth.remembering' | tr }}</p>
      </div>
      <span class="memories-header__art" aria-hidden="true"></span>
    </header>
    <p class="intro">
      {{ 'feature.photos.from.your.events.each.photo.is' | tr }} {{ retentionDays }} {{ 'feature.days.after.it.s.added.so.download' | tr }}
    </p>

    @switch (state()) {
      @case ('loading') {
        <p class="muted" role="status">{{ 'feature.loading.memories' | tr }}</p>
      }
      @case ('error') {
        <p class="error" role="alert">{{ error() }}</p>
        <button mat-stroked-button type="button" (click)="load()">{{ 'feature.try.again' | tr }}</button>
      }
      @case ('ready') {
        @if (rows().length === 0) {
          <div class="empty">
            <span class="empty__sheets" aria-hidden="true"></span>
            <h2 class="empty__title">{{ 'feature.no.memories.yet' | tr }}</h2>
            <p class="muted">{{ 'feature.add.photos.to.a.confirmed.event.on' | tr }}</p>
            <a mat-stroked-button routerLink="/calendar">{{ 'feature.open.calendar' | tr }}</a>
          </div>
        } @else {
          @for (group of months(); track group.key) {
            <section class="month" [attr.aria-labelledby]="'month-' + group.key">
              <h2 class="month__title" [id]="'month-' + group.key">{{ group.label }}</h2>
              <ul class="memories">
                @for (row of group.rows; track row.memory.eventId) {
                  <li class="entry" [class.entry--soon]="row.soon">
                    <span class="entry__dot" [attr.data-soonest]="row.soonest" aria-hidden="true"></span>
                    <a class="memory" [routerLink]="['/memories', row.memory.eventId]">
                      <app-memory-cover [src]="row.memory.coverThumbnailUrl" />
                      <span class="memory__text">
                        <span class="memory__title">{{ row.memory.title }}<span class="visually-hidden">.</span></span>
                        <span class="muted">{{ row.date }} · {{ row.count }} · {{ row.whose }}<span class="visually-hidden">.</span></span>
                        @if (row.soon) {
                          <app-time-left [percent]="row.left" />
                        }
                        <span class="chip" [attr.data-soon]="row.soon">{{ row.expiry }}</span>
                        @if (row.soon) {
                          <span class="save-cue"><span class="visually-hidden">. </span><span class="save-cue__wide">{{ 'memory.list.openToSave' | tr }}</span><span class="save-cue__narrow">{{ 'memory.list.savePhotos' | tr }}</span></span>
                        }
                      </span>
                    </a>
                  </li>
                }
              </ul>
            </section>
          }
        }
      }
    }
  `,
  styles: `
    :host {
      display: grid;
      gap: var(--space-4);
      align-content: start;
      container: memories / inline-size;
    }
    h1,
    h2,
    p {
      margin: 0;
    }
    .memories-header {
      display: grid;
      grid-template-columns: minmax(0, 1fr) minmax(0, 42%);
      align-items: center;
      min-height: 7rem;
      border-radius: var(--radius-card);
      background: var(--color-surface);
      overflow: hidden;
    }
    .memories-header > div {
      padding: var(--space-4) 0 var(--space-4) var(--space-4);
      font-family: Georgia, serif;
      overflow-wrap: anywhere;
    }
    .memories-header h1 {
      font-family: inherit;
      font-size: clamp(1.5rem, 5cqi, 3rem);
      line-height: 1.05;
    }
    .tagline {
      margin-top: var(--space-2);
      font-style: italic;
      color: var(--color-text-secondary);
    }
    .memories-header__art {
      align-self: stretch;
      background: url('/art/family-memories-light.webp') right center / contain no-repeat;
      mask-image: linear-gradient(to right, transparent, black 16%);
    }
    :host-context(html[data-theme='dark']) .memories-header__art {
      background-image: url('/art/family-memories-dark.webp');
    }
    @media (prefers-color-scheme: dark) {
      :host-context(html:not([data-theme])) .memories-header__art {
        background-image: url('/art/family-memories-dark.webp');
      }
    }
    .intro,
    .muted {
      color: var(--color-text-secondary);
    }
    .intro {
      max-width: 40rem;
    }
    .error {
      color: var(--color-danger);
    }
    /* #717: an album timeline. Months are headings; each memory is one link on a thin rail. */
    .month {
      display: grid;
      gap: var(--space-2);
    }
    .month__title {
      margin: var(--space-2) 0 0;
      font-size: 1.125rem;
      font-weight: 800;
    }
    .memories {
      --rail: light-dark(#d3dfd8, #355446);
      --soon: light-dark(#e0714f, #f08a6b);
      --soon-ink: light-dark(#9a3b1f, #f5b7a3);
      --soon-line: light-dark(#f2b9a5, #7a3f2e);
      position: relative;
      display: grid;
      gap: var(--space-3);
      margin: 0;
      padding: 0 0 0 1.5rem;
      list-style: none;
    }
    .memories::before {
      content: '';
      position: absolute;
      inset: 0 auto 0 0.3rem;
      width: 1.5px;
      background: var(--rail);
    }
    .entry {
      position: relative;
    }
    .entry__dot {
      position: absolute;
      top: 2.25rem;
      left: calc(-1.5rem + 0.3rem - 4.25px);
      width: 10px;
      height: 10px;
      border-radius: 50%;
      background: var(--color-leaf-strong);
    }
    .entry__dot[data-soonest='true'] {
      background: var(--soon);
    }
    .memory {
      display: grid;
      grid-template-columns: clamp(5.5rem, 30cqi, 6.5rem) minmax(0, 1fr);
      gap: var(--space-3);
      align-items: center;
      padding: var(--space-3);
      border: 1px solid transparent;
      border-radius: 18px;
      background: var(--color-surface);
      box-shadow: 0 4px 12px rgb(25 36 31 / 10%);
      color: var(--color-text);
      text-decoration: none;
    }
    .entry--soon .memory {
      border-color: var(--soon-line);
    }
    .memory:hover .memory__title {
      text-decoration: underline;
    }
    .memory:focus-visible {
      outline: 3px solid var(--color-focus);
      outline-offset: 2px;
    }
    .memory__text {
      display: grid;
      justify-items: start;
      gap: var(--space-1);
      min-width: 0;
      overflow-wrap: anywhere;
    }
    .memory__title {
      font-size: 1.0625rem;
      font-weight: 700;
    }
    .chip {
      color: var(--color-text-secondary);
      font-size: 0.8125rem;
    }
    .chip[data-soon='true'] {
      color: var(--soon-ink);
      font-weight: 600;
    }
    .save-cue {
      margin-top: var(--space-1);
      padding: 0.45rem 0.9rem;
      border-radius: 12px;
      background: var(--color-action);
      color: var(--color-on-action);
      font-size: 0.875rem;
      font-weight: 600;
    }
    .save-cue__wide {
      display: none;
    }
    @container memories (min-width: 42rem) {
      .memories-header {
        min-height: 10rem;
      }
      .memories-header > div {
        padding-left: var(--space-6);
      }
      .month__title {
        font-size: 1.25rem;
      }
      .memories {
        padding-left: 2rem;
      }
      .memories::before {
        left: 0.4rem;
      }
      .entry__dot {
        top: 3.4rem;
        left: calc(-2rem + 0.4rem - 4.25px);
      }
      .memory {
        grid-template-columns: 12.5rem minmax(0, 1fr);
        gap: var(--space-6);
        padding: var(--space-4) var(--space-6) var(--space-4) var(--space-4);
      }
      .memory__title {
        font-size: 1.375rem;
      }
      .save-cue__wide {
        display: inline;
      }
      .save-cue__narrow {
        display: none;
      }
    }
    /* Empty (#717): blank album sheets, the honest copy and the way to add photos. */
    .empty {
      --paper: light-dark(#fffdf8, #e9e4d8);
      /* Keeps the sheets' paper (z-index -1) above the card's background. */
      isolation: isolate;
      display: grid;
      justify-items: center;
      gap: var(--space-3);
      padding: var(--space-6) var(--space-4);
      border-radius: 18px;
      background: var(--color-surface);
      box-shadow: 0 4px 12px rgb(25 36 31 / 10%);
      text-align: center;
    }
    .empty__sheets {
      position: relative;
      width: 7rem;
      aspect-ratio: 1.38;
      margin-block: var(--space-2) var(--space-3);
      border: 4px solid #ffffff;
      border-radius: 8px;
      background: light-dark(#e3eae6, #2c463b);
      box-shadow: 0 2px 6px rgb(0 0 0 / 12%);
    }
    .empty__sheets::before,
    .empty__sheets::after {
      content: '';
      position: absolute;
      inset: -4px;
      z-index: -1;
      border-radius: 8px;
      background: var(--paper);
      box-shadow: 0 2px 6px rgb(0 0 0 / 12%);
      transform: translate(-8px, 2px) rotate(-6deg);
    }
    .empty__sheets::after {
      transform: translate(8px, 4px) rotate(5deg);
    }
    .empty__title {
      font-size: 1.375rem;
    }
    .empty .muted {
      max-width: 30rem;
    }
    .empty a[mat-stroked-button] {
      justify-self: center;
    }
    a[mat-stroked-button],
    button[mat-stroked-button] {
      min-height: var(--target-min);
      justify-self: start;
    }
  `,
})
export class MemoriesPage {
  private readonly copyLocale = inject(LocaleService);
  private readonly api = inject(Api);
  private readonly auth = inject(AuthStore);
  private readonly now = inject(PHOTOS_NOW);

  protected readonly retentionDays = RETENTION_DAYS;
  protected readonly state = signal<'loading' | 'ready' | 'error'>('loading');
  protected readonly error = signal<string | null>(null);
  private readonly memories = signal<readonly Memory[]>([]);
  private readonly members = signal<readonly FamilyMember[]>([]);
  private readonly family = computed(() => this.auth.currentFamily());

  protected readonly rows = computed(() => {
    const zone = this.family()?.timeZone ?? 'UTC';
    const now = this.now();
    const coParent =
      this.members().find((m) => m.role === 'Parent' && !m.isYou)?.displayName ?? null;
    const locale = this.copyLocale.locale();
    return this.memories().map((memory) => {
      const e = expiry(memory.expiresAt, zone, now, locale);
      return {
        memory,
        day: familyDate(memory.startsAt, zone),
        left: Math.min(100, (e.days / RETENTION_DAYS) * 100),
        days: e.days,
        date: shortDate(familyDate(memory.startsAt, zone), locale),
        count: translate(memory.photoCount === 1 ? 'memory.onePhoto' : 'memory.photoCount', locale, { count: memory.photoCount }),
        whose: whoseText(memory, coParent, locale),
        expiry: expiryChip(e, locale),
        soon: e.soon,
      };
    });
  });

  /**
   * The timeline (#717): memories grouped by the month of their event in the family's zone, in the server's
   * newest-first order. The memory deleted soonest within the final week gets the coral dot.
   */
  protected readonly months = computed(() => {
    const locale = this.copyLocale.locale();
    const rows = this.rows();
    const soon = rows.filter((row) => row.soon);
    const soonest = soon.length ? soon.reduce((a, b) => (b.days < a.days ? b : a)) : null;
    const groups: { key: string; label: string; rows: (typeof rows[number] & { soonest: boolean })[] }[] = [];
    for (const row of rows) {
      const key = row.day.slice(0, 7);
      let group = groups.find((g) => g.key === key);
      if (!group) {
        group = { key, label: monthYear(row.day, locale === 'en' ? 'en-US' : locale), rows: [] };
        groups.push(group);
      }
      group.rows.push({ ...row, soonest: row === soonest });
    }
    return groups;
  });

  constructor() {
    effect(() => {
      const family = this.family();
      untracked(() => {
        if (family) {
          void this.load();
        }
      });
    });
  }

  protected async load(): Promise<void> {
    const familyId = this.family()?.id;
    if (!familyId) {
      return;
    }
    this.state.set('loading');
    this.error.set(null);
    try {
      const [memories, family] = await Promise.all([
        this.api.memories(familyId),
        this.api.family(familyId),
      ]);
      this.memories.set(memories);
      this.members.set(family.members);
      this.state.set('ready');
    } catch (error) {
      this.error.set(translate('memory.list.loadError', this.copyLocale.locale(), { reason: generalMessage(toProblem(error)) }));
      this.state.set('error');
    }
  }
}
