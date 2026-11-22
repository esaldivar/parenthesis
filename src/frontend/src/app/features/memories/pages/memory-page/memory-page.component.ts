import { LocaleService } from '../../../../core/i18n/locale.service';
import { TranslatePipe, translate } from '../../../../core/i18n/translations';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  signal,
  untracked,
} from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { RouterLink } from '@angular/router';
import { Api, EventPhotos, FamilyMember } from '../../../../core/api/api';
import { generalMessage, toProblem } from '../../../../core/api/problem';
import { AuthStore } from '../../../../core/auth/auth.store';
import { Icon } from '../../../../shared/components/icon/icon';
import { dayLong } from '../../../../core/dates/dates';
import { EventPhotosSection } from '../../components/event-photos/event-photos.component';
import { PHOTOS_NOW, RETENTION_DAYS, expiry, expiryChip, familyDate } from '../../photo-text';
import { MemoryCover, TimeLeft } from '../../components/memory-cover/memory-cover.component';

/**
 * One Family Memory (#403): an event's photos the viewer may see, with the same sharing, viewing, downloading and
 * deleting as in the event details. Downloading every photo as one ZIP comes in a later change; until then each
 * photo downloads on its own where that's allowed. A parent can also export photos they may download to their own
 * Google Photos (#404). The co-parent's photos they haven't allowed to be downloaded are
 * explained without revealing anything private.
 */
@Component({
  selector: 'app-memory-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [TranslatePipe, MatButtonModule, RouterLink, Icon, EventPhotosSection, MemoryCover, TimeLeft],
  template: `
    <a mat-button class="back" routerLink="/memories"
      ><app-icon name="chevron-left" [size]="18" /> {{ 'feature.family.memories' | tr }}</a
    >
    @switch (state()) {
      @case ('loading') {
        <h1>{{ 'feature.family.memory' | tr }}</h1>
        <p class="muted" role="status">{{ 'feature.loading' | tr }}</p>
      }
      @case ('missing') {
        <h1>{{ 'feature.memory.not.found' | tr }}</h1>
        <p>
          {{ 'feature.this.memory.isn.t.here.its.photos' | tr }}
        </p>
      }
      @case ('error') {
        <h1>{{ 'feature.family.memory' | tr }}</h1>
        <p class="error" role="alert">{{ error() }}</p>
        <button mat-stroked-button type="button" (click)="load()">{{ 'feature.try.again' | tr }}</button>
      }
      @case ('ready') {
        @if (summary(); as s) {
          <header class="memory-head">
            @if (s.cover) {
              <app-memory-cover class="memory-head__cover" [src]="s.cover" [lazy]="false" />
            }
            <div class="memory-head__text">
              <h1>{{ s.title }}</h1>
              <p class="muted">{{ s.line }}</p>
              @if (s.expiry; as e) {
                <div class="time-left-panel" [attr.data-soon]="e.soon">
                  <p class="time-left-panel__when">{{ e.text }}</p>
                  @if (e.soon) {
                    <app-time-left [percent]="e.left" />
                  }
                </div>
              }
            </div>
          </header>
          @if (s.downloads) {
            <p>{{ s.downloads }}</p>
          }
        }
        @if (familyId(); as familyId) {
          <app-event-photos
            [familyId]="familyId"
            [eventId]="eventId()"
            [timeZone]="timeZone()"
            [coParent]="coParent()"
            [linkToMemory]="false"
            [googlePhotos]="isParent()"
            [headingLevel]="2"
            (loaded)="view.set($event)"
          />
        }
        <a
          mat-stroked-button
          [routerLink]="['/calendar']"
          [queryParams]="{ date: eventDate(), event: eventId() }"
          >{{ 'feature.open.the.event' | tr }}</a
        >
      }
    }
  `,
  styles: `
    :host {
      display: grid;
      gap: var(--space-3);
      align-content: start;
      max-width: 48rem;
    }
    h1,
    p {
      margin: 0;
      overflow-wrap: anywhere;
    }
    .muted {
      color: var(--color-text-secondary);
    }
    .error {
      color: var(--color-danger);
    }
    /* #717: the album-style header, matching the memory's card on the timeline. */
    .memory-head {
      display: grid;
      gap: var(--space-3);
      container: memory-head / inline-size;
    }
    .memory-head__cover {
      width: min(10rem, 60%);
    }
    .memory-head__text {
      display: grid;
      gap: var(--space-2);
      min-width: 0;
    }
    .time-left-panel {
      display: grid;
      gap: var(--space-2);
      justify-self: start;
      color: var(--color-text-secondary);
    }
    .time-left-panel[data-soon='true'] {
      padding: var(--space-3);
      border: 1px solid light-dark(#f2b9a5, #7a3f2e);
      border-radius: 14px;
      background: light-dark(#fcebe4, #3d2620);
      color: light-dark(#9a3b1f, #f5b7a3);
    }
    .time-left-panel__when {
      font-weight: 600;
    }
    @media (min-width: 48rem) {
      .memory-head {
        grid-template-columns: 13.75rem minmax(0, 1fr);
        align-items: center;
        gap: var(--space-6);
      }
      .memory-head__cover {
        width: auto;
      }
    }
    .back,
    a[mat-stroked-button],
    button[mat-stroked-button] {
      min-height: var(--target-min);
      justify-self: start;
    }
  `,
})
export class MemoryPage {
  private readonly copyLocale = inject(LocaleService);
  private readonly api = inject(Api);
  private readonly auth = inject(AuthStore);
  private readonly now = inject(PHOTOS_NOW);

