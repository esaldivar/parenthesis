import { LocaleService } from '../../../../core/i18n/locale.service';
import { translate, TranslatePipe } from '../../../../core/i18n/translations';
import { CdkTrapFocus } from '@angular/cdk/a11y';
import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  Injector,
  OnInit,
  afterNextRender,
  computed,
  inject,
  input,
  signal,
  viewChild,
} from '@angular/core';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { Api, SavedTranscript, TranscriptPreview, TranscriptRange } from '../../../../core/api/api';
import { generalMessage, toProblem, localizeMessage } from '../../../../core/api/problem';
import { AuthStore } from '../../../../core/auth/auth.store';
import { Icon } from '../../../../shared/icon/icon';
import { Toasts } from '../../../../shared/toast/toasts';
import { DateField } from '../../../calendar/components/date-field/date-field.component';
import { providePlainDates } from '../../../calendar/plain-dates';

/** Field messages, matching the server's (TranscriptRange.Validate). */
export const HALF_RANGE = 'Choose a start and an end date, or All messages.';
export const REVERSED_RANGE = 'The end date can’t be before the start date.';
export const EMPTY_RANGE = 'No messages in this date range.';

type Step = 'choose' | 'preview';

/**
 * PDF transcripts of the parents' conversation (#125, slice 3 of docs/design/m4-chat.md): Save transcript and this
 * parent's Saved transcripts. The left column of the desktop Messages page, and the phone's Transcripts screen.
 *
 * Save transcript opens a dialog: All messages or a date range (both dates included, in the family's time zone), then a
 * preview of exactly what the PDF holds. From the preview, Save transcript keeps a copy in Parenthesis and Download PDF
 * saves one to the device; they are separate. An empty range keeps its dates and offers no export. A saved entry
 * reopens its PDF, exactly as saved. Saved transcripts are this parent's alone.
 */
