import { ChangeDetectionStrategy, Component, input, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';

import { FundCurrency, SupportDraft } from '../../core/api/api';
import { Icon } from '../../shared/icon/icon';
import { parseMinor } from './money';

const currencies: readonly FundCurrency[] = ['USD', 'CAD', 'MXN'];

/**
 * Start a one-time Child Support record (#477): a period or payment both parents keep a shared copy of. It never
 * recurs, and it isn't a demand or an official record: payment goes through the channel the order or agency requires.
 */
@Component({
  selector: 'app-support-form',
  imports: [FormsModule, Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <form (ngSubmit)="submit()">
      <label>
        Record title
        <input name="supportTitle" type="text" maxlength="120" required placeholder="November 2026" [(ngModel)]="title" />
      </label>
      <fieldset>
        <legend>Who pays</legend>
        <label class="choice"><input type="radio" name="youPay" [value]="true" [(ngModel)]="youPay" /> I pay</label>
        <label class="choice"><input type="radio" name="youPay" [value]="false" [(ngModel)]="youPay" /> My co-parent pays</label>
      </fieldset>
      <div class="pair">
        <label>
          Currency
          <select name="supportCurrency" [(ngModel)]="currency">
            @for (code of currencyOptions; track code) {
              <option [value]="code">{{ code }}</option>
            }
          </select>
        </label>
        <label>
          Reference amount · optional
          <input name="reference" type="text" inputmode="decimal" autocomplete="off" [(ngModel)]="reference" />
        </label>
      </div>
      <p class="note">
        This is a shared record of payments you report, not a request for payment or an official record. Pay through
        the channel your order or agency requires. Confirming receipt doesn’t verify bank settlement or compliance.
      </p>
      @if (showError()) {
        <p class="error" role="alert">Enter a title and who pays. A reference amount, if you add one, must be above zero.</p>
      }
      <button type="submit" class="primary" [disabled]="submitting()">Create record</button>
      <p class="privacy"><app-icon name="lock" /> Visible to authorized parents only</p>
    </form>
  `,
  styles: `
    form { display: grid; gap: var(--space-4); }
    p { margin: 0; }
    label, fieldset { display: grid; gap: var(--space-2); }
    label, legend { font-weight: 600; }
    fieldset { min-inline-size: 0; margin: 0; border: 0; padding: 0; grid-template-columns: repeat(2, minmax(0, 1fr)); }
    legend { grid-column: 1 / -1; margin-block-end: var(--space-2); }
    .choice {
      display: flex;
      align-items: center;
      gap: var(--space-2);
      min-height: var(--target-min);
      border: 1px solid var(--color-outline);
      border-radius: var(--radius-control);
      padding-inline: var(--space-3);
      background: var(--color-surface);
    }
    .choice:has(input:checked) { border-color: var(--color-support-fg); background: var(--color-selected); }
    .choice input { margin: 0; accent-color: var(--color-action); }
    .pair { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: var(--space-3); }
    .note {
      border-radius: var(--radius-control);
      padding: var(--space-3) var(--space-4);
      background: var(--color-surface-soft);
      color: var(--color-text-secondary);
      font-size: 0.9375rem;
    }
    .privacy { display: flex; align-items: center; gap: var(--space-2); color: var(--color-text-secondary); font-size: 0.875rem; }
    .error { color: var(--color-danger); }
    input:not([type='radio']), select, button {
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
    .primary { border-color: var(--color-action); background: var(--color-action); color: var(--color-on-action); font-weight: 650; }
    button:disabled { background: var(--color-surface-soft); color: var(--color-disabled-text); }
    :is(input, select, button):focus-visible { outline: 2px solid var(--color-focus); outline-offset: 2px; }
    @media (width < 30rem) { .pair, fieldset { grid-template-columns: minmax(0, 1fr); } }
  `,
})
export class SupportForm {
  readonly submitting = input(false);
  readonly record = output<SupportDraft>();

  protected readonly currencyOptions = currencies;
  protected readonly title = signal('');
  protected readonly youPay = signal<boolean | null>(null);
  protected readonly currency = signal<FundCurrency>('USD');
  protected readonly reference = signal('');
  protected readonly showError = signal(false);

  protected submit(): void {
    if (this.submitting()) return;
    const title = this.title().trim();
    const youPay = this.youPay();
    const referenceText = this.reference().trim();
    const referenceMinor = referenceText ? parseMinor(referenceText) : null;
    if (!title || youPay === null || (referenceText && !referenceMinor)) {
      this.showError.set(true);
      return;
    }
    this.showError.set(false);
    this.record.emit({ title, currency: this.currency(), youPay, referenceMinor });
  }
}
