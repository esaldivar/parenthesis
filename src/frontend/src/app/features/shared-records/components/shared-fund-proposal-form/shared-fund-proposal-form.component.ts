import { AppCurrencyPipe } from '../../../../core/i18n/locale-formatting';
import { TranslatePipe } from '../../../../core/i18n/translations';
import { ChangeDetectionStrategy, Component, computed, input, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';

import { FundCurrency, SharedFundDraft } from '../../../../core/api/api';
import { Icon } from '../../../../shared/icon/icon';
import { parseMinor as parseShare } from '../../money';

const currencies: readonly FundCurrency[] = ['USD', 'CAD', 'MXN'];

@Component({
  selector: 'app-shared-fund-proposal-form',
  imports: [TranslatePipe, AppCurrencyPipe, FormsModule, Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <form (ngSubmit)="submit()">
      <label>
        {{ 'feature.fund.title' | tr }}
        <input name="title" type="text" maxlength="120" required [(ngModel)]="title" />
      </label>

      @if (children().length) {
        <fieldset class="children">
          <legend>{{ 'feature.children.optional' | tr }}</legend>
          @for (child of children(); track child.id) {
            <label class="child-option">
              <input type="checkbox" [checked]="childIds().has(child.id)"
                (change)="selectChild(child.id, $any($event.target).checked)" />
              <span>{{ child.displayName }}</span>
            </label>
          }
        </fieldset>
      }

      <label>
        {{ 'feature.currency' | tr }}
        <select name="currency" [(ngModel)]="currency">
          @for (code of currencyOptions; track code) {
            <option [value]="code">{{ code }}</option>
          }
        </select>
      </label>

      <div class="shares">
        <label>
          {{ 'feature.your.share' | tr }}{{ currency() }})
          <input name="yourShare" type="text" inputmode="decimal" required [(ngModel)]="yourShare" />
        </label>
        <label>
          {{ 'feature.co.parent.share' | tr }}{{ currency() }})
          <input name="coParentShare" type="text" inputmode="decimal" required [(ngModel)]="coParentShare" />
        </label>
      </div>

      <div class="target">
        <p class="total">
          <strong>{{ 'feature.proposed.target' | tr }}</strong>
          @let target = targetMinor();
          @if (target !== null) {
            <strong>{{ target / 100 | appCurrency: currency() : 'symbol' }}</strong>
          } @else {
            <span>{{ 'feature.enter.both.shares.to.see.the.total' | tr }}</span>
          }
        </p>
        <p>{{ 'feature.sending.records.your.agreement.both.parents.must' | tr }}</p>
      </div>
      @if (showError()) {
        <p class="error" role="alert">{{ 'feature.enter.a.title.and.both.shares.using' | tr }}</p>
      }
      <!-- The page passes its loading indicator here, beside the submit action, so it stays in view (#496). -->
      <ng-content select="app-loading-indicator" />
      <button type="submit" [disabled]="submitting()">{{ 'feature.send.for.agreement' | tr }}</button>
      <p class="privacy"><app-icon name="lock" /> {{ 'feature.visible.to.authorized.parents.only' | tr }}</p>
    </form>
  `,
  styles: `
    form { display: grid; gap: var(--space-4); }
    p { margin: 0; }
    p { color: var(--color-text-secondary); }
    label, .shares { display: grid; gap: var(--space-2); }
    label, legend { font-weight: 600; }
    .shares { grid-template-columns: repeat(2, minmax(0, 1fr)); }
    .children {
      display: flex;
      flex-wrap: wrap;
      gap: var(--space-2);
      min-inline-size: 0;
      margin: 0;
      border: 0;
      padding: 0;
    }
    .child-option {
      display: flex;
      align-items: center;
      min-height: var(--target-min);
      border: 1px solid var(--color-outline);
      border-radius: var(--radius-pill);
      padding-inline: var(--space-3);
    }
    .child-option:has(input:checked) { background: var(--color-selected); }
    .target {
      display: grid;
      gap: var(--space-2);
      border-radius: var(--radius-control);
      padding: var(--space-4);
      background: var(--color-surface-soft);
    }
    .target strong { color: var(--color-text); }
    .privacy { display: flex; align-items: center; gap: var(--space-2); font-size: 0.875rem; }
    input:not([type='checkbox']), select, button {
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
    :is(input, select, button):focus-visible { outline: 2px solid var(--color-focus); outline-offset: 2px; }
    .total { display: flex; flex-wrap: wrap; gap: var(--space-2); justify-content: space-between; }
    .error { color: var(--color-danger); }
    button { background: var(--color-action); color: var(--color-on-action); font-weight: 600; }
    button:disabled { background: var(--color-surface-soft); color: var(--color-disabled-text); }
  `,
})
export class SharedFundProposalForm {
  readonly children = input<readonly { id: string; displayName: string }[]>([]);
  readonly submitting = input(false);
  readonly proposal = output<SharedFundDraft>();

  protected readonly currencyOptions = currencies;
  protected readonly title = signal('');
  protected readonly childIds = signal<ReadonlySet<string>>(new Set());
  protected readonly currency = signal<FundCurrency>('USD');
  protected readonly yourShare = signal('');
  protected readonly coParentShare = signal('');
  protected readonly showError = signal(false);

  protected readonly targetMinor = computed(() => {
    const yours = parseShare(this.yourShare());
    const theirs = parseShare(this.coParentShare());
    return yours === null || theirs === null ? null : yours + theirs;
  });

  protected selectChild(id: string, checked: boolean): void {
    const selected = new Set(this.childIds());
    if (checked) selected.add(id);
    else selected.delete(id);
    this.childIds.set(selected);
  }

  protected submit(): void {
    if (this.submitting()) return;

    const title = this.title().trim();
    const proposerShareMinor = parseShare(this.yourShare());
    const coParentShareMinor = parseShare(this.coParentShare());
    if (!title || proposerShareMinor === null || coParentShareMinor === null || !this.targetMinor()) {
      this.showError.set(true);
      return;
    }

    this.showError.set(false);
    this.proposal.emit({
      title,
      childIds: this.children().filter(child => this.childIds().has(child.id)).map(child => child.id),
      currency: this.currency(),
      proposerShareMinor,
      coParentShareMinor,
    });
  }
}