@Component({
  selector: 'app-chat-transcripts',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [TranslatePipe, CdkTrapFocus, ReactiveFormsModule, MatButtonModule, Icon, DateField],
  providers: [providePlainDates()],
  template: `
    <header class="head">
      <ng-content select="[transcriptsLead]" />
      @if (level() === 1) {
        <h1>{{ 'feature.transcripts' | tr }}</h1>
      } @else {
        <h2>{{ 'feature.transcripts' | tr }}</h2>
      }
    </header>

    <button
      mat-flat-button
      type="button"
      class="save"
      aria-haspopup="dialog"
      #opener
      (click)="open()"
    >
      <app-icon name="download" [size]="20" />
      {{ 'feature.save.transcript' | tr }}
    </button>

    <section class="saved" [attr.aria-labelledby]="id + '-saved'">
      @if (level() === 1) {
        <h2 [id]="id + '-saved'">{{ 'feature.saved.transcripts' | tr }}</h2>
      } @else {
        <h3 [id]="id + '-saved'">{{ 'feature.saved.transcripts' | tr }}</h3>
      }
      @switch (listState()) {
        @case ('loading') {
          <p class="muted" role="status">{{ 'feature.loading.saved.transcripts' | tr }}</p>
        }
        @case ('error') {
          <p class="alert" role="alert">{{ listError() }}</p>
          <button mat-stroked-button type="button" (click)="loadSaved()">{{ 'feature.try.again' | tr }}</button>
        }
        @default {
          @if (saved().length === 0) {
            <p class="muted">{{ 'feature.no.saved.transcripts.yet' | tr }}</p>
          } @else {
            <ul class="saved-list">
              @for (transcript of saved(); track transcript.id) {
                <li>
                  <!-- Opens the PDF exactly as saved, in a new tab: the browser's own viewer can print or save it. -->
                  <a
                    class="saved-item"
                    [href]="savedUrl(transcript)"
                    target="_blank"
                    rel="noopener"
                    [attr.data-id]="transcript.id"
                  >
                    <app-icon name="note" [size]="22" />
                    <span class="saved-text">
                      <span class="file">{{ transcript.fileName }}</span>
                      <span class="range">{{ transcript.rangeLabel }}</span>
                      <span class="visually-hidden">{{ 'feature.opens.in.a.new.tab' | tr }}</span>
                    </span>
                    <app-icon name="chevron-right" [size]="20" />
                  </a>
                </li>
              }
            </ul>
          }
        }
      }
    </section>

    @if (step(); as current) {
      <div class="scrim"></div>
      <div
        class="dialog"
        role="dialog"
        aria-modal="true"
        [attr.aria-labelledby]="id + '-dialog-title'"
        cdkTrapFocus
        (keydown.escape)="close()"
      >
        <div class="dialog-head">
          <h2 [id]="id + '-dialog-title'" tabindex="-1" #dialogTitle>
            {{ current === 'choose' ? ('feature.save.transcript' | tr) : ('feature.transcript.preview' | tr) }}
          </h2>
          <button class="icon-button" type="button" aria-label="{{ 'feature.close' | tr }}" (click)="close()">
            <app-icon name="close" [size]="22" />
          </button>
        </div>

        @if (current === 'choose') {
          <form class="choose" novalidate (submit)="$event.preventDefault(); preview()">
            <fieldset>
              <legend class="visually-hidden">{{ 'feature.messages.to.include' | tr }}</legend>
              <label class="radio">
                <input
                  type="radio"
                  name="scope"
                  value="all"
                  [checked]="scope() === 'all'"
                  (change)="setScope('all')"
                />
                {{ 'feature.all.messages' | tr }}
              </label>
              <label class="radio">
                <input
                  type="radio"
                  name="scope"
                  value="range"
                  [checked]="scope() === 'range'"
                  (change)="setScope('range')"
                />
                {{ 'feature.date.range' | tr }}
              </label>
            </fieldset>

            @if (scope() === 'range') {
              <div class="dates">
                <app-date-field
                  label="{{ 'feature.start.date' | tr }}"
                  name="from"
                  [inputId]="id + '-from'"
                  [control]="from"
                  [dateFilter]="anyDay"
                  [issue]="fromError()"
                />
                @if (fromError(); as message) {
                  <p class="field-error" [id]="id + '-from-error'">{{ message }}</p>
                }
                <app-date-field
                  label="{{ 'feature.end.date' | tr }}"
                  name="to"
                  [inputId]="id + '-to'"
                  [control]="to"
                  [dateFilter]="anyDay"
                  [startAt]="from.value || null"
                  [issue]="toError()"
                />
                @if (toError(); as message) {
                  <p class="field-error" [id]="id + '-to-error'">{{ message }}</p>
                }
              </div>
            }

            @if (empty()) {
              <p class="notice" role="status">{{ 'transcript.emptyRange' | tr }}</p>
            }
            @if (dialogError(); as message) {
              <p class="alert" role="alert">{{ message }}</p>
            }

            <div class="actions">
              <button mat-stroked-button type="button" (click)="close()">{{ 'feature.cancel' | tr }}</button>
              <button mat-flat-button type="submit" [disabled]="busy()">{{ 'feature.preview.pdf' | tr }}</button>
            </div>
          </form>
        } @else if (document(); as doc) {
          <article class="paper" [attr.aria-label]="('feature.preview.of' | tr) + doc.fileName" tabindex="0">
            <div class="paper-brand">
              <img src="/brand/parenthesis-icon.svg" alt="" width="28" height="26" />
              <span>Parenthesis</span>
            </div>
            <h3>{{ doc.title }}</h3>
            <p class="paper-meta">{{ doc.labels.description }}</p>
            <dl class="paper-facts">
              <div><dt>{{ doc.labels.participants }}</dt><dd>{{ doc.participants }}</dd></div>
              <div><dt>{{ doc.labels.inclusiveRange }}</dt><dd>{{ doc.rangeLabel }}</dd></div>
              <div><dt>{{ doc.labels.displayTimeZone }}</dt><dd>{{ doc.timeZone }}</dd></div>
              <div><dt>{{ doc.labels.generated }}</dt><dd>{{ doc.preparedLabel }}</dd></div>
            </dl>
            <p class="paper-meta">
              {{ doc.messageCount === 1 ? ('feature.1.message' | tr) : doc.messageCount + ('feature.messages.6e2fd2' | tr) }}
            </p>
            @for (day of doc.days; track day.date) {
              <h4>{{ day.label }}</h4>
              <ol class="paper-messages">
                @for (message of day.messages; track $index) {
                  <li>
                    <div class="message-heading">
                      <strong>{{ message.sender }}</strong>
                      <span class="time">{{ message.time }}</span>
                    </div>
                    @if (message.text) {
                      <p class="text">{{ message.text }}</p>
                    }
                    @if (message.event; as event) {
                      <p class="event">{{ event }}</p>
                    }
                  </li>
                }
              </ol>
            }
          </article>

          <p class="file-name"><app-icon name="note" [size]="20" />{{ doc.fileName }}</p>

          @if (dialogError(); as message) {
            <p class="alert" role="alert">{{ message }}</p>
          }

          <div class="actions">
            <button mat-flat-button type="button" [disabled]="busy()" (click)="save()">
              <app-icon name="download" [size]="20" />
              {{ 'feature.save.transcript' | tr }}
            </button>
            <a mat-stroked-button [href]="downloadUrl()" [attr.download]="doc.fileName">
              <app-icon name="note" [size]="20" />
              {{ 'feature.download.pdf' | tr }}
            </a>
          </div>
          <button class="link-button" type="button" (click)="backToDates()">{{ 'feature.change.dates' | tr }}</button>
        }
      </div>
    }
  `,
  styleUrl: './chat-transcripts.component.scss',
})
export class ChatTranscripts implements OnInit {
  private static next = 0;
  private readonly api = inject(Api);
  private readonly auth = inject(AuthStore);
  private readonly locale = inject(LocaleService);
  private readonly toasts = inject(Toasts);
  private readonly injector = inject(Injector);

