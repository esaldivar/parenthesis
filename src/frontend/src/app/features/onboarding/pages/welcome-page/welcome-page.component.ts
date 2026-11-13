import { LocaleService } from '../../../../core/i18n/locale.service';
import { TranslatePipe, translate } from '../../../../core/i18n/translations';
import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  Injector,
  OnInit,
  afterNextRender,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { FormArray, FormControl, NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { Router, RouterLink } from '@angular/router';
import { Api, Child, FamilySummary } from '../../../../core/api/api';
import { generalMessage, toProblem } from '../../../../core/api/problem';
import { AuthStore } from '../../../../core/auth/auth.store';
import { PendingInvitation } from '../../../../core/invitations/pending-invitation';
import { Avatar } from '../../../../shared/components/avatar/avatar';
import { Icon } from '../../../../shared/components/icon/icon';
import { FORM_STYLES } from '../../../auth/form-styles';
import { InviteCoParent } from '../../../family/components/invite-co-parent/invite-co-parent.component';

function deviceTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
}

type Step = 'family' | 'count' | 'children' | 'pending' | 'invite';

const MAX_CHILDREN = 10;
const FIRST_NAME_MAX = 40; // Matches the API (ChildProfile.FirstNameMaxLength).
const STEPS: readonly Step[] = ['family', 'count', 'children', 'invite'];

/**
 * First run for a parent without a family: name the family, say how many children you share, add them, then invite
 * the co-parent (Design Request #1, "Set up your family"). Each child waits for the co-parent's approval (ADR-0006),
 * so the page says so instead of showing them as ready.
 */
