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
import { Api, EventPhotos, FamilyMember } from '../../core/api/api';
import { generalMessage, toProblem } from '../../core/api/problem';
import { AuthStore } from '../../core/auth/auth.store';
import { Icon } from '../../shared/icon/icon';
import { dayLong } from '../dashboard/week';
import { EventPhotosSection } from './event-photos';
import { familyDate } from './photo-text';

/**
 * One Family Memory (#403): an event's photos the viewer may see, with the same sharing, viewing, downloading and
 * deleting as in the event details. Downloading every photo as one ZIP comes in a later change; until then each
 * photo downloads on its own where that's allowed. The co-parent's photos they haven't allowed to be downloaded are
 * explained without revealing anything private.
 */
@Component({
  selector: 'app-memory-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatButtonModule, RouterLink, Icon, EventPhotosSection],
  template: `
    <a mat-button class="back" routerLink="/memories"
      ><app-icon name="chevron-left" [size]="18" /> Family Memories</a
    >
    @switch (state()) {
      @case ('loading') {
        <h1>Family Memory</h1>
        <p class="muted" role="status">Loading…</p>
      }
      @case ('missing') {
        <h1>Memory not found</h1>
        <p>
          This memory isn’t here. Its photos may have been deleted, or they aren’t shared with you.
        </p>
      }
      @case ('error') {
        <h1>Family Memory</h1>
        <p class="error" role="alert">{{ error() }}</p>
        <button mat-stroked-button type="button" (click)="load()">Try again</button>
      }
      @case ('ready') {
        @if (summary(); as s) {
          <h1>{{ s.title }}</h1>
          <p class="muted">{{ s.line }}</p>
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
            [headingLevel]="2"
            (loaded)="view.set($event)"
          />
        }
        <a
          mat-stroked-button
          [routerLink]="['/calendar']"
          [queryParams]="{ date: eventDate(), event: eventId() }"
          >Open the event</a
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
    .back,
    a[mat-stroked-button],
    button[mat-stroked-button] {
      min-height: var(--target-min);
      justify-self: start;
    }
  `,
})
export class MemoryPage {
  private readonly api = inject(Api);
  private readonly auth = inject(AuthStore);

  /** From the route. */
  readonly eventId = input.required<string>();

  protected readonly state = signal<'loading' | 'ready' | 'missing' | 'error'>('loading');
  protected readonly error = signal<string | null>(null);
  protected readonly view = signal<EventPhotos | null>(null);
  private readonly members = signal<readonly FamilyMember[]>([]);

  protected readonly familyId = computed(() => this.auth.currentFamily()?.id ?? null);
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
    const co = this.coParent() ?? 'your co-parent';
    const yours = view.batches.filter((b) => b.yours).reduce((n, b) => n + b.photos.length, 0);
    const shared = view.batches.filter((b) => !b.yours).reduce((n, b) => n + b.photos.length, 0);
    const parts = [dayLong(familyDate(view.startsAt, this.timeZone()))];
    if (yours) {
      parts.push(`${yours === 1 ? '1 photo' : `${yours} photos`} from you`);
    }
    if (shared) {
      parts.push(`${shared} shared by ${co}`);
    }
    if (view.cancelled) {
      parts.push('event cancelled');
    }
    const blocked = view.batches.some((b) => !b.yours && !b.downloadsAllowed);
    const downloads = blocked
      ? `${this.coParent() ?? 'Your co-parent'} hasn’t allowed downloads of their photos, so you can view them here but not download them.`
      : null;
    return { title: view.title, line: parts.join(' · '), downloads };
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
        this.error.set(`This memory couldn’t load. ${generalMessage(problem)}`);
        this.state.set('error');
      }
    }
  }
}