  /** The page's heading level for "Transcripts": 1 on the phone's Transcripts screen, 2 beside the conversation. */
  readonly level = input<1 | 2>(2);

  protected readonly id = `transcripts-${ChatTranscripts.next++}`;
  protected readonly anyDay = () => true;

  protected readonly saved = signal<readonly SavedTranscript[]>([]);
  protected readonly listState = signal<'loading' | 'ready' | 'error'>('loading');
  protected readonly listError = signal('');

  protected readonly step = signal<Step | null>(null);
  protected readonly scope = signal<'all' | 'range'>('all');
  protected readonly from = new FormControl('', { nonNullable: true });
  protected readonly to = new FormControl('', { nonNullable: true });
  protected readonly fromError = signal<string | null>(null);
  protected readonly toError = signal<string | null>(null);
  protected readonly empty = signal(false);
  protected readonly dialogError = signal<string | null>(null);
  protected readonly busy = signal(false);
  protected readonly document = signal<TranscriptPreview | null>(null);

  private readonly opener = viewChild.required('opener', { read: ElementRef<HTMLButtonElement> });
  private readonly dialogTitle = viewChild<ElementRef<HTMLElement>>('dialogTitle');

  private readonly familyId = computed(() => this.auth.currentFamily()?.id ?? '');
  /** The range that was previewed: Save and Download use exactly this one. */
  private readonly previewed = signal<TranscriptRange>({ from: null, to: null });
  protected readonly downloadUrl = computed(() =>
    this.api.transcriptPdfUrl(this.familyId(), this.previewed(), true),
  );

  ngOnInit(): void {
    void this.loadSaved();
  }

  protected savedUrl(transcript: SavedTranscript): string {
    return this.api.savedTranscriptUrl(this.familyId(), transcript.id);
  }

  protected async loadSaved(): Promise<void> {
    const familyId = this.familyId();
    if (!familyId) {
      this.listError.set(translate('feedback.we.couldn.t.find.your.family', this.locale.locale()));
      this.listState.set('error');
      return;
    }
    this.listState.set('loading');
    try {
      this.saved.set(await this.api.transcripts(familyId));
      this.listState.set('ready');
    } catch (error) {
      this.listError.set(generalMessage(toProblem(error)));
      this.listState.set('error');
    }
  }

