import { ChangeDetectionStrategy, Component, OnInit, computed, inject, input, signal } from '@angular/core';
import { Api, Child } from '../../core/api/api';
import { generalMessage, toProblem } from '../../core/api/problem';
import { AuthStore } from '../../core/auth/auth.store';
import { ProfilePhotos } from '../../core/profile-photos/profile-photos';
import { PhotoEditor } from '../../shared/photo-editor/photo-editor';

/**
 * A parent's profile photos (#388), edited only here in Settings: their own photo, which their co-parent sees too,
 * and their personal photo for each child, which only they see. Each child chooses their own photo for the sign-in
 * screen in their own Settings; nothing here changes it, and the co-parent's choices are never shown.
 */
@Component({
  selector: 'app-profile-photo-settings',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [PhotoEditor],
  template: `
    @if (you(); as you) {
      <app-photo-editor
        [familyId]="familyId()"
        [subject]="you"
        [name]="yourName()"
        label="Your photo"
        hint="You and your co-parent see this photo."
      />
    } @else {
      <p class="muted">Loading…</p>
    }

    @if (error(); as error) {
      <p class="alert" role="alert">{{ error }}</p>
    } @else if (children(); as children) {
      @if (children.length > 0) {
        <h3>Your photos of your children</h3>
        <p class="muted">
          Only you see these. Your co-parent picks their own, and each child picks the photo on the sign-in screen.
        </p>
        <ul>
          @for (child of children; track child.id) {
            <li>
              <app-photo-editor
                [familyId]="familyId()"
                [subject]="{ kind: 'child', id: child.id }"
                [childId]="child.id"
                [name]="child.firstName"
                [label]="child.firstName"
                hint="Only you see this photo."
                [forWhom]="'for ' + child.firstName"
              />
            </li>
          }
        </ul>
      }
    }
  `,
  styles: `
    :host {
      display: grid;
      gap: var(--space-3);
    }
    h3 {
      margin: var(--space-2) 0 0;
      font-size: var(--font-size-body);
    }
    p {
      margin: 0;
    }
    ul {
      display: grid;
      gap: var(--space-4);
      margin: 0;
      padding: 0;
      list-style: none;
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
export class ProfilePhotoSettings implements OnInit {
  private readonly api = inject(Api);
  private readonly auth = inject(AuthStore);
  private readonly photos = inject(ProfilePhotos);

  readonly familyId = input.required<string>();

  protected readonly you = computed(() => (this.photos.you()?.kind === 'parent' ? this.photos.you() : null));
  protected readonly yourName = computed(() => this.auth.user()?.displayName ?? '');
  protected readonly children = signal<readonly Child[] | null>(null);
  protected readonly error = signal<string | null>(null);

  ngOnInit(): void {
    void this.initialize();
  }

  private async initialize(): Promise<void> {
    try {
      // Only approved children: a child waiting for the co-parent's approval isn't in the family yet.
      this.children.set((await this.api.children(this.familyId())).filter((c) => c.status === 'Active'));
    } catch (error) {
      this.error.set(generalMessage(toProblem(error)));
    }
  }
}
