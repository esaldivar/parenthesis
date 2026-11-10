import { LocaleService } from '../../core/i18n/locale.service';
import { TranslatePipe, translate } from '../../core/i18n/translations';
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
import { Api, FamilyMember, Memory } from '../../core/api/api';
import { generalMessage, toProblem } from '../../core/api/problem';
import { AuthStore } from '../../core/auth/auth.store';
import { EmptyState } from '../../shared/empty-state/empty-state';
import { Icon } from '../../shared/icon/icon';
import { monthDay } from '../dashboard/week';
import {
  PHOTOS_NOW,
  RETENTION_DAYS,
  expiry,
  expiryChip,
  familyDate,
  whoseText,
} from './photo-text';

/**
 * Family Memories (#403): one memory per event with photos the viewer may see, newest event first. It replaces the
 * "coming soon" page. Photos are temporary, so each memory says when its first photo goes.
 */
@Component({
  selector: 'app-memories-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [TranslatePipe, MatButtonModule, RouterLink, EmptyState, Icon],
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
          <app-empty-state
            icon="album"
            title="{{ 'feature.no.memories.yet' | tr }}"
            body="{{ 'feature.add.photos.to.a.confirmed.event.on' | tr }}"
          >
            <a mat-stroked-button routerLink="/calendar">{{ 'feature.open.calendar' | tr }}</a>
          </app-empty-state>
        } @else {
          <ul class="memories">
            @for (row of rows(); track row.memory.eventId) {
              <li>
                <a class="memory" [routerLink]="['/memories', row.memory.eventId]">
                  <img [src]="row.memory.coverThumbnailUrl" alt="" loading="lazy" />
                  <span class="memory__text">
                    <span class="memory__title">{{ row.memory.title }}<span class="visually-hidden">.</span></span>
                    <span class="muted">{{ row.date }} · {{ row.count }} · {{ row.whose }}<span class="visually-hidden">.</span></span>
                    <span class="chip" [attr.data-soon]="row.soon">{{ row.expiry }}</span>
                  </span>
                  <app-icon name="chevron-right" [size]="20" aria-hidden="true" />
                </a>
              </li>
            }
          </ul>
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
    .memories {
      list-style: none;
      margin: 0;
      padding: 0;
      display: grid;
      gap: var(--space-3);
      grid-template-columns: minmax(0, 1fr);
    }
    .memory {
      display: grid;
      grid-template-columns: clamp(3.5rem, 23cqi, 6rem) minmax(0, 1fr) auto;
      gap: var(--space-2);
      align-items: center;
      min-height: var(--target-min);
      padding: var(--space-2);
      border: 1px solid var(--color-divider);
      border-radius: var(--radius-card);
      background: var(--color-surface);
      color: var(--color-text);
      text-decoration: none;
    }
    .memory:hover .memory__title {
      text-decoration: underline;
    }
    .memory:focus-visible {
      outline: 3px solid var(--color-focus);
      outline-offset: 2px;
    }
    .memory img {
      width: 100%;
      aspect-ratio: 1;
      object-fit: cover;
      border-radius: 8px;
      background: var(--color-surface-soft);
    }
    .memory__text {
      display: grid;
      gap: var(--space-1);
      min-width: 0;
      overflow-wrap: anywhere;
    }
    .memory__title {
      font-family: Georgia, serif;
      font-weight: 700;
    }
    @container memories (min-width: 42rem) {
      .memories-header {
        min-height: 10rem;
      }
      .memories-header > div {
        padding-left: var(--space-6);
      }
      .memories {
        grid-template-columns: repeat(2, minmax(0, 1fr));
      }
      .memory {
        grid-template-columns: minmax(0, 1fr) auto;
        padding: 0;
        overflow: hidden;
      }
      .memory img {
        grid-column: 1 / -1;
        aspect-ratio: 2.35;
        border-radius: 0;
      }
      .memory__text {
        padding: 0 0 var(--space-3) var(--space-3);
      }
      .memory app-icon {
        margin-right: var(--space-3);
      }
    }
    .chip {
      justify-self: start;
      padding: 0 var(--space-2);
      border-radius: var(--radius-pill);
      border: 1px solid var(--color-outline);
      font-size: 0.8125rem;
    }
    .chip[data-soon='true'] {
      background: var(--color-status-pending-bg);
      font-weight: 600;
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
    return this.memories().map((memory) => {
      const e = expiry(memory.expiresAt, zone, now);
      return {
        memory,
        date: monthDay(familyDate(memory.startsAt, zone)),
        count: memory.photoCount === 1 ? '1 photo' : translate('memory.photoCount', this.copyLocale.locale(), { count: memory.photoCount }),
        whose: whoseText(memory, coParent),
        expiry: expiryChip(e),
        soon: e.soon,
      };
    });
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
