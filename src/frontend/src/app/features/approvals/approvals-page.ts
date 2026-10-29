import { DatePipe } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  Injector,
  OnInit,
  afterNextRender,
  computed,
  inject,
  signal,
} from '@angular/core';
import { FormControl, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { Api, ChangeRequest, ChangeRequestType, Child, FamilyMember } from '../../core/api/api';
import { generalMessage, toProblem } from '../../core/api/problem';
import { AuthStore } from '../../core/auth/auth.store';
import { Toasts } from '../../shared/toast/toasts';

/** The request types the inbox shows: children, PINs and the calendar (the handoff keeps approvals in this inbox). */
const SHOWN: readonly string[] = [
  'ChildCreate',
  'ChildPinChange',
  'CalendarCreate',
  'JointEventCreate',
  'CalendarModify',
  'CalendarCancel',
] satisfies ChangeRequestType[];

/** Matches the API's limit (ApprovalDecision.CommentMaxLength). */
const COMMENT_MAX = 500;

/**
 * Co-parent approvals (ADR-0003, ADR-0006): adding a child and changing a child's PIN need both parents. A pending
 * request always reads as a proposal, never as something already done. Children never reach this page; the API
 * refuses child sessions here too.
 */
@Component({
  selector: 'app-approvals-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DatePipe, ReactiveFormsModule, MatButtonModule, MatFormFieldModule, MatInputModule],
  template: `
    <h1>Approvals</h1>
    <p class="intro">Some changes need both parents to agree. Nothing here takes effect until you both approve.</p>

    @if (error(); as error) {
      <p class="alert" role="alert">{{ error }}</p>
    }

    <section aria-labelledby="waiting-heading">
      <h2 id="waiting-heading" tabindex="-1">Waiting</h2>
      @if (pending(); as pending) {
        @if (pending.length === 0) {
          <p class="muted">Nothing is waiting for either of you.</p>
        } @else {
          <ul class="requests">
            @for (request of pending; track request.id) {
              <li class="request">
                <div class="request__head">
                  <p class="request__summary">{{ request.summary }}</p>
                  <span class="chip chip--pending">{{ request.canDecide ? 'Waiting for you' : 'Waiting for your co-parent' }}</span>
                </div>
                <p class="muted">
                  Proposed by {{ proposer(request) }} on {{ request.createdAt | date: 'mediumDate' }} ·
                  {{ request.approvals }} of {{ request.requiredApprovals }} approvals
                </p>
                <p>{{ explain(request) }}</p>
                @if (request.reason) {
                  <p class="comment"><span class="visually-hidden">Reason from</span> {{ request.proposedByYou ? 'You' : nameOf(request.proposerMembershipId) }}: “{{ request.reason }}”</p>
                }

                @if (request.canDecide) {
                  @if (declining() === request.id) {
                    <div class="panel">
                      <mat-form-field appearance="outline" subscriptSizing="dynamic">
                        <mat-label>Tell your co-parent why (optional)</mat-label>
                        <textarea matInput [formControl]="comment" rows="3" [maxlength]="commentMax"></textarea>
                        <mat-hint align="end">{{ comment.value.length }} / {{ commentMax }}</mat-hint>
                      </mat-form-field>
                      <div class="actions">
                        <button mat-flat-button type="button" [disabled]="busy()" (click)="decline(request)">Decline</button>
                        <button mat-button type="button" (click)="cancelDecline(request)">Cancel</button>
                      </div>
                    </div>
                  } @else {
                    <div class="actions">
                      <button mat-flat-button type="button" [disabled]="busy()" (click)="approve(request)">Approve</button>
                      <button mat-stroked-button type="button" [attr.data-decline]="request.id" (click)="startDecline(request)">
                        Decline
                      </button>
                    </div>
                  }
                } @else if (request.proposedByYou) {
                  <div class="actions">
                    <button mat-stroked-button type="button" [disabled]="busy()" (click)="withdraw(request)">Withdraw</button>
                  </div>
                }
              </li>
            }
          </ul>
        }
      } @else if (!error()) {
        <p class="muted">Loading…</p>
      }
    </section>

    <section aria-labelledby="history-heading">
      <h2 id="history-heading">Decided</h2>
      @if (history(); as history) {
        @if (history.length === 0) {
          <p class="muted">No decisions yet.</p>
        } @else {
          <ul class="requests">
            @for (request of history; track request.id) {
              <li class="request">
                <div class="request__head">
                  <p class="request__summary">{{ request.summary }}</p>
                  <span class="chip" [attr.data-status]="request.status">{{ outcome(request) }}</span>
                </div>
                <p class="muted">
                  Proposed by {{ proposer(request) }} · {{ outcome(request) }} {{ request.resolvedAt | date: 'mediumDate' }}
                </p>
                @if (request.reason) {
                  <p class="comment"><span class="visually-hidden">Reason from</span> {{ request.proposedByYou ? 'You' : nameOf(request.proposerMembershipId) }}: “{{ request.reason }}”</p>
                }
                @for (decision of request.decisions; track decision.decidedAt) {
                  @if (decision.comment) {
                    <p class="comment">
                      <span class="visually-hidden">Comment from</span> {{ nameOf(decision.deciderMembershipId) }}: “{{ decision.comment }}”
                    </p>
                  }
                }
              </li>
            }
          </ul>
        }
      }
    </section>
  `,
  styles: `
    :host {
      display: grid;
      gap: var(--space-6);
      align-content: start;
    }
    .intro,
    .muted {
      color: var(--color-text-secondary);
    }
    h2 {
      font-size: var(--font-size-h3);
    }
    .requests {
      display: grid;
      gap: var(--space-3);
      margin: 0;
      padding: 0;
      list-style: none;
    }
    .request {
      display: grid;
      gap: var(--space-2);
      padding: var(--space-4);
      background: var(--color-surface);
      border: 1px solid var(--color-surface-soft);
      border-radius: var(--radius-card);
    }
    .request p {
      margin: 0;
    }
    .request__head {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      justify-content: space-between;
      gap: var(--space-2);
    }
    .request__summary {
      font-weight: 600;
    }
    .chip {
      padding: 0 var(--space-2);
      border: 1px solid var(--color-outline);
      border-radius: 999px;
      font-size: 0.875rem;
    }
    /* Pending looks different from decided by text and border style, not colour alone. */
    .chip--pending {
      border-style: dashed;
      background: var(--color-status-pending-bg);
    }
    .chip[data-status='Approved'] {
      background: var(--color-status-confirmed-bg);
    }
    .chip[data-status='Rejected'] {
      background: var(--color-status-rejected-bg);
    }
    .actions {
      display: flex;
      flex-wrap: wrap;
      gap: var(--space-2);
    }
    button {
      min-height: var(--target-min);
    }
    .panel {
      display: grid;
      gap: var(--space-2);
    }
    mat-form-field {
      width: 100%;
    }
    .comment {
      padding-inline-start: var(--space-3);
      border-inline-start: 2px solid var(--color-outline);
    }
    .alert {
      padding: var(--space-3) var(--space-4);
      border: 1px solid var(--color-danger);
      border-radius: var(--radius-control);
      background: var(--color-status-rejected-bg);
    }
  `,
})
export class ApprovalsPage implements OnInit {
  private readonly api = inject(Api);
  private readonly auth = inject(AuthStore);

  protected readonly commentMax = COMMENT_MAX;
  protected readonly comment = new FormControl('', { nonNullable: true, validators: Validators.maxLength(COMMENT_MAX) });
  protected readonly pending = signal<readonly ChangeRequest[] | null>(null);
  protected readonly history = signal<readonly ChangeRequest[] | null>(null);
  private readonly members = signal<readonly FamilyMember[]>([]);
  private readonly children = signal<readonly Child[]>([]);
  protected readonly declining = signal<string | null>(null);
  protected readonly busy = signal(false);
  protected readonly error = signal<string | null>(null);
  private readonly toasts = inject(Toasts);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly injector = inject(Injector);
  private readonly familyId = computed(() => this.auth.currentFamily()?.id ?? null);

  async ngOnInit(): Promise<void> {
    await this.reload();
  }

  protected proposer(request: ChangeRequest): string {
    return request.proposedByYou ? 'you' : this.nameOf(request.proposerMembershipId);
  }

  /** Members load with the requests, so someone missing has left: they deleted their account (A-12). */
  protected nameOf(membershipId: string): string {
    return this.members().find((m) => m.membershipId === membershipId)?.displayName ?? 'Former parent';
  }

  protected explain(request: ChangeRequest): string {
    switch (request.type) {
      case 'CalendarCreate':
        // A repeating parenting-time request covers every date at once (#239).
        return request.targetType === 'calendar_series'
          ? 'Every date goes on the shared calendar once you both approve. Approving or declining answers them all. Until then they show as pending.'
          : 'It goes on the shared calendar once you both approve. Until then it shows as pending.';
      case 'JointEventCreate':
        return 'A family event both parents attend. It’s confirmed once you both approve.';
      case 'CalendarModify':
        return 'The event stays as it is until you both approve the change.';
      case 'CalendarCancel':
        return 'The event stays on the calendar until you both approve cancelling it.';
    }
    const name = this.children().find((c) => c.id === request.targetId)?.firstName;
    if (request.type === 'ChildCreate') {
      return `${name ?? 'This child'} can start using Parenthesis once you both approve.`;
    }
    return name
      ? `${name}’s current PIN keeps working until you both approve the new one.`
      : 'The current PIN keeps working until you both approve the new one.';
  }

  protected outcome(request: ChangeRequest): string {
    switch (request.status) {
      case 'Approved':
        return 'Approved';
      case 'Rejected':
        return 'Declined';
      case 'Withdrawn':
        return 'Withdrawn';
      default:
        return 'Waiting';
    }
  }

  protected startDecline(request: ChangeRequest): void {
    this.comment.reset();
    this.declining.set(request.id);
  }

  /** Closing the form removes the focused Cancel button: return focus to the Decline button that opened it. */
  protected cancelDecline(request: ChangeRequest): void {
    this.declining.set(null);
    this.focusAfterRender(`[data-decline="${request.id}"]`);
  }

  protected approve(request: ChangeRequest): Promise<void> {
    return this.run((familyId) => this.api.approve(familyId, request.id), `You approved “${request.summary}”.`);
  }

  protected decline(request: ChangeRequest): Promise<void> {
    const comment = this.comment.value.trim() || undefined;
    return this.run((familyId) => this.api.reject(familyId, request.id, comment), `You declined “${request.summary}”.`);
  }

  protected withdraw(request: ChangeRequest): Promise<void> {
    return this.run((familyId) => this.api.withdraw(familyId, request.id), `You withdrew “${request.summary}”.`);
  }

  private async run(action: (familyId: string) => Promise<unknown>, done: string): Promise<void> {
    const familyId = this.familyId();
    if (!familyId) {
      return;
    }
    this.busy.set(true);
    this.error.set(null);
    try {
      await action(familyId);
      this.declining.set(null);
      this.toasts.show(done);
      await this.reload();
    } catch (error) {
      this.error.set(generalMessage(toProblem(error)));
      await this.reload();
    } finally {
      this.busy.set(false);
    }
    // The decided item leaves the list with the focused button. Focus the list's heading, a stable place to continue
    // from; the toast announces the result without taking focus (#226).
    this.focusAfterRender('#waiting-heading');
  }

  private focusAfterRender(selector: string): void {
    afterNextRender(() => this.host.nativeElement.querySelector<HTMLElement>(selector)?.focus(), {
      injector: this.injector,
    });
  }

  private async reload(): Promise<void> {
    const familyId = this.familyId();
    if (!familyId) {
      return;
    }
    try {
      const [pending, history, family, children] = await Promise.all([
        this.api.approvals(familyId),
        this.api.approvals(familyId, 'history'),
        this.api.family(familyId),
        this.api.children(familyId),
      ]);
      this.members.set(family.members);
      this.children.set(children);
      this.pending.set(pending.filter((r) => SHOWN.includes(r.type)));
      this.history.set(history.filter((r) => SHOWN.includes(r.type)));
    } catch (error) {
      this.error.set(generalMessage(toProblem(error)));
    }
  }
}
