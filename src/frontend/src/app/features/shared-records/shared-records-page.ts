import { CurrencyPipe } from '@angular/common';
import {
  ChangeDetectionStrategy, Component, DestroyRef, ElementRef, Injector, afterNextRender,
  computed, effect, inject, signal, viewChild,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import {
  Api, RecordEntry, ReportDraft, SharedFund, SharedFundDraft, SupportDraft, SupportRecord,
} from '../../core/api/api';
import { generalMessage, Problem, toProblem } from '../../core/api/problem';
import { AuthStore } from '../../core/auth/auth.store';
import { SharedRecordsAttentionStore } from '../../core/shared-records/shared-records-attention.store';
import { LoadingIndicator } from '../../shared/brand/loading-indicator';
import { Icon } from '../../shared/icon/icon';
import { EntryResponse, RecordHistory, RecordProgress } from './record-history';
import { ReportForm } from './report-form';
import { SharedFundProposalForm } from './shared-fund-proposal-form';
import { SupportForm } from './support-form';

interface Workspace {
  readonly membershipId: string;
  readonly hasCoParent: boolean;
  readonly children: readonly { id: string; displayName: string }[];
  readonly funds: readonly SharedFund[];
  readonly support: readonly SupportRecord[];
  /** False until the server can save payment attachments; the report form says so before a file is picked. */
  readonly attachmentsReady: boolean;
}

/** A record in the list: a Shared Fund or a Child Support record, always labeled with its type in text. */
type Listed =
  | { readonly key: string; readonly kind: 'fund'; readonly title: string; readonly fund: SharedFund }
  | { readonly key: string; readonly kind: 'support'; readonly title: string; readonly record: SupportRecord };

type Composer = { readonly mode: 'new' } | { readonly mode: 'report'; readonly key: string };

/**
 * Shared records (#477, docs/design/shared-records-issue-477.md): parent-only Shared Funds and one-time Child Support
 * records. Everything here is loaded for the signed-in parent only and dropped the moment the profile changes.
 */
@Component({
  selector: 'app-shared-records-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CurrencyPipe, Icon, LoadingIndicator, RouterLink, RecordHistory, RecordProgress, ReportForm, SharedFundProposalForm, SupportForm],
  templateUrl: './shared-records-page.html',
  styleUrl: './shared-records-page.scss',
})
export class SharedRecordsPage {
  private readonly api = inject(Api);
  private readonly auth = inject(AuthStore);
  private readonly attention = inject(SharedRecordsAttentionStore, { optional: true });
  private readonly injector = inject(Injector);
  private readonly destroy = inject(DestroyRef);
  private readonly composerHeading = viewChild<ElementRef<HTMLElement>>('composerHeading');
  private readonly recordHeading = viewChild<ElementRef<HTMLElement>>('recordHeading');
  private readonly newRequest = viewChild<ElementRef<HTMLButtonElement>>('newRequest');

  private readonly scope = computed(() => {
    const family = this.auth.currentFamily();
    const user = this.auth.user();
    return user && family?.role === 'Parent' ? { familyId: family.id, userId: user.id } : null;
  });
  protected readonly isParent = computed(() => this.scope() !== null);
  private readonly loaded = signal<{ scope: object; workspace: Workspace } | null>(null);
  protected readonly workspace = computed(() => {
    const loaded = this.loaded();
    return loaded?.scope === this.scope() ? loaded.workspace : null;
  });
  protected readonly records = computed<Listed[]>(() => {
    const workspace = this.workspace();
    if (!workspace) return [];
    const funds = workspace.funds.map(fund => ({ key: `fund:${fund.id}`, kind: 'fund' as const, title: fund.title, fund }));
    const support = workspace.support.map(record => ({ key: `support:${record.id}`, kind: 'support' as const, title: record.title, record }));
    return [...funds, ...support];
  });
  private readonly selectedKey = signal<string | null>(null);
  protected readonly selected = computed(() => {
    const records = this.records();
    return records.find(item => item.key === this.selectedKey()) ?? records[0] ?? null;
  });
  protected readonly composer = signal<Composer | null>(null);
  protected readonly requestType = signal<'fund' | 'support'>('fund');
  protected readonly reporting = computed(() => {
    const composer = this.composer();
    return composer?.mode === 'report' ? this.records().find(item => item.key === composer.key) ?? null : null;
  });
  protected readonly busy = signal(false);
  protected readonly savingLabel = computed(() => {
    const report = this.reporting();
    if (report) return report.kind === 'fund' ? 'Reporting contribution…' : 'Reporting payment…';
    return this.requestType() === 'fund' ? 'Sending request…' : 'Creating record…';
  });
  protected readonly error = signal('');
  protected readonly reportError = signal('');
  protected readonly announcement = signal('');
  protected readonly labels = {
    AwaitingAgreement: 'Awaiting agreement',
    Open: 'Agreed',
    ProposalEnded: 'Proposal ended',
  } as const;
  protected readonly attachmentUrl = (entryId: string) => this.api.entryAttachmentUrl(this.scope()?.familyId ?? '', entryId);

  constructor() {
    effect(() => {
      const scope = this.scope();
      this.loaded.set(null);
      this.selectedKey.set(null);
      this.composer.set(null);
      this.busy.set(false);
      this.error.set('');
      this.reportError.set('');
      this.announcement.set('');
      if (scope) void this.load(scope);
    });
  }

  protected retry(): void {
    const scope = this.scope();
    if (scope) void this.load(scope);
  }

  private async load(scope: NonNullable<ReturnType<typeof this.scope>>): Promise<void> {
    this.error.set('');
    try {
      const [family, children, funds, support, storage] = await Promise.all([
        this.api.family(scope.familyId), this.api.children(scope.familyId),
        this.api.sharedFunds(scope.familyId), this.api.childSupport(scope.familyId),
        // If this check fails, let parents try: the server still refuses with the reason.
        this.api.sharedRecordsAttachmentStorage(scope.familyId).catch(() => ({ ready: true })),
      ]);
      if (!this.isCurrent(scope)) return;
      const parent = family.members.find(member => member.isYou && member.role === 'Parent');
      if (!parent) return;
      this.loaded.set({
        scope,
        workspace: {
          membershipId: parent.membershipId,
          hasCoParent: family.members.some(member => !member.isYou && member.role === 'Parent'),
          children: children.filter(child => child.status === 'Active').map(child => ({ id: child.id, displayName: child.firstName })),
          funds,
          support,
          attachmentsReady: storage.ready,
        },
      });
    } catch (error) {
      if (this.isCurrent(scope)) this.error.set(generalMessage(toProblem(error)));
    }
  }

  protected start(): void {
    this.reportError.set('');
    this.composer.set({ mode: 'new' });
    this.focus(this.composerHeading);
  }

  protected startReport(item: Listed): void {
    this.reportError.set('');
    this.composer.set({ mode: 'report', key: item.key });
    this.focus(this.composerHeading);
  }

  protected close(): void {
    const wasReport = this.composer()?.mode === 'report';
    this.composer.set(null);
    this.reportError.set('');
    this.focus(wasReport ? this.recordHeading : this.newRequest);
  }

  protected select(item: Listed): void {
    this.selectedKey.set(item.key);
    this.focus(this.recordHeading);
  }

  protected childrenOf(fund: SharedFund): string {
    return (this.workspace()?.children ?? [])
      .filter(child => fund.childIds.includes(child.id))
      .map(child => child.displayName)
      .join(', ');
  }

  protected async propose(draft: SharedFundDraft): Promise<void> {
    await this.run(async scope => {
      const created = await this.api.proposeSharedFund(scope.familyId, draft);
      this.update(scope, workspace => ({
        ...workspace,
        funds: [{ ...draft, ...created, proposerId: workspace.membershipId, entries: [], totals: empty }, ...workspace.funds],
      }));
      this.selectedKey.set(`fund:${created.id}`);
      this.composer.set(null);
      this.announcement.set('Shared Fund proposal sent for agreement.');
      this.focus(this.recordHeading);
    });
  }

  protected async createSupport(draft: SupportDraft): Promise<void> {
    await this.run(async scope => {
      const record = await this.api.createChildSupport(scope.familyId, draft);
      this.update(scope, workspace => ({ ...workspace, support: [record, ...workspace.support] }));
      this.selectedKey.set(`support:${record.id}`);
      this.composer.set(null);
      this.announcement.set('Child Support record created.');
      this.focus(this.recordHeading);
    });
  }

  protected async decide(fund: SharedFund, approve: boolean): Promise<void> {
    await this.run(async scope => {
      const decision = await (approve
        ? this.api.approve(scope.familyId, fund.approvalId)
        : this.api.reject(scope.familyId, fund.approvalId));
      const status = decision.status === 'Approved' ? 'Open' : 'ProposalEnded';
      this.update(scope, workspace => ({
        ...workspace, funds: workspace.funds.map(item => item.id === fund.id ? { ...item, status } : item),
      }));
      this.announcement.set(approve ? 'Shared Fund agreed.' : 'Changes requested. This proposal ended.');
      this.focus(this.recordHeading);
      // The proposal no longer waits on this parent: clear the navigation dot now, not at the next navigation.
      void this.attention?.refresh();
    });
  }

  /** Sends a report. On failure the form keeps everything entered, and a retry reuses the same request id. */
  protected async submitReport(item: Listed, draft: ReportDraft): Promise<void> {
    const scope = this.scope();
    if (!scope || this.busy()) return;
    this.busy.set(true);
    this.reportError.set('');
    this.announcement.set('');
    try {
      const entry = item.kind === 'fund'
        ? await this.api.reportContribution(scope.familyId, item.fund.id, draft)
        : await this.api.reportSupportPayment(scope.familyId, item.record.id, draft);
      if (!this.isCurrent(scope)) return;
      this.updateEntries(scope, item.key, entries => [entry, ...entries.filter(existing => existing.id !== entry.id)]);
      this.composer.set(null);
      this.announcement.set(item.kind === 'fund'
        ? 'Contribution reported. Your co-parent can now acknowledge it.'
        : 'Payment reported. Your co-parent can now confirm receipt.');
      this.focus(this.recordHeading);
    } catch (error) {
      if (this.isCurrent(scope)) this.reportFailed(scope, toProblem(error));
    } finally {
      if (this.isCurrent(scope)) this.busy.set(false);
    }
  }

  private reportFailed(scope: NonNullable<ReturnType<typeof this.scope>>, problem: Problem): void {
    if (problem.reason === 'storage-off') {
      // Storage went away since the page loaded: show the form's "can't be sent yet" state instead of an error.
      this.update(scope, workspace => ({ ...workspace, attachmentsReady: false }));
      return;
    }
    this.reportError.set(generalMessage(problem));
  }

  protected async respond(item: Listed, entry: RecordEntry, response: EntryResponse): Promise<void> {
    await this.run(async scope => {
      const updated = await this.api.respondToEntry(scope.familyId, entry.id, response);
      this.updateEntries(scope, item.key, entries => entries.map(existing => existing.id === updated.id ? updated : existing));
      this.announcement.set(response === 'dispute'
        ? 'Mismatch flagged. It doesn’t count toward the total.'
        : entry.paidTo === 'Vendor' ? 'Contribution acknowledged.' : 'Receipt confirmed.');
      void this.attention?.refresh();
    });
  }

  private async run(action: (scope: NonNullable<ReturnType<typeof this.scope>>) => Promise<void>): Promise<void> {
    const scope = this.scope();
    if (!scope || this.busy()) return;
    this.busy.set(true);
    this.error.set('');
    this.announcement.set('');
    try {
      await action(scope);
    } catch (error) {
      if (this.isCurrent(scope)) this.error.set(generalMessage(toProblem(error)));
    } finally {
      if (this.isCurrent(scope)) this.busy.set(false);
    }
  }

  private update(scope: object, change: (workspace: Workspace) => Workspace): void {
    const workspace = this.workspace();
    if (workspace && this.isCurrent(scope)) this.loaded.set({ scope, workspace: change(workspace) });
  }

  /** Replaces a record's reports and recomputes its totals the way the server does. */
  private updateEntries(scope: object, key: string, change: (entries: readonly RecordEntry[]) => RecordEntry[]): void {
    this.update(scope, workspace => ({
      ...workspace,
      funds: workspace.funds.map(fund => {
        if (`fund:${fund.id}` !== key) return fund;
        const entries = change(fund.entries ?? []);
        return { ...fund, entries, totals: totalsOf(entries) };
      }),
      support: workspace.support.map(record => {
        if (`support:${record.id}` !== key) return record;
        const entries = change(record.entries);
        return { ...record, entries, totals: totalsOf(entries) };
      }),
    }));
  }

  private isCurrent(scope: object): boolean {
    return !this.destroy.destroyed && this.scope() === scope;
  }

  private focus(element: () => ElementRef<HTMLElement> | undefined): void {
    afterNextRender(() => element()?.nativeElement.focus(), { injector: this.injector });
  }
}

const empty = { acknowledgedMinor: 0, pendingMinor: 0, disputedMinor: 0 };

function totalsOf(entries: readonly RecordEntry[]) {
  return entries.reduce((totals, entry) => ({
    acknowledgedMinor: totals.acknowledgedMinor + (entry.status === 'Acknowledged' ? entry.amountMinor : 0),
    pendingMinor: totals.pendingMinor + (entry.status === 'Pending' ? entry.amountMinor : 0),
    disputedMinor: totals.disputedMinor + (entry.status === 'Disputed' ? entry.amountMinor : 0),
  }), empty);
}
