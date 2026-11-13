import { LocaleService } from '../../../../core/i18n/locale.service';
import { TranslatePipe, translate } from '../../../../core/i18n/translations';
import { inject, ChangeDetectionStrategy, Component, input, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';

import { FundCurrency, PaidTo, ReportDraft } from '../../../../core/api/api';
import { Icon } from '../../../../shared/icon/icon';
import { localToday, parseMinor } from '../../money';

const MAX_BYTES = 10 * 1024 * 1024;
const TYPES = new Set(['application/pdf', 'image/png', 'image/jpeg']);

/**
 * Report a contribution to a Shared Fund, or a Child Support payment (#477). The attachment is required. If sending
 * fails, everything entered stays and the same request id is sent again, so a retry can't record it twice.
 */
@Component({
  selector: 'app-report-form',
  imports: [TranslatePipe, FormsModule, Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (!attachmentsReady()) {
      <div class="unavailable">
        <p class="notice" role="status">
          <app-icon name="cloud-upload" />
          <span>{{ 'feature.attachments.can.t.be.saved.yet.so' | tr }} {{ kind() === 'fund' ? ('feature.contributions' | tr) : ('feature.payments' | tr) }} {{ 'feature.can.t.be.reported.please.try.again' | tr }}</span>
        </p>
        <div class="actions">
          <button type="button" (click)="cancelled.emit()">{{ 'feature.close' | tr }}</button>
        </div>
      </div>
    } @else {
      <form (ngSubmit)="submit()">
        <label>
          {{ 'feature.amount' | tr }}{{ currency() }})
          <input name="amount" type="text" inputmode="decimal" required autocomplete="off" [(ngModel)]="amount" />
        </label>
        <label>
          {{ 'feature.payment.date' | tr }}
          <input name="paidOn" type="date" required [max]="today" [(ngModel)]="paidOn" />
        </label>
        @if (kind() === 'fund') {
          <fieldset>
            <legend>{{ 'feature.who.was.paid' | tr }}</legend>
            <label class="choice">
              <input type="radio" name="paidTo" value="Vendor" [(ngModel)]="paidTo" />
              <span>{{ 'feature.a.vendor.or.provider' | tr }}<small>{{ 'feature.your.co.parent.acknowledges.the.contribution' | tr }}</small></span>
            </label>
            <label class="choice">
              <input type="radio" name="paidTo" value="CoParent" [(ngModel)]="paidTo" />
              <span>{{ 'feature.my.co.parent' | tr }}<small>{{ 'feature.your.co.parent.confirms.they.received.it' | tr }}</small></span>
            </label>
          </fieldset>
        }
        <div class="attachment">
          <span class="label" id="attachment-label">{{ 'feature.payment.attachment.required' | tr }}</span>
          @if (file(); as chosen) {
            <div class="file">
              <app-icon name="note" />
              <span><strong>{{ chosen.name }}</strong><small>{{ describe(chosen) }} {{ 'feature.attached' | tr }}</small></span>
              <button type="button" class="link" (click)="picker.click()">{{ 'feature.replace' | tr }}</button>
            </div>
          } @else {
            <button type="button" class="choose" aria-describedby="attachment-label attachment-hint" (click)="picker.click()">
              <app-icon name="cloud-upload" /> {{ 'feature.choose.a.pdf.or.image' | tr }}
            </button>
          }
          <input #picker class="visually-hidden" type="file" tabindex="-1" aria-hidden="true"
            accept="application/pdf,image/png,image/jpeg,.pdf,.png,.jpg,.jpeg" (change)="choose(picker)" />
          <p id="attachment-hint" class="hint">{{ 'feature.pdf.png.or.jpeg.up.to.10' | tr }}</p>
        </div>
        @if (problem(); as message) {
          <p class="error" role="alert">{{ message }}</p>
        } @else if (error()) {
          <p class="error" role="alert">{{ error() }} {{ 'feature.your.entries.are.still.here' | tr }}</p>
        }
        <!-- The page passes its loading indicator here, beside the submit action, so it stays in view (#496). -->
        <ng-content select="app-loading-indicator" />
        <div class="actions">
          <button type="submit" class="primary" [disabled]="submitting()">
            {{ submitting() ? ('feature.sending' | tr) : kind() === 'fund' ? ('feature.submit.contribution' | tr) : ('feature.submit.payment' | tr) }}
          </button>
          <button type="button" [disabled]="submitting()" (click)="cancelled.emit()">{{ 'feature.cancel' | tr }}</button>
        </div>
        <p class="privacy"><app-icon name="lock" /> {{ 'feature.visible.to.authorized.parents.only' | tr }}</p>
      </form>
    }
  `,
  styles: `
    form, .unavailable { display: grid; gap: var(--space-4); }
    .notice {
      display: flex;
      align-items: flex-start;
      gap: var(--space-2);
      border: 1px solid var(--color-outline);
      border-radius: var(--radius-control);
      padding: var(--space-3);
      background: var(--color-surface-soft);
    }
    p { margin: 0; }
    label, fieldset, .attachment { display: grid; gap: var(--space-2); }
    label, legend, .label { font-weight: 600; }
    fieldset { min-inline-size: 0; margin: 0; border: 0; padding: 0; }
    .choice {
      grid-template-columns: auto 1fr;
      align-items: start;
      gap: var(--space-3);
      border: 1px solid var(--color-outline);
      border-radius: var(--radius-control);
      padding: var(--space-3);
      background: var(--color-surface);
    }
    .choice:has(input:checked) { border-color: var(--color-action); background: var(--color-selected); }
    .choice input { margin: 0.2rem 0 0; accent-color: var(--color-action); }
    small { display: block; color: var(--color-text-secondary); font-weight: 400; font-size: 0.875rem; }
    .file {
      display: grid;
      grid-template-columns: auto minmax(0, 1fr) auto;
      align-items: center;
      gap: var(--space-3);
      border: 1px solid var(--color-outline);
      border-radius: var(--radius-control);
      padding: var(--space-3);
      background: var(--color-surface);
    }
    .file strong { display: block; overflow-wrap: anywhere; }
    .hint, .privacy { color: var(--color-text-secondary); font-size: 0.875rem; }
    .privacy { display: flex; align-items: center; gap: var(--space-2); }
    .error { color: var(--color-danger); }
    .actions { display: flex; flex-wrap: wrap; gap: var(--space-2); }
    input:not([type='radio']):not([type='file']), button {
      box-sizing: border-box;
      min-width: 0;
      min-height: var(--target-min);
      border: 1px solid var(--color-outline);
      border-radius: var(--radius-control);
      padding: var(--space-2) var(--space-3);
      background: var(--color-surface);
      color: var(--color-text);
      font: inherit;
    }
    button { display: inline-flex; align-items: center; justify-content: center; gap: var(--space-2); font-weight: 650; cursor: pointer; }
    .primary { flex: 1 1 12rem; border-color: var(--color-action); background: var(--color-action); color: var(--color-on-action); }
    .choose { border-style: dashed; }
    .link { border: 0; background: transparent; color: var(--color-action); }
    button:disabled { background: var(--color-surface-soft); color: var(--color-disabled-text); border-color: var(--color-outline); }
    :is(input, button):focus-visible { outline: 2px solid var(--color-focus); outline-offset: 2px; }
  `,
})
export class ReportForm {
  private readonly copyLocale = inject(LocaleService);
  readonly kind = input.required<'fund' | 'support'>();
  readonly currency = input<FundCurrency>('USD');
  readonly submitting = input(false);
  /** Why the last attempt failed (from the server); the entries stay. */
  readonly error = input('');
  /** False while the server can't save attachments: the form says so instead of asking for a file it can't keep. */
  readonly attachmentsReady = input(true);
  readonly report = output<ReportDraft>();
  readonly cancelled = output<void>();

  protected readonly today = localToday();
  protected readonly amount = signal('');
  protected readonly paidOn = signal(this.today);
  protected readonly paidTo = signal<PaidTo>('Vendor');
  protected readonly file = signal<File | null>(null);
  protected readonly problem = signal('');
  /** One id for this report, kept across retries. */
  private readonly requestId = crypto.randomUUID();

  protected choose(picker: HTMLInputElement): void {
    const chosen = picker.files?.[0];
    picker.value = '';
    if (!chosen) return;
    if (!TYPES.has(chosen.type) || chosen.size === 0) {
      this.problem.set(translate('records.attachment.format', this.copyLocale.locale()));
      return;
    }
    if (chosen.size > MAX_BYTES) {
      this.problem.set(translate('records.attachment.size', this.copyLocale.locale()));
      return;
    }
    this.problem.set('');
    this.file.set(chosen);
  }

  protected describe(file: File): string {
    return file.type === 'application/pdf' ? 'PDF' : 'Image';
  }

  protected submit(): void {
    if (this.submitting()) return;
    const amountMinor = parseMinor(this.amount());
    const file = this.file();
    if (!amountMinor) {
      this.problem.set(translate('records.report.amount', this.copyLocale.locale()));
      return;
    }
    if (!this.paidOn() || this.paidOn() > this.today) {
      this.problem.set(translate('records.report.date', this.copyLocale.locale()));
      return;
    }
    if (!file) {
      this.problem.set(translate('records.report.attachment', this.copyLocale.locale()));
      return;
    }
    this.problem.set('');
    this.report.emit({
      amountMinor,
      paidOn: this.paidOn(),
      paidTo: this.kind() === 'fund' ? this.paidTo() : 'CoParent',
      requestId: this.requestId,
      file,
    });
  }
}