@Component({
  selector: 'app-welcome-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    TranslatePipe,
    ReactiveFormsModule,
    RouterLink,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatButtonModule,
    Avatar,
    Icon,
    InviteCoParent,
  ],
  template: `
    <p class="step-count">{{ 'feature.step' | tr }} {{ stepNumber() }} {{ 'feature.of' | tr }} {{ steps.length }}</p>

    @if (error(); as error) {
      <div class="alert" role="alert">{{ error }}</div>
    }

    @switch (step()) {
      @case ('family') {
        <h1 #heading tabindex="-1">{{ 'feature.welcome' | tr }} {{ auth.user()?.displayName }}</h1>
        <p class="lead">
          {{ 'feature.set.up.your.family.space.you.ll' | tr }}
        </p>

        @if (invited) {
          <div class="status">
            <p class="status__text">{{ 'feature.you.have.an.invitation.waiting.if.your' | tr }}</p>
            <a mat-stroked-button routerLink="/invitations/accept">{{ 'feature.go.to.my.invitation' | tr }}</a>
          </div>
        }

        <form [formGroup]="familyForm" (ngSubmit)="createFamily()" novalidate>
          <mat-form-field appearance="outline" subscriptSizing="dynamic">
            <mat-label>{{ 'feature.family.name' | tr }}</mat-label>
            <input matInput formControlName="name" required maxlength="80" />
            <mat-hint>{{ 'feature.for.example.rivera.family.only.your.family' | tr }}</mat-hint>
            @if (familyForm.controls.name.invalid) {
              <mat-error>{{ 'feature.enter.a.family.name' | tr }}</mat-error>
            }
          </mat-form-field>

          <mat-form-field appearance="outline" subscriptSizing="dynamic">
            <mat-label>{{ 'feature.time.zone' | tr }}</mat-label>
            <mat-select formControlName="timeZone" required>
              @for (zone of timeZones; track zone) {
                <mat-option [value]="zone">{{ zone }}</mat-option>
              }
            </mat-select>
            <mat-hint>{{ 'feature.used.to.show.family.events.at.the' | tr }}</mat-hint>
          </mat-form-field>

          <div class="actions">
            <button mat-flat-button type="submit" [disabled]="busy()">{{ busy() ? ('feature.creating' | tr) : ('feature.create.family' | tr) }}</button>
            <button mat-button type="button" (click)="signOut()">{{ 'feature.sign.out' | tr }}</button>
          </div>
        </form>
      }

      @case ('count') {
        <h1 #heading tabindex="-1">{{ 'feature.let.s.set.up.your.family' | tr }}</h1>
        <p class="lead">{{ 'feature.how.many.children.do.you.share.with' | tr }}</p>

        <div class="counter" role="group" aria-labelledby="count-label">
          <span id="count-label" class="visually-hidden">{{ 'feature.number.of.children' | tr }}</span>
          <button
            mat-stroked-button
            class="counter__button"
            type="button"
            aria-label="{{ 'feature.one.fewer.child' | tr }}"
            [disabled]="count() === 0"
            (click)="setCount(count() - 1)"
          >
            <app-icon name="minus" />
          </button>
          <output class="counter__value" aria-live="polite" [attr.aria-label]="count() + ('feature.children.a3a781' | tr)">{{ count() }}</output>
          <button
            mat-stroked-button
            class="counter__button"
            type="button"
            aria-label="{{ 'feature.one.more.child' | tr }}"
            [disabled]="count() === maxChildren"
            (click)="setCount(count() + 1)"
          >
            <app-icon name="plus" />
          </button>
        </div>
        <p class="hint">{{ 'feature.you.can.add.more.children.later' | tr }}</p>

        <div class="actions">
          <button mat-flat-button type="button" (click)="confirmCount()">{{ 'feature.continue' | tr }}</button>
        </div>
      }

      @case ('children') {
        <h1 #heading tabindex="-1">{{ 'feature.add.your.children' | tr }}</h1>
        <p class="lead">
          {{ 'feature.add.each.child.you.share.with.your' | tr }}
        </p>

        <form [formGroup]="childrenForm" (ngSubmit)="addChildren()" novalidate>
          @for (control of names.controls; track control; let i = $index) {
            <mat-form-field appearance="outline" subscriptSizing="dynamic">
              <mat-label>{{ 'feature.child' | tr }} {{ i + 1 }}{{ 'feature.s.first.name' | tr }}</mat-label>
              <input matInput [formControl]="control" required [attr.maxlength]="firstNameMax" autocomplete="off" />
              @if (control.invalid) {
                <mat-error>{{ 'feature.enter.a.first.name.of.up.to' | tr }} {{ firstNameMax }} {{ 'feature.characters' | tr }}</mat-error>
              }
            </mat-form-field>
          }
          <p class="hint">{{ 'feature.first.names.only.parenthesis.doesn.t.ask' | tr }}</p>
          <div class="actions">
            <button mat-flat-button type="submit" [disabled]="busy()">{{ busy() ? ('feature.adding' | tr) : ('feature.continue' | tr) }}</button>
          </div>
        </form>
      }

      @case ('pending') {
        <h1 #heading tabindex="-1">{{ 'feature.children.pending.approval' | tr }}</h1>
        <p class="lead">
          {{ 'feature.your.co.parent.needs.to.approve.the' | tr }}
        </p>

        <ul class="children" aria-label="{{ 'feature.children.you.added' | tr }}">
          @for (child of added(); track child.id) {
            <li class="child">
              <app-avatar [name]="child.firstName" kind="child" [size]="40" />
              <span class="child__name">{{ child.firstName }}</span>
              <span class="chip">{{ 'feature.waiting.for.approval' | tr }}</span>
            </li>
          }
        </ul>

        <div class="actions">
          <button mat-flat-button type="button" (click)="go('invite')">{{ 'feature.continue' | tr }}</button>
        </div>
      }

      @case ('invite') {
        <h1 #heading tabindex="-1">{{ 'feature.invite.your.co.parent' | tr }}</h1>
        <p class="lead">
          {{ 'feature.enter.their.email.to.invite.them.to' | tr }}
          @if (added().length > 0) {
            {{ 'feature.they.ll.approve.the.children.you.added' | tr }}
          }
        </p>

        @if (family(); as family) {
          <app-invite-co-parent [familyId]="family.id" />
        }

        <div class="links">
          <a routerLink="/">{{ 'feature.continue.to.parenthesis' | tr }}</a>
        </div>
      }
    }
  `,
  styles: [
    FORM_STYLES,
    `
      .step-count {
        margin: 0 0 var(--space-2);
        color: var(--color-text-secondary);
        font-size: 0.875rem;
      }
      .status {
        display: grid;
        gap: var(--space-3);
      }
      .status__text {
        margin: 0;
      }
      .counter {
        display: flex;
        align-items: center;
        justify-content: center;
        gap: var(--space-6);
        margin: var(--space-4) 0;
      }
      .counter__button {
        width: 56px;
        min-width: 56px;
        height: 56px;
        border-radius: 50%;
        padding: 0;
      }
      .counter__value {
        min-width: 3ch;
        text-align: center;
        font-size: var(--font-size-h1);
        font-weight: 700;
      }
      .hint {
        color: var(--color-text-secondary);
        text-align: center;
        margin: 0 0 var(--space-4);
      }
      form .hint {
        text-align: start;
      }
      .children {
        list-style: none;
        padding: 0;
        margin: 0 0 var(--space-6);
        display: grid;
        gap: var(--space-2);
      }
      .child {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: var(--space-3);
        padding: var(--space-3);
        border: 1px solid var(--color-outline);
        border-radius: var(--radius-card);
        background: var(--color-surface);
      }
      .child__name {
        font-weight: 600;
        flex: 1;
        overflow-wrap: anywhere;
      }
      .chip {
        padding: var(--space-1) var(--space-3);
        border-radius: 999px;
        background: var(--color-status-pending-bg);
        color: var(--color-text);
        font-size: 0.875rem;
      }
    `,
  ],
})
export class WelcomePage implements OnInit {
  protected readonly auth = inject(AuthStore);
  private readonly api = inject(Api);
  private readonly locale = inject(LocaleService);
  private readonly router = inject(Router);
  private readonly injector = inject(Injector);
  private readonly fb = inject(NonNullableFormBuilder);

