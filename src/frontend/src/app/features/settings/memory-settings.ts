import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  computed,
  inject,
  input,
  signal,
} from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatSlideToggleChange, MatSlideToggleModule } from '@angular/material/slide-toggle';
import { Api, MemorySettings } from '../../core/api/api';
import { generalMessage, toProblem } from '../../core/api/problem';
import { Toasts } from '../../shared/toast/toasts';
import { sizeText } from '../memories/photo-text';

/**
 * Settings → Memories (#403): this parent's photo storage and whether their co-parent may download the photos they
 * share. Personal: it covers only this parent's own photos, is off by default, and never changes viewing.
 */
@Component({
  selector: 'app-memory-settings',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatButtonModule, MatSlideToggleModule],
  template: `
    @if (error(); as error) {
      <p class="error" role="alert">{{ error }}</p>
      @if (!settings()) {
        <button mat-stroked-button type="button" (click)="load()">Try again</button>
      }
    }
    @if (settings(); as s) {
      <div class="storage">
        <p id="storage-label">
          <strong>Your photo storage</strong> {{ used() }} of {{ limit() }} used
        </p>
        <div
          class="meter"
          role="meter"
          aria-labelledby="storage-label"
          [attr.aria-valuenow]="s.storageUsedBytes"
          aria-valuemin="0"
          [attr.aria-valuemax]="s.storageLimitBytes"
          [attr.aria-valuetext]="used() + ' of ' + limit() + ' used'"
        >
          <span [style.width.%]="percent()"></span>
        </div>
        <p class="muted">
          Includes thumbnails. Space comes back when photos are deleted or expire.
        </p>
      </div>
      <mat-slide-toggle
        [checked]="s.allowCoParentDownload"
        [disabled]="busy()"
        (change)="save($event)"
        aria-describedby="memory-download-help"
        >Allow co-parent to download my shared memories</mat-slide-toggle
      >
      <p id="memory-download-help" class="muted">
        When this is on, {{ coParent() ?? 'your co-parent' }} can download the photos you’ve shared
        with them. When it’s off, they can still view them. This controls Parenthesis’s download
        features only: copies already saved can’t be recalled, and screenshots can’t be prevented.
      </p>
    } @else if (!error()) {
      <p class="muted">Loading…</p>
    }
  `,
  styles: `
    :host {
      display: grid;
      gap: var(--space-3);
    }
    p {
      margin: 0;
    }
    .muted {
      color: var(--color-text-secondary);
    }
    .error {
      color: var(--color-danger);
    }
    .storage {
      display: grid;
      gap: var(--space-2);
    }
    .meter {
      height: 10px;
      border-radius: var(--radius-pill);
      border: 1px solid var(--color-outline);
      background: var(--color-canvas);
      overflow: hidden;
    }
    .meter span {
      display: block;
      height: 100%;
      background: var(--color-action);
    }
    button[mat-stroked-button] {
      min-height: var(--target-min);
      justify-self: start;
    }
  `,
})
export class MemorySettingsSection implements OnInit {
  private readonly api = inject(Api);
  private readonly toasts = inject(Toasts);

  readonly familyId = input.required<string>();
  readonly coParent = input<string | null>(null);

  protected readonly settings = signal<MemorySettings | null>(null);
  protected readonly error = signal<string | null>(null);
  protected readonly busy = signal(false);

  protected readonly used = computed(() => sizeText(this.settings()?.storageUsedBytes ?? 0));
  protected readonly limit = computed(() => sizeText(this.settings()?.storageLimitBytes ?? 0));
  protected readonly percent = computed(() => {
    const s = this.settings();
    return s && s.storageLimitBytes > 0
      ? Math.min(100, (s.storageUsedBytes / s.storageLimitBytes) * 100)
      : 0;
  });

  ngOnInit(): void {
    void this.load();
  }

  protected async load(): Promise<void> {
    this.error.set(null);
    try {
      this.settings.set(await this.api.memorySettings(this.familyId()));
    } catch (error) {
      this.error.set(`Your memory settings couldn’t load. ${generalMessage(toProblem(error))}`);
    }
  }

  protected async save(change: MatSlideToggleChange): Promise<void> {
    const allow = change.checked;
    this.busy.set(true);
    this.error.set(null);
    try {
      this.settings.set(await this.api.saveMemorySettings(this.familyId(), allow));
      this.toasts.show(
        allow
          ? `${this.coParent() ?? 'Your co-parent'} can now download the photos you share.`
          : `${this.coParent() ?? 'Your co-parent'} can no longer download your photos. They can still view the ones you share.`,
      );
    } catch (error) {
      change.source.checked = !allow;
      this.error.set(generalMessage(toProblem(error)));
    } finally {
      this.busy.set(false);
    }
  }
}
