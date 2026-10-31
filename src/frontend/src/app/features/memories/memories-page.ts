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
  imports: [MatButtonModule, RouterLink, EmptyState],
  template: `
    <h1>Family Memories</h1>
    <p class="intro">
      Photos from your events. Each photo is deleted {{ retentionDays }} days after it’s added, so
      download the ones you want to keep.
    </p>

    @switch (state()) {
      @case ('loading') {
        <p class="muted" role="status">Loading memories…</p>
      }
      @case ('error') {
        <p class="error" role="alert">{{ error() }}</p>
        <button mat-stroked-button type="button" (click)="load()">Try again</button>
      }
      @case ('ready') {
        @if (rows().length === 0) {
          <app-empty-state
            icon="album"
            title="No memories yet"
            body="Add photos to a confirmed event on the calendar and they’ll show here."
          >
            <a mat-stroked-button routerLink="/calendar">Open calendar</a>
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
    }
    h1,
    p {
      margin: 0;
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
      grid-template-columns: repeat(auto-fill, minmax(min(100%, 280px), 1fr));
    }
    .memory {
      display: grid;
      grid-template-columns: 88px 1fr;
      gap: var(--space-3);
      align-items: center;
      min-height: var(--target-min);
      padding: var(--space-3);
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
      width: 88px;
      height: 88px;
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
      font-weight: 700;
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
        count: memory.photoCount === 1 ? '1 photo' : `${memory.photoCount} photos`,
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
      this.error.set(`Memories couldn’t load. ${generalMessage(toProblem(error))}`);
      this.state.set('error');
    }
  }
}
