/**
 * From Your Kids API boundary — #531.
 *
 * M4 renders only server-authorized parent-visible content. These contracts are
 * deliberately independent of event photos and child essentials. The M5 server
 * must enforce membership, audience and expiry on every read and mutation;
 * client-side filters are not a security boundary.
 */
export type KidsContentKind = 'Diary' | 'Artwork' | 'Photo';
export type KidsMood = 'Happy' | 'Excited' | 'Calm' | 'Sad' | 'Worried' | 'Proud' | 'Other';

export interface SharedKidsContentBase {
  readonly id: string;
  readonly childId: string;
  readonly kind: KidsContentKind;
  readonly createdAt: string;
  /** Viewer-specific, authorized by the API; never expose the other parent's audience. */
  readonly visibleToViewer: true;
}

export interface KidsDiaryEntry extends SharedKidsContentBase {
  readonly kind: 'Diary';
  readonly body: string;
  readonly mood: KidsMood;
  readonly title: string | null;
  /** Diary entries are not subject to the artwork/photo expiration window. */
}

export interface KidsGalleryItem extends SharedKidsContentBase {
  readonly kind: 'Artwork' | 'Photo';
  readonly imageUrl: string;
  readonly thumbnailUrl: string;
  readonly altText: string;
  readonly expiresAt: string | null;
  readonly bookmarked: boolean;
  readonly heartedByViewer: boolean;
  /** One parent comment, visible to the child; child cannot reply. */
  readonly viewerComment: string | null;
  /** Null when server disallows downloading. */
  readonly downloadUrl: string | null;
}

export interface KidsContentPage<T> {
  readonly items: readonly T[];
  readonly nextCursor: string | null;
}

export interface KidsContentReader {
  /** GET /api/families/:familyId/children/:childId/from-your-kids/diary */
  diary(familyId: string, childId: string, cursor?: string): Promise<KidsContentPage<KidsDiaryEntry>>;
  /** GET /api/families/:familyId/children/:childId/from-your-kids/gallery?kind=... */
  gallery(familyId: string, childId: string, kind: 'Artwork' | 'Photo', cursor?: string): Promise<KidsContentPage<KidsGalleryItem>>;
  /** PUT .../gallery/:itemId/heart, body {hearted:boolean} */
  heart(familyId: string, childId: string, itemId: string, hearted: boolean): Promise<KidsGalleryItem>;
  /** PUT .../gallery/:itemId/bookmark, body {bookmarked:boolean} */
  bookmark(familyId: string, childId: string, itemId: string, bookmarked: boolean): Promise<KidsGalleryItem>;
  /** PUT .../gallery/:itemId/comment, body {comment:string|null} */
  comment(familyId: string, childId: string, itemId: string, comment: string | null): Promise<KidsGalleryItem>;
}

/** 60-day expiry is a server responsibility; this is display logic only. */
export function daysUntilExpiry(expiresAt: string | null, now: Date): number | null {
  if (!expiresAt) return null;
  const timestamp = Date.parse(expiresAt);
  if (!Number.isFinite(timestamp)) return null;
  return Math.max(0, Math.ceil((timestamp - now.getTime()) / 86_400_000));
}
