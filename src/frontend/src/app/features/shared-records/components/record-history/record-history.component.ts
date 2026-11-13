import { LocaleService } from '../../../../core/i18n/locale.service';
import { AppCurrencyPipe } from '../../../../core/i18n/locale-formatting';
import { AppDatePipe } from '../../../../core/i18n/locale-formatting';
import { TranslatePipe, translate } from '../../../../core/i18n/translations';
import { inject, ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';

import { FundCurrency, RecordEntry, RecordTotals } from '../../../../core/api/api';
import { Icon } from '../../../../shared/components/icon/icon';

export type EntryResponse = 'acknowledge' | 'dispute';

/**
 * Progress toward a target, shown as a thermometer with every number in text (#477). Only acknowledged amounts fill
 * it; pending amounts are named beside it, and disputed ones never count.
 */
@Component({
  selector: 'app-record-progress',
  imports: [TranslatePipe, AppCurrencyPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="progress">
      @if (target() !== null) {
        <div class="thermometer" aria-hidden="true">
          <div class="tube"><div class="fill" [style.height.%]="percent()"></div></div>
          <div class="bulb"></div>
        </div>
      }
      <div class="text">
        <p class="eyebrow">{{ doneLabel() }}</p>
        <p class="amount">{{ totals().acknowledgedMinor / 100 | appCurrency: currency() : 'symbol' }}</p>
        @if (target(); as goal) {
          <p>{{ 'feature.of' | tr }} {{ goal / 100 | appCurrency: currency() : 'symbol' }} {{ targetLabel() }}</p>
        }
        @if (totals().pendingMinor) {
          <p class="pill pending">{{ totals().pendingMinor / 100 | appCurrency: currency() : 'symbol' }} {{ pendingLabel() }}</p>
        }
        @if (totals().disputedMinor) {
          <p class="muted">{{ totals().disputedMinor / 100 | appCurrency: currency() : 'symbol' }} {{ 'feature.flagged.as.a.mismatch.not.counted' | tr }}</p>
        }
        @if (target(); as goal) {
          @if (goal > totals().acknowledgedMinor) {
            <p class="muted">{{ (goal - totals().acknowledgedMinor) / 100 | appCurrency: currency() : 'symbol' }} {{ 'feature.to.reach' | tr }} {{ shortTarget() }}</p>
          } @else {
            <p class="reached">{{ reachedLabel() }}</p>
          }
        }
      </div>
    </div>
  `,
  styles: `
    .progress {
      display: flex;
      gap: var(--space-4);
      border: 1px solid var(--color-outline);
      border-radius: var(--radius-card);
      padding: var(--space-4);
      background: var(--color-surface);
    }
    p { margin: 0; }
    .text { display: grid; gap: var(--space-2); align-content: start; justify-items: start; }
    .eyebrow { color: var(--color-action); font-size: 0.8125rem; font-weight: 700; letter-spacing: 0.06em; text-transform: uppercase; }
    .amount { font-size: clamp(2rem, 6vw, 2.75rem); font-weight: 800; line-height: 1.1; }
    .muted { color: var(--color-text-secondary); font-size: 0.9375rem; }
    .reached { color: var(--color-action); font-weight: 700; }
    .pill { border-radius: var(--radius-pill); padding: var(--space-1) var(--space-3); font-weight: 700; font-size: 0.9375rem; }
    .pending { background: var(--color-status-pending-bg); color: var(--color-text); }
    .thermometer { display: grid; justify-items: center; flex: none; width: 2.25rem; }
    .tube {
      position: relative;
      width: 1rem;
      height: 8.5rem;
      border: 3px solid var(--color-outline);
      border-block-end: 0;
      border-radius: 999px 999px 0 0;
      background: var(--color-surface-soft);
      overflow: hidden;
    }
    .fill { position: absolute; inset-inline: 0; bottom: 0; background: var(--color-action); }
    .bulb {
      width: 2rem;
      height: 2rem;
      margin-block-start: -0.25rem;
      border: 3px solid var(--color-outline);
      border-radius: 50%;
      background: var(--color-action);
    }
    @media (forced-colors: active) { .fill, .bulb { background: CanvasText; } }
  `,
})
export class RecordProgress {
  private readonly copyLocale = inject(LocaleService);
  readonly totals = input.required<RecordTotals>();
  readonly currency = input.required<FundCurrency>();
  readonly target = input<number | null>(null);
  readonly kind = input<'fund' | 'support'>('fund');

  protected readonly percent = computed(() => {
    const goal = this.target();
    return goal ? Math.min(100, Math.round((this.totals().acknowledgedMinor / goal) * 100)) : 0;
  });
  protected readonly doneLabel = computed(() => this.kind() === 'fund' ? translate('records.history.acknowledged', this.copyLocale.locale()) : translate('records.history.received', this.copyLocale.locale()));
  protected readonly targetLabel = computed(() => this.kind() === 'fund' ? translate('records.history.target', this.copyLocale.locale()) : translate('records.history.reference', this.copyLocale.locale()));
  protected readonly shortTarget = computed(() => this.kind() === 'fund' ? translate('records.history.shortTarget', this.copyLocale.locale()) : translate('records.history.referenceAmount', this.copyLocale.locale()));
  protected readonly pendingLabel = computed(() => this.kind() === 'fund' ? translate('records.history.awaitingAcknowledgment', this.copyLocale.locale()) : translate('records.history.awaitingConfirmation', this.copyLocale.locale()));
  protected readonly reachedLabel = computed(() =>
    this.kind() === 'fund' ? translate('records.history.targetReached', this.copyLocale.locale()) : translate('records.history.referenceReached', this.copyLocale.locale()));
}

/**
 * The dated history of reports on a record, newest first: who reported it, when the money moved and when it was
 * submitted, the attachment, and the other parent's response. Only the other parent sees the response buttons.
 */
@Component({
  selector: 'app-record-history',
  imports: [TranslatePipe, AppCurrencyPipe, AppDatePipe, Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (entries().length) {
      <ul>
        @for (entry of entries(); track entry.id) {
          <li>
            <div class="row">
              <strong>{{ entry.yours ? ('feature.you.08b041' | tr) : ('feature.co.parent' | tr) }}</strong>
              <strong>{{ entry.amountMinor / 100 | appCurrency: currency() : 'symbol' }}</strong>
            </div>
            <p class="meta">
              {{ 'feature.paid' | tr }} {{ entry.paidOn | appDate: 'MMM d' : 'UTC' }}@if (kind() === 'fund') { {{ entry.paidTo === 'Vendor' ? ('feature.to.a.vendor' | tr) : ('feature.to.co.parent' | tr) }}}
              {{ 'feature.submitted' | tr }} {{ entry.submittedAt | appDate: 'MMM d, h:mm a' }}
              @if (entry.respondedAt) { · {{ responded(entry) }} {{ entry.respondedAt | appDate: 'MMM d, h:mm a' }} }
            </p>
            <div class="row">
              <a class="file" [href]="attachmentUrl()(entry.id)" download>
                <app-icon name="note" [size]="18" />
                {{ 'feature.payment.attachment' | tr }} {{ entry.attachmentType === 'application/pdf' ? 'PDF' : ('feature.image' | tr) }}
                <span class="visually-hidden">{{ 'feature.download.884677' | tr }}</span>
              </a>
              <span class="status" [class]="entry.status.toLowerCase()">{{ status(entry) }}</span>
            </div>
            @if (entry.canRespond) {
              <div class="actions">
                <button type="button" class="primary" [disabled]="busy()" (click)="respond.emit({ entry, response: 'acknowledge' })">
                  {{ entry.paidTo === 'Vendor' ? ('feature.acknowledge.contribution' | tr) : ('feature.confirm.receipt' | tr) }}
                  <span class="visually-hidden">{{ 'feature.of' | tr }} {{ entry.amountMinor / 100 | appCurrency: currency() : 'symbol' }}</span>
                </button>
                <button type="button" [disabled]="busy()" (click)="respond.emit({ entry, response: 'dispute' })">
                  {{ 'feature.flag.a.mismatch' | tr }}
                  <span class="visually-hidden">{{ 'feature.for' | tr }} {{ entry.amountMinor / 100 | appCurrency: currency() : 'symbol' }}</span>
                </button>
              </div>
            }
          </li>
        }
      </ul>
    } @else {
      <p class="empty">{{ kind() === 'fund' ? ('feature.no.contributions.reported.yet' | tr) : ('feature.no.payments.reported.yet' | tr) }}</p>
    }
  `,
  styles: `
    ul { display: grid; gap: var(--space-3); margin: 0; padding: 0; list-style: none; }
    li {
      display: grid;
      gap: var(--space-2);
      border: 1px solid var(--color-outline);
      border-radius: var(--radius-card);
      padding: var(--space-3) var(--space-4);
      background: var(--color-surface);
    }
    p { margin: 0; }
    .row { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: var(--space-2); }
    .row strong { font-size: 1.0625rem; }
    .meta, .empty { color: var(--color-text-secondary); font-size: 0.875rem; }
    .file { display: inline-flex; align-items: center; gap: var(--space-2); min-height: var(--target-min); color: var(--color-text); font-size: 0.9375rem; }
    .status { border-radius: var(--radius-pill); padding: var(--space-1) var(--space-3); font-size: 0.875rem; font-weight: 700; }
    .pending { background: var(--color-status-pending-bg); }
    .acknowledged { background: var(--color-status-confirmed-bg); }
    .disputed { background: var(--color-status-rejected-bg); }
    .actions { display: flex; flex-wrap: wrap; gap: var(--space-2); }
    button {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      min-height: var(--target-min);
      border: 1px solid var(--color-outline);
      border-radius: var(--radius-control);
      padding: var(--space-2) var(--space-3);
      background: var(--color-surface);
      color: var(--color-text);
      font: inherit;
      font-weight: 650;
      cursor: pointer;
    }
    .primary { border-color: var(--color-action); background: var(--color-action); color: var(--color-on-action); }
    button:disabled { background: var(--color-surface-soft); color: var(--color-disabled-text); }
    :is(a, button):focus-visible { outline: 2px solid var(--color-focus); outline-offset: 2px; }
  `,
})
export class RecordHistory {
  private readonly copyLocale = inject(LocaleService);
  readonly entries = input.required<readonly RecordEntry[]>();
  readonly currency = input.required<FundCurrency>();
  readonly kind = input<'fund' | 'support'>('fund');
  readonly busy = input(false);
  readonly attachmentUrl = input.required<(entryId: string) => string>();
  readonly respond = output<{ entry: RecordEntry; response: EntryResponse }>();

  protected status(entry: RecordEntry): string {
    if (entry.status === 'Disputed') return translate('records.history.mismatch', this.copyLocale.locale());
    const vendor = entry.paidTo === 'Vendor';
    if (entry.status === 'Acknowledged') return vendor ? translate('records.history.acknowledged', this.copyLocale.locale()) : translate('records.history.received', this.copyLocale.locale());
    return vendor ? translate('records.history.pendingAcknowledgment', this.copyLocale.locale()) : translate('records.history.pendingConfirmation', this.copyLocale.locale());
  }

  protected responded(entry: RecordEntry): string {
    if (entry.status === 'Disputed') return translate('records.history.mismatch', this.copyLocale.locale());
    return entry.paidTo === 'Vendor' ? translate('records.history.acknowledged', this.copyLocale.locale()) : translate('records.history.received', this.copyLocale.locale());
  }
}
