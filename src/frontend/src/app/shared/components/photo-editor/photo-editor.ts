import { AppLocale, LocaleService } from '../../../core/i18n/locale.service';
import { TranslatePipe, translate } from '../../../core/i18n/translations';
import { LoadingIndicator } from '../brand/loading-indicator';
import { ChangeDetectionStrategy, Component, DestroyRef, ElementRef, computed, inject, input, signal, viewChild } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { toProblem } from '../../../core/api/problem';
import { PhotoSubject, ProfilePhotos } from '../../../core/profile-photos/profile-photos';
import { Avatar } from '../avatar/avatar';

/** What the server accepts (#388). The server checks the file's own bytes again; these just give a quick answer. */
export const PHOTO_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;
export const MAX_PHOTO_BYTES = 8 * 1024 * 1024;

/** A friendly message for a refused or failed upload, from the server's `reason` or the HTTP status. */
export function photoErrorMessage(error: unknown, locale: AppLocale = 'en'): string {
  const problem = toProblem(error);
  const reason = (error as { error?: { reason?: unknown } } | null)?.error?.reason;
  switch (reason) {
    case 'too-large':
      return translate('photo.editor.size', locale);
    case 'too-many-pixels':
      return translate('photo.editor.dimensions', locale);
    case 'animated':
      return translate('photo.editor.animated', locale);
    case 'unsupported':
      return translate('photo.editor.format', locale);
    case 'damaged':
    case 'empty':
      return translate('photo.editor.unreadable', locale);
  }
  if (problem.status === 0) {
    return translate('photo.editor.offline', locale);
  }
  if (problem.status === 429) {
    return translate('photo.editor.rateLimit', locale);
  }
  return translate('photo.editor.saveError', locale);
}

/**
 * Choose, preview, save, replace or remove one profile photo (#388). Used only in Settings: a parent's own photo, a
 * parent's personal photo of a child, or a signed-in child's own photo. Nothing changes until Save; a failed save
 * keeps the previous photo. Removing it brings back the initial.
 */
@Component({
  selector: 'app-photo-editor',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [TranslatePipe, MatButtonModule, Avatar, LoadingIndicator],
  template: `
    <div class="row">
      <app-avatar [name]="name()" [kind]="subject().kind" [size]="72" [src]="preview() ?? current()" />
      <div class="text">
        <p class="who" [id]="headingId">{{ label() }}</p>
        @if (preview()) {
          <p class="muted">{{ 'feature.preview.it.isn.t.saved.yet' | tr }}</p>
        } @else if (current()) {
          <p class="muted">{{ hint() }}</p>
        } @else {
          <p class="muted">{{ 'photo.editor.initial' | tr: { initial: initial() } }} {{ hint() }}</p>
        }
      </div>
    </div>

    <input
      #file
      class="visually-hidden"
      type="file"
      [accept]="accept"
      tabindex="-1"
      aria-hidden="true"
      (change)="chosen($event)"
    />

    <div class="actions" role="group" [attr.aria-labelledby]="headingId">
      @if (preview()) {
        <button mat-flat-button type="button" [disabled]="busy()" (click)="save()">
          {{ busy() ? ('feature.saving' | tr) : error() ? ('feature.try.again' | tr) : ('feature.save.photo' | tr) }}
        </button>
        <button mat-button type="button" [disabled]="busy()" (click)="cancel()">{{ 'feature.cancel' | tr }}</button>
      } @else {
        <button mat-stroked-button type="button" [disabled]="busy()" (click)="choose()">
          {{ current() ? ('feature.change.photo' | tr) : ('feature.choose.a.photo' | tr) }}<span class="visually-hidden"> {{ forWhom() }}</span>
        </button>
        @if (current()) {
          <button mat-button type="button" [disabled]="busy()" (click)="remove()">
            {{ busy() ? ('feature.removing' | tr) : ('feature.remove.photo' | tr) }}<span class="visually-hidden"> {{ forWhom() }}</span>
          </button>
        }
      }
    </div>

    @if (error(); as error) {
      <p class="alert" role="alert">{{ error }}</p>
    }
    <app-loading-indicator [idleMessage]="announcement()" [active]="busy()" [label]="preview() ? ('feature.uploading.photo' | tr) : ('feature.removing.photo' | tr)" />
  `,
  styles: `
    :host {
      display: grid;
      gap: var(--space-3);
    }
    p {
      margin: 0;
    }
    .row {
      display: flex;
      align-items: center;
      gap: var(--space-3);
    }
    .text {
      display: grid;
      gap: var(--space-1);
      min-width: 0;
    }
    .who {
      font-weight: 700;
      overflow-wrap: anywhere;
    }
    .muted {
      color: var(--color-text-secondary);
    }
    .actions {
      display: flex;
      flex-wrap: wrap;
      gap: var(--space-2);
    }
    button {
      min-height: var(--kid-target, var(--target-min));
    }
    .alert {
      padding: var(--space-3) var(--space-4);
      border: 1px solid var(--color-danger);
      border-radius: var(--radius-control);
      background: var(--color-status-rejected-bg);
    }
  `,
})
export class PhotoEditor {
  private readonly copyLocale = inject(LocaleService);
  private static next = 0;
  private readonly photos = inject(ProfilePhotos);
  private readonly file = viewChild.required<ElementRef<HTMLInputElement>>('file');

