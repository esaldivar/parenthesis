import { LocaleService } from '../../core/i18n/locale.service';
import { AppDatePipe } from '../../core/i18n/locale-formatting';
import { TranslatePipe, translate } from '../../core/i18n/translations';
import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  Injector,
  OnInit,
  afterNextRender,
  computed,
  effect,
  inject,
  input,
  signal,
  viewChildren,
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
  imports: [TranslatePipe, AppDatePipe, ReactiveFormsModule, MatButtonModule, MatFormFieldModule, MatInputModule],
  template: `
    <h1>{{ 'feature.approvals' | tr }}</h1>
    <p class="intro">{{ 'feature.some.changes.need.both.parents.to.agree' | tr }}</p>

    @if (error(); as error) {
      <p class="alert" role="alert">{{ error }}</p>
    }

    <section aria-labelledby="waiting-heading">
      <h2 id="waiting-heading" tabindex="-1">{{ 'feature.waiting' | tr }}</h2>
      @if (pending(); as pending) {
        @if (pending.length === 0) {
          <p class="muted">{{ 'feature.nothing.is.waiting.for.either.of.you' | tr }}</p>
        } @else {
          <ul class="requests">
            @for (request of pending; track request.id) {
              <li #requestRow class="request" tabindex="-1" [attr.data-request]="request.id">
                <div class="request__head">
                  <p class="request__summary">{{ request.summary }}</p>
                  <span class="chip chip--pending">{{ request.canDecide ? ('feature.waiting.for.you' | tr) : ('feature.waiting.for.your.co.parent' | tr) }}</span>
                </div>
                <p class="muted">
                  {{ 'feature.proposed.by' | tr }} {{ proposer(request) }} {{ 'feature.on' | tr }} {{ request.createdAt | appDate: 'mediumDate' }} ·
                  {{ request.approvals }} {{ 'feature.of' | tr }} {{ request.requiredApprovals }} {{ 'feature.approvals.4481c8' | tr }}
                </p>
                <p>{{ explain(request) }}</p>
                @if (request.reason) {
                  <p class="comment"><span class="visually-hidden">{{ 'feature.reason.from' | tr }}</span> {{ request.proposedByYou ? ('feature.you.08b041' | tr) : nameOf(request.proposerMembershipId) }}: “{{ request.reason }}”</p>
                }

                @if (request.canDecide) {
                  @if (declining() === request.id) {
                    <div class="panel">
                      <mat-form-field appearance="outline" subscriptSizing="dynamic">
                        <mat-label>{{ 'feature.tell.your.co.parent.why.optional' | tr }}</mat-label>
                        <textarea matInput [formControl]="comment" rows="3" [maxlength]="commentMax"></textarea>
                        <mat-hint align="end">{{ comment.value.length }} / {{ commentMax }}</mat-hint>
                      </mat-form-field>
                      <div class="actions">
                        <button mat-flat-button type="button" [attr.data-decline-submit]="request.id" [disabled]="busy()" (click)="decline(request)">
                          {{ 'feature.decline.a2d285' | tr }}
                        </button>
                        <button mat-button type="button" (click)="cancelDecline(request)">{{ 'feature.cancel' | tr }}</button>
                      </div>
                    </div>
                  } @else {
                    <div class="actions">
                      <button mat-flat-button type="button" [attr.data-approve]="request.id" [disabled]="busy()" (click)="approve(request)">
                        {{ 'feature.approve' | tr }}
                      </button>
                      <button mat-stroked-button type="button" [attr.data-decline]="request.id" (click)="startDecline(request)">
                        {{ 'feature.decline.a2d285' | tr }}
                      </button>
                    </div>
                  }
                } @else if (request.proposedByYou) {
                  <div class="actions">
                    <button mat-stroked-button type="button" [attr.data-withdraw]="request.id" [disabled]="busy()" (click)="withdraw(request)">
                      {{ 'feature.withdraw' | tr }}
                    </button>
                  </div>
                }
              </li>
            }
          </ul>
        }
      } @else if (!error()) {
        <p class="muted">{{ 'feature.loading' | tr }}</p>
      }
    </section>

    <section aria-labelledby="history-heading">
      <h2 id="history-heading">{{ 'feature.decided' | tr }}</h2>
      @if (history(); as history) {
        @if (history.length === 0) {
          <p class="muted">{{ 'feature.no.decisions.yet' | tr }}</p>
        } @else {
          <ul class="requests">
            @for (request of history; track request.id) {
              <li #requestRow class="request" tabindex="-1" [attr.data-request]="request.id">
                <div class="request__head">
                  <p class="request__summary">{{ request.summary }}</p>
                  <span class="chip" [attr.data-status]="request.status">{{ outcome(request) }}</span>
                </div>
                <p class="muted">
                  {{ 'feature.proposed.by' | tr }} {{ proposer(request) }} · {{ outcome(request) }} {{ request.resolvedAt | appDate: 'mediumDate' }}
                </p>
                @if (request.reason) {
                  <p class="comment"><span class="visually-hidden">{{ 'feature.reason.from' | tr }}</span> {{ request.proposedByYou ? ('feature.you.08b041' | tr) : nameOf(request.proposerMembershipId) }}: “{{ request.reason }}”</p>
                }
                @for (decision of request.decisions; track decision.decidedAt) {
                  @if (decision.comment) {
                    <p class="comment">
                      <span class="visually-hidden">{{ 'feature.comment.from' | tr }}</span> {{ nameOf(decision.deciderMembershipId) }}: “{{ decision.comment }}”
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
      border: 1px solid var(--color-divider);
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
  private readonly copyLocale = inject(LocaleService);
  private readonly api = inject(Api);
  private readonly auth = inject(AuthStore);

  readonly request = input<string>();
  private readonly requestRows = viewChildren<ElementRef<HTMLElement>>('requestRow');

  constructor() {
    effect(() => {
      const request = this.request();
      if (!request) return;
      const row = this.requestRows().find(({ nativeElement }) => nativeElement.dataset['request'] === request);
      if (row) afterNextRender(() => row.nativeElement.focus(), { injector: this.injector });
    });
  }

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

  ngOnInit(): void {
    void this.initialize();
  }

  private async initialize(): Promise<void> {
    await this.reload();
  }

  protected proposer(request: ChangeRequest): string {
    return request.proposedByYou ? 'you' : this.nameOf(request.proposerMembershipId);
  }

  /** Members load with the requests, so someone missing has left: they deleted their account (A-12). */
  protected nameOf(membershipId: string): string {
    return this.members().find((m) => m.membershipId === membershipId)?.displayName ?? translate('feedback.former.parent', this.copyLocale.locale());
  }

  protected explain(request: ChangeRequest): string {
    switch (request.type) {
      case 'CalendarCreate':
        // A repeating parenting-time request covers every date at once (#239).
        return request.targetType === 'calendar_series'
          ? translate('approvals.series.help', this.copyLocale.locale())
          : translate('approvals.event.help', this.copyLocale.locale());
      case 'JointEventCreate':
        return translate('approvals.joint.help', this.copyLocale.locale());
      case 'CalendarModify':
        return translate('approvals.edit.help', this.copyLocale.locale());
      case 'CalendarCancel':
        return translate('approvals.cancel.help', this.copyLocale.locale());
    }
    const name = this.children().find((c) => c.id === request.targetId)?.firstName;
    if (request.type === 'ChildCreate') {
      return name
        ? translate('approvals.child.help', this.copyLocale.locale(), { name })
        : translate('approvals.child.helpUnnamed', this.copyLocale.locale());
    }
    return name
      ? translate('approvals.pin.childHelp', this.copyLocale.locale(), { name })
      : translate('approvals.pin.help', this.copyLocale.locale());
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
    return this.run((familyId) => this.api.approve(familyId, request.id), translate('approvals.approved', this.copyLocale.locale(), { summary: request.summary }), `[data-approve="${request.id}"]`);
  }

  protected decline(request: ChangeRequest): Promise<void> {
    const comment = this.comment.value.trim() || undefined;
    return this.run(
      (familyId) => this.api.reject(familyId, request.id, comment),
      translate('approvals.declined', this.copyLocale.locale(), { summary: request.summary }),
      `[data-decline-submit="${request.id}"]`,
    );
  }

  protected withdraw(request: ChangeRequest): Promise<void> {
    return this.run((familyId) => this.api.withdraw(familyId, request.id), translate('approvals.withdrawn', this.copyLocale.locale(), { summary: request.summary }), `[data-withdraw="${request.id}"]`);
  }

  /** `retry` is the button that started the action: after a failure, focus returns there so the person can try again. */
  private async run(action: (familyId: string) => Promise<unknown>, done: string, retry: string): Promise<void> {
    const familyId = this.familyId();
    if (!familyId) {
      return;
    }
    this.busy.set(true);
    this.error.set(null);
    let failed = false;
    try {
      await action(familyId);
      this.declining.set(null);
      this.toasts.show(done);
      await this.reload();
    } catch (error) {
      failed = true;
      this.error.set(generalMessage(toProblem(error)));
      await this.reload();
    } finally {
      this.busy.set(false);
    }
    // The decided item leaves the list with the focused button. Focus the list's heading, a stable place to continue
    // from; the toast announces the result without taking focus (#226). After a failure the item usually stays, so
    // focus goes back to its button (the alert announces the error); if it's gone, to the heading.
    this.focusAfterRender(...(failed ? [retry, '#waiting-heading'] : ['#waiting-heading']));
  }

  /** Focuses the first of the selectors that matches once the page has rendered. */
  private focusAfterRender(...selectors: string[]): void {
    afterNextRender(
      () => {
        const host = this.host.nativeElement;
        selectors.map((s) => host.querySelector<HTMLElement>(s)).find((el) => el)?.focus();
      },
      { injector: this.injector },
    );
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
