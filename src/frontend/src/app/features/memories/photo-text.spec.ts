import { HttpErrorResponse } from '@angular/common/http';
import { Memory } from '../../core/api/api';
import { toProblem } from '../../core/api/problem';
import {
  blockedText,
  canRetry,
  deletedOnIfAddedToday,
  expiry,
  expiryChip,
  fileProblem,
  sizeText,
  uploadMessage,
  whoseText,
} from './photo-text';

// Synthetic data only.
const file = (name: string, type: string, size = 1000) => {
  const f = new File(['x'], name, { type });
  Object.defineProperty(f, 'size', { value: size });
  return f;
};
const refusal = (status: number, reason?: string, title?: string) =>
  toProblem(new HttpErrorResponse({ status, error: { title, reason } }));

describe('event photo wording (#403)', () => {
  it('checks files before uploading, with a way forward', () => {
    expect(fileProblem(file('IMG_2041.jpg', 'image/jpeg'))).toBeNull();
    expect(fileProblem(file('pic.png', 'image/png'))).toBeNull();
    expect(fileProblem(file('pic.webp', 'image/webp'))).toBeNull();
    expect(fileProblem(file('IMG_2043.dng', 'image/x-adobe-dng'))).toBe(
      'RAW photos (DNG) aren’t supported. Export it as a JPEG and add that instead.',
    );
    expect(fileProblem(file('IMG_2044.HEIC', ''))).toContain('HEIC photos aren’t supported yet');
    expect(fileProblem(file('clip.gif', 'image/gif'))).toBe('Choose a JPEG, PNG or WebP photo.');
    expect(fileProblem(file('pano.jpg', 'image/jpeg', 20_000_001))).toBe('This photo is over 20 MB. Choose a smaller one.');
    expect(fileProblem(file('max.jpg', 'image/jpeg', 20_000_000))).toBeNull();
    expect(fileProblem(file('empty.jpg', 'image/jpeg', 0))).toBe('This file is empty. Choose a photo to add.');
  });

  it('explains upload failures, and offers trying again only when it might work', () => {
    const offline = toProblem(new HttpErrorResponse({ status: 0 }));
    expect(uploadMessage(offline)).toBe('Couldn’t upload. Check your connection and try again.');
    expect(canRetry(offline)).toBe(true);

    const full = refusal(409, 'storage-full', 'You don’t have enough photo storage left for this photo.');
    expect(uploadMessage(full)).toContain('Delete photos you no longer need');
    expect(canRetry(full)).toBe(false);

    const heic = refusal(415, 'heic', 'HEIC photos aren’t supported yet.');
    expect(uploadMessage(heic)).toBe('HEIC photos aren’t supported yet.');
    expect(canRetry(heic)).toBe(false);

    const storage = refusal(503, 'storage-failed', 'The photo couldn’t be saved. Try again.');
    expect(uploadMessage(storage)).toBe('The photo couldn’t be saved. Try again.');
    expect(canRetry(storage)).toBe(true);
    expect(canRetry(refusal(503, 'uploads-off', 'Adding photos isn’t available yet.'))).toBe(false);
  });

  it('writes sizes in the decimal units the allowance uses', () => {
    expect(sizeText(0)).toBe('0 MB');
    expect(sizeText(900_000)).toBe('900 KB');
    expect(sizeText(3_100_000)).toBe('3.1 MB');
    expect(sizeText(38_000_000)).toBe('38 MB');
    expect(sizeText(250_000_000)).toBe('250 MB');
    expect(sizeText(1_200_000_000)).toBe('1.2 GB');
  });

  it('says when photos go, in the family’s time zone, more strongly in the final week', () => {
    const now = new Date('2026-11-06T18:00:00Z'); // Friday afternoon in Chicago.
    const zone = 'America/Chicago';

    expect(expiryChip(expiry('2026-11-30T16:00:00Z', zone, now))).toBe('Deleted Nov 30');
    expect(expiry('2026-11-30T16:00:00Z', zone, now).soon).toBe(false);
    expect(expiryChip(expiry('2026-11-09T16:00:00Z', zone, now))).toBe('Deleted in 3 days');
    expect(expiryChip(expiry('2026-11-07T16:00:00Z', zone, now))).toBe('Deleted tomorrow');
    // 2:00 UTC on November 7 is still November 6 in Chicago.
    expect(expiryChip(expiry('2026-11-07T02:00:00Z', zone, now))).toBe('Deleted today');
    expect(deletedOnIfAddedToday(zone, now)).toBe('Dec 4');
  });

  it('explains why an event can’t take photos', () => {
    expect(blockedText('not-confirmed', null)).toBe('Photos can be added once this event is confirmed.');
    expect(blockedText('not-caregiver', 'Sam')).toBe('Sam has the kids during this parenting time, so only Sam can add photos.');
    expect(blockedText('not-started', null)).toBe('Photos can be added once this event starts.');
    expect(blockedText('window-closed', null)).toContain('more than 28 days since this event');
  });

  it('says whose photos a memory holds', () => {
    const memory = (yours: number, shared: number) => ({ yourPhotoCount: yours, sharedWithYouCount: shared }) as Memory;
    expect(whoseText(memory(4, 3), 'Sam')).toBe('You and Sam');
    expect(whoseText(memory(4, 0), 'Sam')).toBe('You');
    expect(whoseText(memory(0, 3), 'Sam')).toBe('Sam');
    expect(whoseText(memory(0, 3), null)).toBe('Your co-parent');
  });
});