  readonly familyId = input.required<string>();
  /** Whose photo this is. */
  readonly subject = input.required<PhotoSubject>();
  /** For a parent's personal photo of a child: that child's id. Null for the viewer's own photo. */
  readonly childId = input<string | null>(null);
  /** The pictured person's name, for the initial. */
  readonly name = input.required<string>();
  /** Shown above the buttons, for example "Your photo" or "Kai". */
  readonly label = input.required<string>();
  /** Who sees it, for example "Only you see this photo." */
  readonly hint = input('');
  /** Read by screen readers after the button text, for example "for Kai". */
  readonly forWhom = input('');

  protected readonly accept = PHOTO_TYPES.join(',');
  protected readonly headingId = `photo-editor-${PhotoEditor.next++}`;
  protected readonly preview = signal<string | null>(null);
  protected readonly busy = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly announcement = signal('');
  protected readonly current = computed(() => this.photos.url(this.subject().kind, this.subject().id));
  protected readonly initial = computed(() => this.name().trim().charAt(0).toUpperCase());
  private pending: File | null = null;

  constructor() {
    inject(DestroyRef).onDestroy(() => this.clearPreview());
  }

  protected choose(): void {
    this.error.set(null);
    this.file().nativeElement.click();
  }

  protected chosen(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0] ?? null;
    input.value = ''; // Choosing the same file again still counts as a choice.
    if (!file) {
      return;
    }
    if (!(PHOTO_TYPES as readonly string[]).includes(file.type)) {
      this.error.set(translate('photo.editor.format', this.copyLocale.locale()));
      return;
    }
    if (file.size > MAX_PHOTO_BYTES) {
      this.error.set(translate('photo.editor.size', this.copyLocale.locale()));
      return;
    }
    this.clearPreview();
    this.pending = file;
    this.preview.set(URL.createObjectURL(file));
    this.announcement.set(translate('photo.editor.preview', this.copyLocale.locale()));
  }

  protected cancel(): void {
    this.clearPreview();
    this.announcement.set(translate('photo.editor.unchanged', this.copyLocale.locale()));
  }

  protected async save(): Promise<void> {
    if (!this.pending || this.busy()) {
      return;
    }
    this.busy.set(true);
    this.error.set(null);
    this.announcement.set('');
    try {
      await this.photos.save(this.familyId(), this.childId(), this.pending);
      this.clearPreview();
      this.announcement.set(translate('photo.editor.saved', this.copyLocale.locale()));
    } catch (error) {
      // Keep the selected file for retryable transport failures; the preview stays explicitly unsaved.
      const status = toProblem(error).status;
      if (status !== 0 && status !== 429 && status < 500) {
        this.clearPreview();
      }
      this.error.set(photoErrorMessage(error, this.copyLocale.locale()));
    } finally {
      this.busy.set(false);
    }
  }

  protected async remove(): Promise<void> {
    if (this.busy()) {
      return;
    }
    this.busy.set(true);
    this.error.set(null);
    this.announcement.set('');
    try {
      await this.photos.remove(this.familyId(), this.subject(), this.childId());
      this.announcement.set(translate('photo.editor.removed', this.copyLocale.locale(), { initial: this.initial() }));
    } catch (error) {
      this.error.set(toProblem(error).status === 0 ? translate('photo.editor.removeOffline', this.copyLocale.locale()) : translate('photo.editor.removeError', this.copyLocale.locale()));
    } finally {
      this.busy.set(false);
    }
  }

  private clearPreview(): void {
    const url = this.preview();
    if (url) {
      URL.revokeObjectURL(url);
    }
    this.preview.set(null);
    this.pending = null;
  }
}
