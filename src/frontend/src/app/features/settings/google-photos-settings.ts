import { TranslatePipe } from '../../core/i18n/translations';
import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  OnInit,
  inject,
  input,
  signal,
  viewChild,
} from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { Api, GooglePhotosStatus } from '../../core/api/api';
import { generalMessage, toProblem } from '../../core/api/problem';
import { Icon } from '../../shared/icon/icon';
import { Toasts } from '../../shared/toast/toasts';
import { OPEN_EXTERNAL } from './google-calendar-settings';

const photos = (n: number) => (n === 1 ? '1 photo' : `${n} photos`);

/**
 * A parent's own Google Photos connection (#404), for exporting Family Memories photos one way into albums the app
 * makes. What's sent is said before Google's consent page. Connecting or disconnecting changes nothing for the
 * co-parent. Separate from Google Calendar: disconnecting one never touches the other.
 */
@Component({
  selector: 'app-google-photos-settings',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [TranslatePipe, MatButtonModule, Icon],
  template: `
    @if (error(); as error) {
      <p class="alert" role="alert">{{ error }}</p>
    }

    @if (status(); as status) {
      @if (!status.available) {
        <p class="muted">{{ 'feature.exporting.to.google.photos.isn.t.available' | tr }}</p>
      } @else {
        @switch (status.state) {
          @case ('NotConnected') {
            <p>
              {{ 'feature.save.copies.of.family.memories.photos.to' | tr }}
            </p>
            <ul class="facts">
              <li>{{ 'feature.only.photos.you.choose.are.sent.as' | tr }}</li>
              <li>
                {{ 'feature.parenthesis.can.add.photos.and.make.albums.9b1c6e' | tr }}
              </li>
              <li>
                {{ 'feature.copies.use.your.google.storage.and.stay' | tr }}
              </li>
              <li>{{ 'feature.connecting.changes.nothing.for' | tr }} {{ coParent() ?? 'your co-parent' }}.</li>
            </ul>
          }
          @case ('Connected') {
            <p class="state" role="status">
              <strong>{{ 'feature.connected' | tr }}</strong>
              @if (status.exportedCount > 0) {
                {{ exported(status) }}
              } @else {
                {{ 'feature.export.photos.from.any.family.memory' | tr }}
              }
              @if (status.waitingCount > 0) {
                {{ photos(status.waitingCount) }} {{ 'feature.waiting.to.export' | tr }}
              }
            </p>
          }
          @case ('NeedsReconnect') {
            <p class="alert" role="alert">
              <strong>{{ 'feature.google.photos.needs.you.to.reconnect' | tr }}</strong> {{ reconnect(status) }}
            </p>
          }
        }

        @if (confirming()) {
          <div class="panel" role="group" aria-labelledby="photos-disconnect-heading">
            <h3 id="photos-disconnect-heading" #confirmHeading tabindex="-1">
              {{ 'feature.disconnect.google.photos' | tr }}
            </h3>
            <p>
              {{ 'feature.albums.and.photos.already.in.your.google' | tr }}
              @if (status.waitingCount > 0) {
                {{ photos(status.waitingCount) }} {{ 'feature.waiting.to.export.won.t.be.sent' | tr }}
              }
            </p>
            <p class="muted">
              {{ 'feature.parenthesis.can.t.see.your.google.photos' | tr }}
            </p>
            <div class="actions">
              <button mat-flat-button type="button" [disabled]="busy()" (click)="disconnect()">
                {{ busy() ? ('feature.disconnecting' | tr) : ('feature.disconnect.acfc5b' | tr) }}
              </button>
              <button mat-button type="button" [disabled]="busy()" (click)="cancelDisconnect()">
                {{ 'feature.cancel' | tr }}
              </button>
            </div>
          </div>
        } @else {
          <div class="actions">
            @if (status.state !== 'Connected') {
              <button mat-flat-button type="button" [disabled]="busy()" (click)="connect()">
                <app-icon name="cloud-upload" [size]="18" />
                {{
                  busy()
                    ? ('feature.opening.google' | tr)
                    : status.state === 'NeedsReconnect'
                      ? ('feature.reconnect.google.photos' | tr)
                      : ('feature.connect.google.photos' | tr)
                }}
              </button>
            }
            @if (status.state !== 'NotConnected') {
              <button
                mat-stroked-button
                type="button"
                id="photos-disconnect"
                [disabled]="busy()"
                (click)="askToDisconnect()"
              >
                {{ 'feature.disconnect' | tr }}
              </button>
            }
          </div>
        }
      }
    } @else if (!error()) {
      <p class="muted">{{ 'feature.loading' | tr }}</p>
    }
  `,
  styles: `
    :host {
      display: grid;
      gap: var(--space-3);
    }
    p,
    h3 {
      margin: 0;
    }
    h3 {
      font-size: var(--font-size-body);
    }
    .facts {
      margin: 0;
      padding-inline-start: var(--space-4);
      display: grid;
      gap: var(--space-1);
      color: var(--color-text-secondary);
    }
    .actions {
      display: flex;
      flex-wrap: wrap;
      gap: var(--space-2);
    }
    button {
      min-height: var(--target-min);
    }
    button app-icon {
      margin-inline-end: var(--space-1);
      vertical-align: middle;
    }
    .panel {
      display: grid;
      gap: var(--space-2);
      padding: var(--space-3);
      border: 1px solid var(--color-divider);
      border-radius: var(--radius-control);
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
export class GooglePhotosSettings implements OnInit {
  private readonly api = inject(Api);
  private readonly toasts = inject(Toasts);
  private readonly openExternal = inject(OPEN_EXTERNAL);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly confirmHeading = viewChild<ElementRef<HTMLElement>>('confirmHeading');

  readonly familyId = input.required<string>();
  /** The other parent's name, or null while there isn't one. */
  readonly coParent = input<string | null>(null);

  protected readonly status = signal<GooglePhotosStatus | null>(null);
  protected readonly busy = signal(false);
  protected readonly confirming = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly photos = photos;

  ngOnInit(): void {
    void this.initialize();
  }

  private async initialize(): Promise<void> {
    try {
      this.status.set(await this.api.googlePhotos(this.familyId()));
    } catch (error) {
      this.error.set(generalMessage(toProblem(error)));
    }
  }

  /** "18 photos exported to 3 albums." */
  protected exported(status: GooglePhotosStatus): string {
    const albums = status.albumCount === 1 ? '1 album' : `${status.albumCount} albums`;
    return `${photos(status.exportedCount)} exported to ${albums}.`;
  }

  /** Why, and what happens to photos that were waiting. */
  protected reconnect(status: GooglePhotosStatus): string {
    const n = status.waitingCount;
    return n === 0
      ? 'Access was removed in your Google account.'
      : n === 1
        ? 'Access was removed in your Google account, so 1 photo is waiting. It’ll wait until it expires.'
        : `Access was removed in your Google account, so ${n} photos are waiting. They’ll wait until they expire.`;
  }

  protected async connect(): Promise<void> {
    this.busy.set(true);
    this.error.set(null);
    try {
      const { url } = await this.api.googlePhotosAuthorize(this.familyId());
      this.openExternal(url);
    } catch (error) {
      this.error.set(generalMessage(toProblem(error)));
      this.busy.set(false);
    }
  }

  protected askToDisconnect(): void {
    this.confirming.set(true);
    // Move focus to the question so keyboard and screen-reader users land on it.
    setTimeout(() => this.confirmHeading()?.nativeElement.focus());
  }

  protected cancelDisconnect(): void {
    this.confirming.set(false);
    setTimeout(() =>
      this.host.nativeElement.querySelector<HTMLElement>('#photos-disconnect')?.focus(),
    );
  }

  protected async disconnect(): Promise<void> {
    this.busy.set(true);
    this.error.set(null);
    try {
      await this.api.googlePhotosDisconnect(this.familyId());
      this.status.update(
        (s) =>
          s && {
            ...s,
            state: 'NotConnected',
            problem: 'None',
            connectedAt: null,
            exportedCount: 0,
            albumCount: 0,
            waitingCount: 0,
          },
      );
      this.confirming.set(false);
      this.toasts.show(
        'Google Photos is disconnected. What’s already there stays in your Google Photos.',
      );
    } catch (error) {
      this.error.set(generalMessage(toProblem(error)));
    } finally {
      this.busy.set(false);
    }
  }
}
