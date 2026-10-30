import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, OnInit, inject, input, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { Router, RouterLink } from '@angular/router';
import { Api, Child, Device } from '../../core/api/api';
import { generalMessage, toProblem } from '../../core/api/problem';
import { AuthStore } from '../../core/auth/auth.store';
import { Toasts } from '../../shared/toast/toasts';

/**
 * The family's devices (ADR-0006, #153): shared family devices that show the profile picker for a fixed 30 days, and
 * children's paired tablets. Either parent can remove any device at once: every parent and child session on it ends
 * on its next request, and its picker is gone until a parent signs in there and sets it up again. A removal is only
 * reported once the server confirms it. The browser in use is marked, and removing it is "Stop sharing this device":
 * Sign out keeps a shared device's picker, so this is how a parent ends sharing on the device in front of them.
 */
@Component({
  selector: 'app-device-list',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DatePipe, RouterLink, MatButtonModule],
  template: `
    @if (error(); as error) {
      <p class="alert" role="alert">{{ error }}</p>
    }

    @if (!(auth.device()?.deviceKind === 'Household' && auth.device()?.isYours)) {
      <div class="panel">
        <p>
          Is this a shared family device, like a kitchen tablet? Set it up so your family can choose their profile here.
          It lasts 30 days. Don’t do this on a public or borrowed device.
        </p>
        <div class="actions">
          <a mat-stroked-button routerLink="/shared-device/setup" [queryParams]="{ returnUrl: '/settings' }">Set up this device for sharing</a>
        </div>
      </div>
    }

    @if (devices(); as devices) {
      @if (devices.length === 0) {
        <p class="muted">No devices yet.</p>
      } @else {
        <ul class="devices">
          @for (device of devices; track device.id) {
            <li class="device">
              <div>
                <p class="device__name">
                  {{ device.name }}
                  @if (device.isThisDevice) {
                    <span class="this">(this device)</span>
                  }
                </p>
                <p class="muted">{{ kind(device) }} · Last used {{ device.lastSeenAt | date: 'mediumDate' }}</p>
                @if (device.expiresAt) {
                  <p class="muted">Sharing ends {{ device.expiresAt | date: 'mediumDate' }}</p>
                }
              </div>
              @if (confirming() === device.id) {
                <div class="panel">
                  @if (stopsSharing(device)) {
                    <p>
                      Stop sharing this device? Everyone using it, including you, is signed out at once, and “Who’s using
                      Parenthesis?” goes away here until a parent signs in and sets it up again.
                    </p>
                    <div class="actions">
                      <button mat-flat-button type="button" [disabled]="busy()" (click)="remove(device)">Stop sharing</button>
                      <button mat-button type="button" (click)="confirming.set(null)">Cancel</button>
                    </div>
                  } @else {
                    <p>
                      Remove {{ device.name }}? Everyone using it is signed out at once, and it stops showing your family’s
                      profiles until a parent signs in there and sets it up again.
                    </p>
                    <div class="actions">
                      <button mat-flat-button type="button" [disabled]="busy()" (click)="remove(device)">Remove device</button>
                      <button mat-button type="button" (click)="confirming.set(null)">Cancel</button>
                    </div>
                  }
                </div>
              } @else {
                <div class="actions">
                  @if (stopsSharing(device)) {
                    <!-- Switching lives here and in the account menu, not as a top-bar button (#372). -->
                    <button mat-stroked-button type="button" (click)="switchProfile()">Switch profile</button>
                    <button mat-stroked-button type="button" (click)="confirming.set(device.id)">Stop sharing this device</button>
                  } @else {
                    <button mat-stroked-button type="button" (click)="confirming.set(device.id)" [attr.aria-label]="'Remove ' + device.name">
                      Remove
                    </button>
                  }
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
      border-top: 1px solid var(--color-divider);
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
      border: 1px solid var(--color-divider);
      border-radius: var(--radius-control);
    }
    .this {
      font-weight: 400;
      color: var(--color-text-secondary);
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
  private readonly router = inject(Router);

  ngOnInit(): void {
    void this.initialize();
  }

  private async initialize(): Promise<void> {
    await this.reload();
  }

  protected kind(device: Device): string {
    if (device.kind === 'Household') {
      return 'Shared family device';
    }
    const child = this.children().find((c) => c.id === device.childProfileId);
    return child ? `${child.firstName}’s own device` : 'A child’s own device';
  }

  /**
   * Only the shared family device this browser is using gets "Stop sharing this device". A child's paired tablet a parent is
   * signed in on keeps the ordinary Remove: it isn't shared, and setting up sharing wouldn't bring it back.
   */
  protected stopsSharing(device: Device): boolean {
    return device.isThisDevice === true && device.kind === 'Household';
  }

  protected async remove(device: Device): Promise<void> {
    if (this.stopsSharing(device)) {
      await this.stopSharing(device);
      return;
    }
    await this.run(async () => {
      await this.api.removeDevice(this.familyId(), device.id);
      this.confirming.set(null);
      await this.auth.loadDevice();
      this.toasts.show(`${device.name} was removed.`);
    });
  }

  /** Ends this parent's session and keeps the picker, as the account menu's Switch profile does (#153, #372). */
  protected async switchProfile(): Promise<void> {
    await this.auth.switchProfile();
    await this.router.navigateByUrl(this.auth.device() ? '/profiles' : '/sign-in', { replaceUrl: true });
  }

  /** The server ends every session on this device, ours included, so sign out here and start from sign-in. */
  private async stopSharing(device: Device): Promise<void> {
    this.busy.set(true);
    this.error.set(null);
    try {
      await this.api.removeDevice(this.familyId(), device.id);
    } catch (error) {
      this.error.set(generalMessage(toProblem(error)));
      this.busy.set(false);
      return;
    }
    await this.auth.signOut().catch(() => undefined);
    this.toasts.show('This device is no longer shared.');
    await this.router.navigateByUrl('/sign-in', { replaceUrl: true });
  }

  private async run(action: () => Promise<void>): Promise<void> {
    this.busy.set(true);
    this.error.set(null);
    try {
      await action();
      await this.reload();
    } catch (error) {
      const problem = toProblem(error);
      this.error.set(generalMessage(problem));
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
