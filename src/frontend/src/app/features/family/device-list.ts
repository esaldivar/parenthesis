import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, OnInit, inject, input, signal } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { Api, Child, Device } from '../../core/api/api';
import { generalMessage, toProblem } from '../../core/api/problem';
import { AuthStore } from '../../core/auth/auth.store';
import { Toasts } from '../../shared/toast/toasts';

/**
 * The family's devices (ADR-0006): household devices that show the profile picker, and children's paired tablets.
 * Either parent can remove any device at once; anyone signed in on it is signed out on its next request.
 */
@Component({
  selector: 'app-device-list',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DatePipe, ReactiveFormsModule, MatButtonModule, MatFormFieldModule, MatInputModule],
  template: `
    @if (error(); as error) {
      <p class="alert" role="alert">{{ error }}</p>
    }

    @if (!auth.device()) {
      <form class="panel" [formGroup]="form" (ngSubmit)="register()" novalidate>
        <p>
          Use this device for “Who’s using Parenthesis?”, so your children can sign in here with their PIN. You’ll
          still need your password to get back into your profile.
        </p>
        <mat-form-field appearance="outline" subscriptSizing="dynamic">
          <mat-label>Name this device</mat-label>
          <input matInput formControlName="name" autocomplete="off" maxlength="60" required />
          <mat-hint>Like “Kitchen iPad” or “Dad’s phone”</mat-hint>
          @if (form.controls.name.hasError('required') || form.controls.name.hasError('pattern')) {
            <mat-error>Give this device a name.</mat-error>
          }
        </mat-form-field>
        <div class="actions">
          <button mat-flat-button type="submit" [disabled]="busy()">Use this device</button>
        </div>
      </form>
    }

    @if (devices(); as devices) {
      @if (devices.length === 0) {
        <p class="muted">No devices yet.</p>
      } @else {
        <ul class="devices">
          @for (device of devices; track device.id) {
            <li class="device">
              <div>
                <p class="device__name">{{ device.name }}</p>
                <p class="muted">{{ kind(device) }} · Last used {{ device.lastSeenAt | date: 'mediumDate' }}</p>
              </div>
              @if (confirming() === device.id) {
                <div class="panel">
                  <p>Remove {{ device.name }}? Anyone using it is signed out, and it stops showing your family’s profiles.</p>
                  <div class="actions">
                    <button mat-flat-button type="button" [disabled]="busy()" (click)="remove(device)">Remove device</button>
                    <button mat-button type="button" (click)="confirming.set(null)">Cancel</button>
                  </div>
                </div>
              } @else {
                <div class="actions">
                  <button mat-stroked-button type="button" (click)="confirming.set(device.id)" [attr.aria-label]="'Remove ' + device.name">
                    Remove
                  </button>
                </div>
              }
            </li>
          }
        </ul>
      }
    } @else if (!error()) {
      <p class="muted">Loading…</p>
    }
  `,
  styles: `
    :host {
      display: grid;
      gap: var(--space-3);
    }
    .devices {
      display: grid;
      gap: var(--space-3);
      margin: 0;
      padding: 0;
      list-style: none;
    }
    .device {
      display: grid;
      gap: var(--space-2);
    }
    .device + .device {
      padding-top: var(--space-3);
      border-top: 1px solid var(--color-surface-soft);
    }
    p {
      margin: 0;
    }
    .device__name {
      font-weight: 600;
      overflow-wrap: anywhere;
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
      padding: var(--space-3);
      border: 1px solid var(--color-surface-soft);
      border-radius: var(--radius-control);
    }
    mat-form-field {
      width: 100%;
    }
    .muted {
      color: var(--color-text-secondary);
    }
    .alert {
      padding: var(--space-3) var(--space-4);
      border: 1px solid var(--color-danger);
      border-radius: var(--radius-control);
      background: var(--color-status-rejected-bg);
    }
  `,
})
export class DeviceList implements OnInit {
  private readonly api = inject(Api);
  protected readonly auth = inject(AuthStore);

  readonly familyId = input.required<string>();

  protected readonly devices = signal<readonly Device[] | null>(null);
  private readonly children = signal<readonly Child[]>([]);
  protected readonly confirming = signal<string | null>(null);
  protected readonly busy = signal(false);
  protected readonly error = signal<string | null>(null);
  private readonly toasts = inject(Toasts);
  protected readonly form = inject(NonNullableFormBuilder).group({
    name: ['', [Validators.required, Validators.maxLength(60), Validators.pattern(/\S/)]],
  });

  async ngOnInit(): Promise<void> {
    await this.reload();
  }

  protected kind(device: Device): string {
    if (device.kind === 'Household') {
      return 'Shows the profile picker';
    }
    const child = this.children().find((c) => c.id === device.childProfileId);
    return child ? `${child.firstName}’s own device` : 'A child’s own device';
  }

  protected async register(): Promise<void> {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    await this.run(async () => {
      const device = await this.api.registerHouseholdDevice(this.familyId(), this.form.getRawValue().name.trim());
      await this.auth.loadDevice();
      this.form.reset();
      this.toasts.show(`${device.name} now shows “Who’s using Parenthesis?” when nobody is signed in.`);
    });
  }

  protected async remove(device: Device): Promise<void> {
    await this.run(async () => {
      await this.api.removeDevice(this.familyId(), device.id);
      this.confirming.set(null);
      // If it was this browser, its picker is gone too.
      await this.auth.loadDevice();
      this.toasts.show(`${device.name} was removed.`);
    });
  }

  private async run(action: () => Promise<void>): Promise<void> {
    this.busy.set(true);
    this.error.set(null);
    try {
      await action();
      await this.reload();
    } catch (error) {
      const problem = toProblem(error);
      this.error.set(problem.errors['name']?.join(' ') ?? generalMessage(problem));
    } finally {
      this.busy.set(false);
    }
  }

  private async reload(): Promise<void> {
    try {
      const [devices, children] = await Promise.all([this.api.devices(this.familyId()), this.api.children(this.familyId())]);
      this.children.set(children);
      this.devices.set(devices);
    } catch (error) {
      this.error.set(generalMessage(toProblem(error)));
    }
  }
}
