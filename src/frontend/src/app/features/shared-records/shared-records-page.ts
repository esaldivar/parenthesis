import { CurrencyPipe } from '@angular/common';
import {
  ChangeDetectionStrategy, Component, DestroyRef, ElementRef, Injector, afterNextRender,
  computed, effect, inject, signal, viewChild,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { Api, SharedFund, SharedFundDraft } from '../../core/api/api';
import { generalMessage, toProblem } from '../../core/api/problem';
import { AuthStore } from '../../core/auth/auth.store';
import { Icon } from '../../shared/icon/icon';
import { SharedFundProposalForm } from './shared-fund-proposal-form';

interface Workspace {
  readonly membershipId: string;
  readonly hasCoParent: boolean;
  readonly children: readonly { id: string; displayName: string }[];
  readonly funds: readonly SharedFund[];
}

@Component({
  selector: 'app-shared-records-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CurrencyPipe, Icon, RouterLink, SharedFundProposalForm],
  templateUrl: './shared-records-page.html',
  styleUrl: './shared-records-page.scss',
})
export class SharedRecordsPage {
  private readonly api = inject(Api);
  private readonly auth = inject(AuthStore);
  private readonly injector = inject(Injector);
  private readonly destroy = inject(DestroyRef);
  private readonly proposalHeading = viewChild<ElementRef<HTMLElement>>('proposalHeading');
  private readonly fundHeading = viewChild<ElementRef<HTMLElement>>('fundHeading');
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
  private readonly selectedId = signal<string | null>(null);
  protected readonly selected = computed(() => {
    const funds = this.workspace()?.funds ?? [];
    return funds.find(fund => fund.id === this.selectedId()) ?? funds[0] ?? null;
  });
  protected readonly creating = signal(false);
  protected readonly busy = signal(false);
  protected readonly error = signal('');
  protected readonly announcement = signal('');
  protected readonly labels = {
    AwaitingAgreement: 'Awaiting agreement',
    Open: 'Agreed',
    ProposalEnded: 'Proposal ended',
  } as const;

  constructor() {
    effect(() => {
      const scope = this.scope();
      this.loaded.set(null);
      this.selectedId.set(null);
      this.creating.set(false);
      this.busy.set(false);
      this.error.set('');
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
      const [family, children, funds] = await Promise.all([
        this.api.family(scope.familyId), this.api.children(scope.familyId), this.api.sharedFunds(scope.familyId),
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
        },
      });
    } catch (error) {
      if (this.isCurrent(scope)) this.error.set(generalMessage(toProblem(error)));
    }
  }

  protected start(): void {
    this.creating.set(true);
    this.focus(this.proposalHeading);
  }

  protected close(): void {
    this.creating.set(false);
    this.focus(this.newRequest);
  }

  protected select(fund: SharedFund): void {
    this.selectedId.set(fund.id);
    this.focus(this.fundHeading);
  }

  protected childrenOf(fund: SharedFund): string {
    return (this.workspace()?.children ?? [])
      .filter(child => fund.childIds.includes(child.id))
      .map(child => child.displayName)
      .join(', ');
  }

  protected async propose(draft: SharedFundDraft): Promise<void> {
    const scope = this.scope();
    if (!scope || this.busy()) return;
    this.busy.set(true);
    this.error.set('');
    this.announcement.set('');
    try {
      const created = await this.api.proposeSharedFund(scope.familyId, draft);
      if (!this.isCurrent(scope)) return;
      const workspace = this.workspace();
      if (workspace) {
        const fund: SharedFund = { ...draft, ...created, proposerId: workspace.membershipId };
        this.loaded.set({ scope, workspace: { ...workspace, funds: [fund, ...workspace.funds] } });
      }
      this.selectedId.set(created.id);
      this.creating.set(false);
      this.announcement.set('Shared Fund proposal sent for agreement.');
      this.focus(this.fundHeading);
    } catch (error) {
      if (this.isCurrent(scope)) this.error.set(generalMessage(toProblem(error)));
    } finally {
      if (this.isCurrent(scope)) this.busy.set(false);
    }
  }

  protected async decide(fund: SharedFund, approve: boolean): Promise<void> {
    const scope = this.scope();
    if (!scope || this.busy()) return;
    this.busy.set(true);
    this.error.set('');
    this.announcement.set('');
    try {
      const decision = await (approve
        ? this.api.approve(scope.familyId, fund.approvalId)
        : this.api.reject(scope.familyId, fund.approvalId));
      if (!this.isCurrent(scope)) return;
      const workspace = this.workspace();
      if (workspace) {
        const status = decision.status === 'Approved' ? 'Open' : 'ProposalEnded';
        this.loaded.set({
          scope,
          workspace: { ...workspace, funds: workspace.funds.map(item => item.id === fund.id ? { ...item, status } : item) },
        });
      }
      this.announcement.set(approve ? 'Shared Fund agreed.' : 'Changes requested. This proposal ended.');
      this.focus(this.fundHeading);
    } catch (error) {
      if (this.isCurrent(scope)) this.error.set(generalMessage(toProblem(error)));
    } finally {
      if (this.isCurrent(scope)) this.busy.set(false);
    }
  }

  private isCurrent(scope: object): boolean {
    return !this.destroy.destroyed && this.scope() === scope;
  }

  private focus(element: () => ElementRef<HTMLElement> | undefined): void {
    afterNextRender(() => element()?.nativeElement.focus(), { injector: this.injector });
  }
}