  protected open(): void {
    this.clearMessages();
    this.document.set(null);
    this.step.set('choose');
    this.focusTitle();
  }

  /** Closes the dialog and returns focus to Save transcript. */
  protected close(): void {
    if (!this.step()) {
      return;
    }
    this.step.set(null);
    this.opener().nativeElement.focus();
  }

  protected setScope(scope: 'all' | 'range'): void {
    this.scope.set(scope);
    this.clearMessages();
  }

  protected backToDates(): void {
    this.clearMessages();
    this.step.set('choose');
    this.focusTitle();
  }

  /** Checks the dates, then shows exactly what the PDF will hold. An empty range stays on its dates. */
  protected async preview(): Promise<void> {
    if (this.busy()) {
      return;
    }
    this.clearMessages();
    const range = this.range();
    if (!range) {
      return;
    }
    this.busy.set(true);
    try {
      const doc = await this.api.transcriptPreview(this.familyId(), range);
      if (doc.messageCount === 0) {
        this.empty.set(true);
        return;
      }
      this.previewed.set(range);
      this.document.set(doc);
      this.step.set('preview');
      this.focusTitle();
    } catch (error) {
      this.showProblem(error);
    } finally {
      this.busy.set(false);
    }
  }

  /** Keeps an unchanging copy of the previewed range in Parenthesis, for this parent only. */
  protected async save(): Promise<void> {
    if (this.busy()) {
      return;
    }
    this.dialogError.set(null);
    this.busy.set(true);
    try {
      const saved = await this.api.saveTranscript(this.familyId(), this.previewed());
      this.saved.update((list) => [saved, ...list.filter((t) => t.id !== saved.id)]);
      this.listState.set('ready');
      this.toasts.show(translate('transcript.saved', this.locale.locale(), { fileName: saved.fileName }));
      this.close();
    } catch (error) {
      this.showProblem(error);
    } finally {
      this.busy.set(false);
    }
  }

  /** The chosen range, or null (with the reason beside its field) when it can't be used. */
  private range(): TranscriptRange | null {
    if (this.scope() === 'all') {
      return { from: null, to: null };
    }
    const from = this.from.value;
    const to = this.to.value;
    if (!from || !to) {
      (from ? this.toError : this.fromError).set(translate('transcript.halfRange', this.locale.locale()));
      return null;
    }
    if (from > to) {
      this.toError.set(translate('transcript.reversedRange', this.locale.locale()));
      return null;
    }
    return { from, to };
  }

  private showProblem(error: unknown): void {
    const problem = toProblem(error);
    const field = (name: string) => {
      const message = problem.errors[name]?.[0];
      if (message === HALF_RANGE) return translate('transcript.halfRange', this.locale.locale());
      if (message === REVERSED_RANGE) return translate('transcript.reversedRange', this.locale.locale());
      const limit = message?.match(/^That range has more than ([0-9,]+) messages\./)?.[1];
      return limit
        ? translate('transcript.rangeTooLarge', this.locale.locale(), { count: limit })
        : (message ?? null);
    };
    const fromMessage = field('from');
    const toMessage = field('to');
    // toProblem may already have put the server's sentence into Spanish (#534).
    if (problem.status === 400 && fromMessage === localizeMessage(EMPTY_RANGE, problem.locale ?? 'en')) {
      this.step.set('choose');
      this.empty.set(true);
      return;
    }
    if (problem.status === 400 && (fromMessage || toMessage) && this.scope() === 'range') {
      this.step.set('choose');
      this.fromError.set(fromMessage);
      this.toError.set(toMessage);
      return;
    }
    this.dialogError.set(fromMessage ?? toMessage ?? generalMessage(problem));
  }

  private clearMessages(): void {
    this.fromError.set(null);
    this.toError.set(null);
    this.empty.set(false);
    this.dialogError.set(null);
  }

  private focusTitle(): void {
    afterNextRender(() => this.dialogTitle()?.nativeElement.focus(), { injector: this.injector });
  }
}
