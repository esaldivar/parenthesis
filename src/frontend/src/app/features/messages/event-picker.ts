import { LocaleService } from '../../core/i18n/locale.service';
import { TranslatePipe, translate } from '../../core/i18n/translations';
import { CdkTrapFocus } from '@angular/cdk/a11y';
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  afterNextRender,
  computed,
  inject,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { Api, ChatEventCard, FamilyMember } from '../../core/api/api';
import { generalMessage, toProblem } from '../../core/api/problem';
import { toSearch } from '../calendar/search-query';
import { todayIn } from '../dashboard/week';
import { Icon } from '../../shared/icon/icon';
import { ChatEventCardView, toCard } from './event-card';

/** Results in each group. */
export const PICKER_RESULTS = 10;
/** Wait this long after typing stops before searching. */
export const PICKER_DEBOUNCE_MS = 250;

/**
 * "Find a calendar event" (slice 2 of docs/design/m4-chat.md): search the family calendar by title or date ("Soccer",
 * "Nov 7", "11/7") with the Calendar's own search, which shows each parent only what their calendar shows. Choosing an
 * event puts it in the draft to review before sending. Escape or Close returns to the conversation.
 */
@Component({
  selector: 'app-chat-event-picker',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [TranslatePipe, CdkTrapFocus, Icon, ChatEventCardView],
  template: `
    <div
      class="picker"
      role="dialog"
      aria-modal="true"
      [attr.aria-labelledby]="id + '-title'"
      cdkTrapFocus
      (keydown.escape)="closed.emit()"
    >
      <div class="head">
        <h2 [id]="id + '-title'">{{ 'feature.find.a.calendar.event' | tr }}</h2>
        <button class="icon-button" type="button" aria-label="{{ 'feature.close' | tr }}" (click)="closed.emit()">
          <app-icon name="close" [size]="22" />
        </button>
      </div>
      <label class="field">
        <span class="visually-hidden">{{ 'feature.search.by.event.or.date' | tr }}</span>
        <app-icon name="search" [size]="20" />
        <input
          type="search"
          placeholder="{{ 'feature.search.by.event.or.date' | tr }}"
          autocomplete="off"
          #search
          [attr.aria-describedby]="id + '-status'"
          [value]="text()"
          (input)="edit($event)"
        />
      </label>
      <p class="status" [id]="id + '-status'" role="status">{{ statusText() }}</p>

      @if (error(); as message) {
        <p class="alert" role="alert">{{ message }}</p>
      }
      @for (group of groups(); track group.label) {
        @if (group.cards.length) {
          <h3>{{ group.label }}</h3>
          <ul>
            @for (card of group.cards; track card.id) {
              <li>
                <button type="button" class="result" (click)="picked.emit(card)">
                  <app-chat-event-card [card]="card" [timeZone]="timeZone()" [link]="false" />
                </button>
              </li>
            }
          </ul>
        }
      }
    </div>
  `,
  styles: `
    :host {
      position: absolute;
      inset: 0;
      z-index: 5;
      display: flex;
      align-items: flex-end;
      background: color-mix(in srgb, var(--color-canvas) 60%, transparent);
    }
    .picker {
      display: grid;
      align-content: start;
      gap: var(--space-3);
      width: 100%;
      max-height: 85%;
      overflow-y: auto;
      padding: var(--space-4);
      border-top: 1px solid var(--color-outline);
      border-radius: var(--radius-card) var(--radius-card) 0 0;
      background: var(--color-surface);
      box-shadow: 0 -4px 16px rgb(0 0 0 / 18%);
    }
    .head {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: var(--space-2);
    }
    h2 {
      margin: 0;
      font-size: 1.25rem;
    }
    h3 {
      margin: var(--space-2) 0 0;
      font-size: 0.9375rem;
      color: var(--color-text-secondary);
    }
    .icon-button {
      display: inline-grid;
      place-items: center;
      width: var(--target-min);
      height: var(--target-min);
      border: 0;
      border-radius: 50%;
      background: transparent;
      color: var(--color-text);
      cursor: pointer;
    }
    .icon-button:hover {
      background: var(--color-surface-soft);
    }
    .field {
      display: flex;
      align-items: center;
      gap: var(--space-2);
      min-height: var(--target-min);
      padding: 0 var(--space-3);
      border: 1px solid var(--color-outline);
      border-radius: var(--radius-pill);
      background: var(--color-canvas);
    }
    .field:focus-within {
      outline: 3px solid var(--color-focus);
      outline-offset: 1px;
    }
    input {
      flex: 1;
      min-width: 0;
      min-height: var(--target-min);
      border: 0;
      background: transparent;
      color: var(--color-text);
      font: inherit;
      outline: none;
    }
    input::placeholder {
      color: var(--color-text-secondary);
      opacity: 1;
    }
    .status {
      margin: 0;
      color: var(--color-text-secondary);
      font-size: 0.9375rem;
    }
    .alert {
      margin: 0;
      padding: var(--space-3);
      border: 1px solid var(--color-danger);
      border-radius: var(--radius-control);
      background: var(--color-status-rejected-bg);
    }
    ul {
      display: grid;
      gap: var(--space-2);
      margin: 0;
      padding: 0;
      list-style: none;
    }
    .result {
      display: block;
      width: 100%;
      padding: 0;
      border: 0;
      border-radius: var(--radius-control);
      background: transparent;
      font: inherit;
      cursor: pointer;
    }
    .result:focus-visible {
      outline: 3px solid var(--color-focus);
      outline-offset: 2px;
    }
    .result:hover app-chat-event-card {
      filter: brightness(0.97);
    }
  `,
})
export class ChatEventPicker {
  private readonly copyLocale = inject(LocaleService);
  private readonly api = inject(Api);

