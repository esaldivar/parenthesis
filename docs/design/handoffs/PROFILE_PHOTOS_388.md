# Profile photos (#388)

Status: implemented for release 0.3.0 (Milestone M3), awaiting owner review. Owner decisions of October 30, 2026 are
recorded in issue #388. This replaces the earlier initials-only rule wherever a person has chosen a photo; initials
stay the fallback.

## Who chooses what, and who sees it

| Photo | Chosen by | Seen by | Edited in |
|---|---|---|---|
| A parent's own photo | That parent | Both parents; the shared-device picker and parent PIN screen of that parent's own shared device | Parent Settings → Profile photos |
| A parent's photo of a child | That parent | Only that parent (calendar circles, Settings → Children) | Parent Settings → Profile photos |
| A child's own photo | That child, signed in | The child (Settings); the picker tile and child PIN screen on devices that show the child | Child Settings → Your picture |

- Nobody can change another person's photo, and no choice approves or overwrites anyone else's. There is no mutual
  approval: appearance is personal.
- When the relevant photo is missing, the existing initial shows. Another person's private choice is never used
  instead: a parent who hasn't picked a photo of Kai sees "K", even if the co-parent or Kai has one.
- Editing happens **only in Settings**. The account corner, calendar circles, picker and PIN screens only display.

## Where photos show

| Surface | Phone (under 1024px) | Desktop (1024px and up) |
|---|---|---|
| Account corner (top bar) | Own photo | Own photo |
| Picker tiles and the PIN screens | Each person's own photo | Each person's own photo |
| Calendar circles (dashboard week/list, Calendar views) | **First-letter initials** | Parent: their own photo. Child: the viewing parent's photo of that child |
| Settings (Profile photos, Children) | Photos | Photos |

The calendar rule is CSS-only (`app-avatar photoOn="desktop"`): the circle keeps its size, ring and initial, and the
photo is layered on top at 1024px and up. Other avatars (Upcoming list, sample-only cards, onboarding) keep initials.

## Editor states

Choose a photo → preview ("Preview. It isn't saved yet.") → **Save photo** or **Cancel**. While saving the button says
"Saving…". A saved photo offers **Change photo** and **Remove photo**; removing brings back the initial. Messages:
unsupported type, over 8 MB, too many pixels, animation, unreadable file, offline, too many changes. A failed save
keeps the previous photo. Confirmations go to a polite live region (toasts don't exist in the child space). Buttons
are at least 44px (the child space's larger target where set), and every button names whose photo it changes for
screen readers ("Change photo for Kai").

## Storage and safety limits

Defined before uploads were enabled; implemented in `AvatarImages` and `PhotoEndpoints` (Families module).

- **Accepted:** JPEG, PNG and still WebP, decided from the file's bytes. SVG, GIF, HEIC and animations are refused.
  (iOS Safari converts HEIC photos to JPEG when the file picker only accepts JPEG/PNG/WebP.)
- **Upload:** at most 8 MB; at most 12,000px on a side and 60 megapixels claimed in the header; at most 16 megapixels
  actually decoded (large JPEGs decode at a reduced scale).
- **Stored:** a centred square, turned upright from the camera orientation, at most 512×512, re-encoded as WebP and
  at most 200 KB. Re-encoding keeps pixels only, so EXIF, GPS location and other metadata are removed.
- **How many:** one photo per chooser and pictured person (unique index). A family therefore holds at most
  2 parents × (1 + 12 children) + 12 children = 38 photos, about 7.6 MB in the worst case.
- **Where:** in the family's PostgreSQL rows (`families.profile_photos`), behind the tenant filter. Replacing adds the
  new row and deletes the old one in one transaction, so nothing is orphaned and a failure keeps the old photo.
  Removing deletes the row. Deleting an account deletes that parent's photos; closing a family deletes all of them.
  Small avatars don't need the Azure Blob store planned for memories (#115); if that lands, avatars can move there.
  Owner decision October 30, 2026: keep PostgreSQL for now and move to Blob before the private beta (in `TODO.md`).
- **Reads:** private API URLs only, checked on every request (`Cache-Control: private, no-cache`, the photo id as
  ETag, `nosniff`). Family URLs need membership (or the child's own session); picker URLs need a usable device cookie
  for that device's profiles. Guessed ids, other households, revoked or expired devices and lost membership answer 404.
- **Abuse:** uploads are limited to 30 an hour per parent or child, need the antiforgery token, and are audited
  (`profile_photo.updated`, `profile_photo.removed`).

## Verification (October 30, 2026, branch `feat/388-profile-photos` from release/0.3.0 at c2f7f38)

- API integration tests (`ProfilePhotoTests`, 10): two parents, two siblings, a shared kitchen device and a separate
  household; replace/remove, forged requests, per-parent independence across sign-ins, child-only editing, picker
  precedence, revoked device, refused uploads keep the previous photo, metadata removal and orientation, antiforgery,
  account deletion.
- Vitest (17 new): store resolution without substitution, avatar fallback and desktop-only marking, editor
  preview/save/failure/remove/child "me", axe; picker and PIN screens use each person's own photo; every calendar
  circle is desktop-only.
- Playwright (`m3-calendar/profile-photos.spec.ts`): run locally against the API built into the chiseled runtime image,
  in desktop Chromium and the 320px and 390px touch Chromium profiles, light and dark, with axe scans. The mobile WebKit
  profiles were not run locally (CI runs them).
- Screenshots of these states were shared with the owner in the project thread.

## Open

See TODO.md: owner design review of the Settings section and editor, physical-device checks (iPhone HEIC conversion,
Android picker), and screen reader checks.
