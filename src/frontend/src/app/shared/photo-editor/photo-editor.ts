import { ChangeDetectionStrategy, Component, DestroyRef, ElementRef, computed, inject, input, signal, viewChild } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { toProblem } from '../../core/api/problem';
import { PhotoSubject, ProfilePhotos } from '../../core/profile-photos/profile-photos';
import { Avatar } from '../avatar/avatar';

/** What the server accepts (#388). The server checks the file's own bytes again; these just give a quick answer. */
export const PHOTO_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;
export const MAX_PHOTO_BYTES = 8 * 1024 * 1024;

/** A friendly message for a refused or failed upload, from the server's `reason` or the HTTP status. */
export function photoErrorMessage(error: unknown): string {
  const problem = toProblem(error);
  const reason = (error as { error?: { reason?: unknown } } | null)?.error?.reason;
  switch (reason) {
    case 'too-large':
      return 'That photo is too big. Choose one smaller than 8 MB.';
    case 'too-many-pixels':
      return 'That picture is too big. Choose a smaller photo.';
    case 'animated':
      return 'Choose a still photo, not an animation.';
    case 'unsupported':
      return 'Choose a JPEG, PNG or WebP photo.';
    case 'damaged':
    case 'empty':
      return 'That photo couldn’t be read. Try another one.';
  }
  if (problem.status === 0) {
    return 'We couldn’t reach Parenthesis. Your photo wasn’t changed. Check your connection and try again.';
  }
  if (problem.status === 429) {
    return 'That’s a lot of photo changes. Please wait a while and try again.';
  }
  return 'Your photo wasn’t changed. Please try again.';
}

/**
 * Choose, preview, save, replace or remove one profile photo (#388). Used only in Settings: a parent's own photo, a
 * parent's personal photo of a child, or a signed-in child's own photo. Nothing changes until Save; a failed save
 * keeps the previous photo. Removing it brings back the initial.
 */
@Component({
  selector: 'app-photo-editor',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatButtonModule, Avatar],
  template: `
    <div class="row">
      <app-avatar [name]="name()" [kind]="subject().kind" [size]="72" [src]="preview() ?? current()" />
      <div class="text">
        <p class="who" [id]="headingId">{{ label() }}</p>
        @if (preview()) {
          <p class="muted">Preview. It isn’t saved yet.</p>
        } @else if (current()) {
          <p class="muted">{{ hint() }}</p>
        } @else {
          <p class="muted">No photo yet, so the initial {{ initial() }} shows. {{ hint() }}</p>
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
          {{ busy() ? 'Saving…' : 'Save photo' }}
        </button>
        <button mat-button type="button" [disabled]="busy()" (click)="cancel()">Cancel</button>
      } @else {
        <button mat-stroked-button type="button" [disabled]="busy()" (click)="choose()">
          {{ current() ? 'Change photo' : 'Choose a photo' }}<span class="visually-hidden"> {{ forWhom() }}</span>
        </button>
        @if (current()) {
          <button mat-button type="button" [disabled]="busy()" (click)="remove()">
            {{ busy() ? 'Removing…' : 'Remove photo' }}<span class="visually-hidden"> {{ forWhom() }}</span>
          </button>
        }
      }
    </div>

    @if (error(); as error) {
      <p class="alert" role="alert">{{ error }}</p>
    }
    <p class="visually-hidden" role="status">{{ announcement() }}</p>
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
      this.error.set('Choose a JPEG, PNG or WebP photo.');
      return;
    }
    if (file.size > MAX_PHOTO_BYTES) {
      this.error.set('That photo is too big. Choose one smaller than 8 MB.');
      return;
    }
    this.clearPreview();
    this.pending = file;
    this.preview.set(URL.createObjectURL(file));
    this.announcement.set('Preview ready. Save photo to use it, or Cancel.');
  }

  protected cancel(): void {
    this.clearPreview();
    this.announcement.set('Photo not changed.');
  }

  protected async save(): Promise<void> {
    if (!this.pending || this.busy()) {
      return;
    }
    this.busy.set(true);
    this.error.set(null);
    try {
      await this.photos.save(this.familyId(), this.childId(), this.pending);
      this.clearPreview();
      this.announcement.set('Photo saved.');
    } catch (error) {
      // The previous photo stays; the preview is dropped so it can't be mistaken for the saved one.
      this.clearPreview();
      this.error.set(photoErrorMessage(error));
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
    try {
      await this.photos.remove(this.familyId(), this.subject(), this.childId());
      this.announcement.set(`Photo removed. The initial ${this.initial()} shows instead.`);
    } catch (error) {
      this.error.set(toProblem(error).status === 0 ? 'We couldn’t reach Parenthesis. Your photo is still there.' : 'Your photo is still there. Please try again.');
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