  readonly familyId = input.required<string>();
  readonly timeZone = input.required<string>();
  readonly members = input.required<readonly FamilyMember[]>();
  readonly picked = output<ChatEventCard>();
  readonly closed = output<void>();

  private static next = 0;
  protected readonly id = `chat-picker-${ChatEventPicker.next++}`;
  protected readonly text = signal('');
  protected readonly searching = signal(false);
  protected readonly error = signal<string | null>(null);
  private readonly upcoming = signal<readonly ChatEventCard[] | null>(null);
  private readonly earlier = signal<readonly ChatEventCard[]>([]);
  private timer: ReturnType<typeof setTimeout> | null = null;
  private generation = 0;

  protected readonly groups = computed(() => [
    { label: 'Upcoming', cards: this.upcoming() ?? [] },
    { label: 'Earlier', cards: this.earlier() },
  ]);

  protected readonly statusText = computed(() => {
    if (this.searching()) {
      return translate('calendar.search.loading', this.copyLocale.locale());
    }
    if (this.error()) {
      return '';
    }
    const found = this.upcoming();
    if (found === null) {
      return translate('chat.eventSearch.hint', this.copyLocale.locale());
    }
    const count = found.length + this.earlier().length;
    const locale = this.copyLocale.locale();
    if (count === 0) return translate('chat.eventSearch.empty', locale);
    return translate(count === 1 ? 'chat.eventSearch.foundOne' : 'chat.eventSearch.foundMany', locale, { count });
  });

  private readonly input = viewChild.required<ElementRef<HTMLInputElement>>('search');

  constructor() {
    inject(DestroyRef).onDestroy(() => this.timer && clearTimeout(this.timer));
    // Opening the search puts focus in its field.
    afterNextRender(() => this.input().nativeElement.focus());
  }

  protected edit(event: Event): void {
    this.text.set((event.target as HTMLInputElement).value);
    if (this.timer) {
      clearTimeout(this.timer);
    }
    this.timer = setTimeout(() => void this.search(), PICKER_DEBOUNCE_MS);
  }

  /** Searches upcoming and earlier events at once; only the latest search's answer is shown. */
  async search(): Promise<void> {
    const generation = ++this.generation;
    const criteria = toSearch(this.text(), this.members(), todayIn(this.timeZone(), new Date()), this.copyLocale.locale());
    this.error.set(null);
    if (!criteria) {
      this.upcoming.set(null);
      this.earlier.set([]);
      this.searching.set(false);
      return;
    }
    this.searching.set(true);
    try {
      const [upcoming, earlier] = await Promise.all([
        this.api.searchCalendarEvents(this.familyId(), criteria, { past: false, offset: 0, limit: PICKER_RESULTS }),
        this.api.searchCalendarEvents(this.familyId(), criteria, { past: true, offset: 0, limit: PICKER_RESULTS }),
      ]);
      if (generation !== this.generation) {
        return;
      }
      this.upcoming.set(upcoming.events.map(toCard));
      this.earlier.set(earlier.events.map(toCard));
    } catch (error) {
      if (generation === this.generation) {
        this.error.set(generalMessage(toProblem(error)));
        this.upcoming.set([]);
        this.earlier.set([]);
      }
    } finally {
      if (generation === this.generation) {
        this.searching.set(false);
      }
    }
  }
}