  private readonly heading = viewChild<ElementRef<HTMLElement>>('heading');

  protected readonly steps = STEPS;
  protected readonly maxChildren = MAX_CHILDREN;
  protected readonly firstNameMax = FIRST_NAME_MAX;
  protected readonly invited = inject(PendingInvitation).peek() !== null;

  private readonly deviceZone = deviceTimeZone();
  protected readonly timeZones: readonly string[] = Array.from(
    new Set([this.deviceZone, ...(Intl.supportedValuesOf?.('timeZone') ?? []), 'UTC']),
  );
  protected readonly familyForm = this.fb.group({
    name: ['', [Validators.required, Validators.maxLength(80)]],
    timeZone: [this.deviceZone, Validators.required],
  });
  protected readonly names = new FormArray<FormControl<string>>([]);
  protected readonly childrenForm = this.fb.group({ names: this.names });

  protected readonly step = signal<Step>('family');
  protected readonly count = signal(1);
  protected readonly family = signal<FamilySummary | null>(null);
  protected readonly added = signal<readonly Child[]>([]);
  protected readonly busy = signal(false);
  protected readonly error = signal<string | null>(null);

  protected stepNumber(): number {
    const step = this.step();
    // "Pending approval" is the end of adding children, not a separate step.
    return STEPS.indexOf(step === 'pending' ? 'children' : step) + 1;
  }

  ngOnInit(): void {
    void this.initialize();
  }

  private async initialize(): Promise<void> {
    // Someone who already has a family has finished this page (reloading it must not create a second family).
    const families = this.auth.families() ?? (await this.auth.loadFamilies().catch(() => []));
    if (families.length > 0) {
      await this.router.navigateByUrl('/');
    }
  }

  protected go(step: Step): void {
    this.error.set(null);
    this.step.set(step);
    // Move focus to the new step's heading so screen readers announce it.
    afterNextRender(() => this.heading()?.nativeElement.focus(), { injector: this.injector });
  }

  protected async createFamily(): Promise<void> {
    if (this.familyForm.invalid) {
      this.familyForm.markAllAsTouched();
      return;
    }
    this.busy.set(true);
    this.error.set(null);
    try {
      const { name, timeZone } = this.familyForm.getRawValue();
      this.family.set(await this.auth.createFamily(name.trim(), timeZone));
      this.go('count');
    } catch (error) {
      this.error.set(generalMessage(toProblem(error)));
    } finally {
      this.busy.set(false);
    }
  }

  protected setCount(value: number): void {
    this.count.set(Math.min(MAX_CHILDREN, Math.max(0, value)));
  }

  protected confirmCount(): void {
    if (this.count() === 0) {
      this.go('invite');
      return;
    }
    this.names.clear();
    for (let i = 0; i < this.count(); i++) {
      this.names.push(this.fb.control('', [Validators.required, Validators.maxLength(FIRST_NAME_MAX), Validators.pattern(/\S/)]));
    }
    this.go('children');
  }

  /** Adds the children one by one. If one fails, the ones already added stay added and only the rest remain. */
  protected async addChildren(): Promise<void> {
    const family = this.family();
    if (!family || this.names.invalid) {
      this.names.markAllAsTouched();
      return;
    }
    this.busy.set(true);
    this.error.set(null);
    try {
      while (this.names.length > 0) {
        const child = await this.api.addChild(family.id, this.names.at(0).value.trim());
        this.added.update((children) => [...children, child]);
        this.names.removeAt(0);
      }
      this.go('pending');
    } catch (error) {
      const problem = toProblem(error);
      const done = this.added().length;
      this.error.set(
        (done > 0 ? translate(done === 1 ? 'welcome.childrenAddedOne' : 'welcome.childrenAddedMany', this.locale.locale(), { count: done }) + ' ' : '') +
          (problem.errors['firstName']?.join(' ') ?? generalMessage(problem)),
      );
    } finally {
      this.busy.set(false);
    }
  }

  protected async signOut(): Promise<void> {
    await this.auth.signOut();
    await this.router.navigateByUrl('/sign-in');
  }
}