  /** From the route. */
  readonly eventId = input.required<string>();

  protected readonly state = signal<'loading' | 'ready' | 'missing' | 'error'>('loading');
  protected readonly error = signal<string | null>(null);
  protected readonly view = signal<EventPhotos | null>(null);
  private readonly members = signal<readonly FamilyMember[]>([]);

  protected readonly familyId = computed(() => this.auth.currentFamily()?.id ?? null);
  /** Export to Google Photos is for parents only (#404); the server refuses anyone else too. */
  protected readonly isParent = computed(() => this.auth.currentFamily()?.role === 'Parent');
  protected readonly timeZone = computed(() => this.auth.currentFamily()?.timeZone ?? 'UTC');
  protected readonly coParent = computed(
    () => this.members().find((m) => m.role === 'Parent' && !m.isYou)?.displayName ?? null,
  );
  protected readonly eventDate = computed(() => {
    const view = this.view();
    return view ? familyDate(view.startsAt, this.timeZone()) : null;
  });

  /** "Saturday, October 12 · 4 photos from you · 3 shared by Mom", and what can be downloaded. */
  protected readonly summary = computed(() => {
    const view = this.view();
    if (!view) {
      return null;
    }
    const locale = this.copyLocale.locale();
    const co = this.coParent() ?? translate('common.coParentLower', locale);
    const yours = view.batches.filter((b) => b.yours).reduce((n, b) => n + b.photos.length, 0);
    const shared = view.batches.filter((b) => !b.yours).reduce((n, b) => n + b.photos.length, 0);
    const parts = [dayLong(familyDate(view.startsAt, this.timeZone()), locale === 'en' ? 'en-US' : locale)];
    if (yours) {
      parts.push(translate(yours === 1 ? 'memory.summary.yoursOne' : 'memory.summary.yoursMany', locale, { count: yours }));
    }
    if (shared) {
      parts.push(translate('memory.summary.shared', locale, { count: shared, name: co }));
    }
    if (view.cancelled) {
      parts.push(translate('memory.event.cancelled', this.copyLocale.locale()));
    }
    const blocked = view.batches.some((b) => !b.yours && !b.downloadsAllowed);
    const downloads = blocked
      ? translate('memory.details.noDownload', this.copyLocale.locale(), { name: this.coParent() ?? translate('common.coParent', this.copyLocale.locale()) })
      : null;
    // #717: the cover and when the first photo the viewer can see goes, as on the memory's card.
    const photos = view.batches.flatMap((b) => b.photos);
    const cover = photos[0]?.thumbnailUrl ?? null;
    const first = photos.reduce<string | null>(
      (soonest, p) => (!soonest || Date.parse(p.expiresAt) < Date.parse(soonest) ? p.expiresAt : soonest),
      null,
    );
    let when: { soon: boolean; text: string; left: number } | null = null;
    if (first) {
      const e = expiry(first, this.timeZone(), this.now(), locale);
      when = {
        soon: e.soon,
        left: Math.min(100, (e.days / RETENTION_DAYS) * 100),
        text: e.soon
          ? translate('memory.details.deletedSoon', locale, { when: expiryChip(e, locale), date: e.on })
          : expiryChip(e, locale),
      };
    }
    return { title: view.title, line: parts.join(' · '), downloads, cover, expiry: when };
  });

  constructor() {
    effect(() => {
      const familyId = this.familyId();
      const eventId = this.eventId();
      untracked(() => {
        if (familyId) {
          void this.load(familyId, eventId);
        }
      });
    });
  }

  protected async load(familyId = this.familyId(), eventId = this.eventId()): Promise<void> {
    if (!familyId) {
      return;
    }
    this.state.set('loading');
    this.error.set(null);
    try {
      const [view, family] = await Promise.all([
        this.api.eventPhotos(familyId, eventId),
        this.api.family(familyId),
      ]);
      this.view.set(view);
      this.members.set(family.members);
      this.state.set('ready');
    } catch (error) {
      const problem = toProblem(error);
      if (problem.status === 404) {
        this.state.set('missing');
      } else {
        this.error.set(translate('memory.details.loadError', this.copyLocale.locale(), { reason: generalMessage(problem) }));
        this.state.set('error');
      }
    }
  }
}
