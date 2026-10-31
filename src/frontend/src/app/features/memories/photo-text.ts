import { InjectionToken } from '@angular/core';
import { Memory, PhotoUploadBlock } from '../../core/api/api';
import { Problem, generalMessage } from '../../core/api/problem';
import { addDays, daysBetween, monthDay, todayIn } from '../dashboard/week';
import { toFamilyLocal } from '../calendar/time';

/** The current time, for expiry warnings. Tests replace it. */
export const PHOTOS_NOW = new InjectionToken<() => Date>('PHOTOS_NOW', {
  factory: () => () => new Date(),
});

/**
 * What the picker offers (#403). iPhone Safari converts HEIC photos to JPEG when the picker asks only for these. The
 * server checks each file's own bytes again; these checks just answer quickly, before anything uploads.
 */
export const PHOTO_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;
export const ACCEPT = PHOTO_TYPES.join(',');
/** The server's limit for one source file: 20 MB (decimal, as the server counts it). */
export const MAX_SOURCE_BYTES = 20_000_000;
/** A photo is deleted this many days after it was added. */
export const RETENTION_DAYS = 28;
/** From this many days before deletion the warning gets stronger. */
export const FINAL_WARNING_DAYS = 7;

/** Why a chosen file won't be added, before uploading, or null when it can go. */
export function fileProblem(file: File, maxBytes = MAX_SOURCE_BYTES): string | null {
  const name = file.name.toLowerCase();
  if (/\.(dng|nef|cr2|cr3|arw|raf|orf|rw2|tif|tiff)$/.test(name)) {
    return 'RAW photos (DNG) aren’t supported. Export it as a JPEG and add that instead.';
  }
  if (/\.(heic|heif|avif)$/.test(name) || /image\/(heic|heif|avif)/.test(file.type)) {
    return 'HEIC photos aren’t supported yet. Choose it from your photo library so it’s added as a JPEG, or export it as a JPEG.';
  }
  if (file.type && !(PHOTO_TYPES as readonly string[]).includes(file.type)) {
    return 'Choose a JPEG, PNG or WebP photo.';
  }
  if (file.size === 0) {
    return 'This file is empty. Choose a photo to add.';
  }
  if (file.size > maxBytes) {
    return `This photo is over ${Math.round(maxBytes / 1_000_000)} MB. Choose a smaller one.`;
  }
  return null;
}

/** Why an upload failed, in words, for one file. The server's refusals already read well; network ones get a hint. */
export function uploadMessage(problem: Problem): string {
  if (problem.status === 0) {
    return 'Couldn’t upload. Check your connection and try again.';
  }
  if (problem.reason === 'storage-failed') {
    return 'The photo couldn’t be saved. Try again.';
  }
  if (problem.reason === 'storage-full') {
    return 'You don’t have enough photo storage left. Delete photos you no longer need, or wait for older ones to be deleted.';
  }
  if (problem.reason && problem.title) {
    return problem.title;
  }
  return generalMessage(problem);
}

/** Whether trying the same file again might work: connection trouble or a hiccup on our side, not a refusal. */
export function canRetry(problem: Problem): boolean {
  return (
    problem.status === 0 ||
    problem.status === 429 ||
    problem.reason === 'storage-failed' ||
    (problem.status >= 500 && !problem.reason)
  );
}

/** "38 MB", "1.2 GB", "900 KB": decimal units, as the server counts the allowance. */
export function sizeText(bytes: number): string {
  if (bytes <= 0) {
    return '0 MB';
  }
  if (bytes >= 1_000_000_000) {
    return `${(bytes / 1_000_000_000).toFixed(1)} GB`;
  }
  if (bytes >= 1_000_000) {
    const mb = bytes / 1_000_000;
    return `${mb >= 10 ? Math.round(mb) : mb.toFixed(1).replace(/\.0$/, '')} MB`;
  }
  return `${Math.max(1, Math.round(bytes / 1000))} KB`;
}

/** The family-local date (YYYY-MM-DD) of an instant. */
export const familyDate = (instant: string, zone: string) =>
  toFamilyLocal(instant, zone).slice(0, 10);

/** How long until photos are deleted, for the warnings beside them. */
export interface Expiry {
  /** "Nov 9". */
  readonly on: string;
  /** Whole days from today, in the family's time zone (0 = today). */
  readonly days: number;
  /** In the final week: the warning is stronger and sits beside Download. */
  readonly soon: boolean;
}

export function expiry(expiresAt: string, zone: string, now: Date): Expiry {
  const date = familyDate(expiresAt, zone);
  const days = Math.max(0, daysBetween(todayIn(zone, now), date));
  return { on: monthDay(date), days, soon: days <= FINAL_WARNING_DAYS };
}

/** "Deleted Nov 9", or in the final week "Deleted in 3 days", "Deleted tomorrow", "Deleted today". */
export function expiryChip(e: Expiry): string {
  if (!e.soon) {
    return `Deleted ${e.on}`;
  }
  return e.days === 0
    ? 'Deleted today'
    : e.days === 1
      ? 'Deleted tomorrow'
      : `Deleted in ${e.days} days`;
}

/** The date photos added today will be deleted, for the note before uploading. */
export function deletedOnIfAddedToday(zone: string, now: Date): string {
  return monthDay(addDays(todayIn(zone, now), RETENTION_DAYS));
}

/** Why this event can't take the viewer's photos, in words. */
export function blockedText(block: PhotoUploadBlock, caregiver: string | null): string {
  switch (block) {
    case 'not-confirmed':
      return 'Photos can be added once this event is confirmed.';
    case 'unavailable-time':
      return 'Unavailable time doesn’t take photos.';
    case 'not-caregiver':
      return caregiver
        ? `${caregiver} has the kids during this parenting time, so only ${caregiver} can add photos.`
        : 'Only the parent who has the kids during this parenting time can add photos.';
    case 'not-started':
      return 'Photos can be added once this event starts.';
    case 'window-closed':
      return `It’s been more than ${RETENTION_DAYS} days since this event, so photos can’t be added any more.`;
  }
}

/** "You and Mom", "You" or "Mom": whose photos a memory holds, from what the viewer may see. */
export function whoseText(memory: Memory, coParent: string | null): string {
  if (memory.yourPhotoCount > 0 && memory.sharedWithYouCount > 0) {
    return `You and ${coParent ?? 'your co-parent'}`;
  }
  return memory.yourPhotoCount > 0 ? 'You' : (coParent ?? 'Your co-parent');
}
