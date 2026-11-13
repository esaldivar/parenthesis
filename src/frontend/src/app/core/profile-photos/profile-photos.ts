import { Injectable, Injector, computed, inject, signal } from '@angular/core';
import { Api, PhotoRef, PhotoSet } from '../api/api';

/** Whose photo: a parent by family membership id, or a child by child id. */
export interface PhotoSubject {
  readonly kind: 'parent' | 'child';
  readonly id: string;
}

/**
 * The signed-in viewer's profile photos (#388), as the API resolves them for that viewer only:
 * - a parent sees each parent's own photo and their own personal photo for each child;
 * - a child sees their own photo.
 * Anything missing falls back to the initial; another person's private choice is never substituted. The store is
 * cleared whenever the viewer changes, and every image URL is checked by the server again, so a stale URL from an
 * earlier profile can't show anything.
 *
 * The shared-device picker and PIN screens don't use this store: their tiles carry each person's own photo.
 */
@Injectable({ providedIn: 'root' })
export class ProfilePhotos {
  // Api is looked up only when needed, so components that just display avatars don't need HTTP.
  private readonly injector = inject(Injector);
  private readonly set = signal<PhotoSet | null>(null);
  private familyId: string | null = null;
  private generation = 0;

  /** The viewer's own photo URL, or null. */
  readonly own = computed(() => {
    const set = this.set();
    return set ? this.find(set, set.youKind, set.youId) : null;
  });

  /** The viewer: their kind and id, once loaded. */
  readonly you = computed<PhotoSubject | null>(() => {
    const set = this.set();
    return set ? { kind: set.youKind, id: set.youId } : null;
  });

  /** The photo URL this viewer sees for a person, or null for the initial. */
  url(kind: 'parent' | 'child', id: string | null | undefined): string | null {
    const set = this.set();
    return set && id ? this.find(set, kind, id) : null;
  }

  /** Loads the viewer's photos for a family, or clears them (no family, or signed out). Failures show initials. */
  async load(familyId: string | null): Promise<void> {
    const generation = ++this.generation;
    this.familyId = familyId;
    this.set.set(null);
    if (!familyId) {
      return;
    }
    try {
      const loaded = await this.injector.get(Api).photos(familyId);
      if (generation === this.generation) {
        this.set.set(loaded);
      }
    } catch {
      // Initials are always a correct fallback.
    }
  }

  /** Saves the viewer's own photo, or a parent's personal photo of a child. Throws the HTTP error; nothing changes then. */
  async save(familyId: string, childId: string | null, file: Blob): Promise<PhotoRef> {
    const api = this.injector.get(Api);
    const saved = childId ? await api.setChildPhoto(familyId, childId, file) : await api.setOwnPhoto(familyId, file);
    this.replace(familyId, saved.kind, saved.id, saved);
    return saved;
  }

  /** Removes the viewer's own photo, or a parent's personal photo of a child, so the initial shows. */
  async remove(familyId: string, subject: PhotoSubject, childId: string | null): Promise<void> {
    const api = this.injector.get(Api);
    await (childId ? api.removeChildPhoto(familyId, childId) : api.removeOwnPhoto(familyId));
    this.replace(familyId, subject.kind, subject.id, null);
  }

  private replace(familyId: string, kind: 'parent' | 'child', id: string, photo: PhotoRef | null): void {
    const set = this.set();
    if (!set || familyId !== this.familyId) {
      return;
    }
    const others = set.photos.filter((p) => !(p.kind === kind && p.id === id));
    this.set.set({ ...set, photos: photo ? [...others, photo] : others });
  }

  private find(set: PhotoSet, kind: 'parent' | 'child', id: string): string | null {
    return set.photos.find((p) => p.kind === kind && p.id === id)?.url ?? null;
  }
}
