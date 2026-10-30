# Profile images — #388

Owner decisions, October 30, 2026. Target `release/0.3.0`, M3 Calendar, P0 Critical.

Each parent controls their self-photo and an independent personal photo selection for each authorized child.
Neither parent can overwrite the other parent's selections. Children control their own profile photo separately.
None of these changes needs co-parent approval.

| Surface | Desktop | Mobile | Child image source |
| --- | --- | --- | --- |
| Calendar circles, including Home calendar | Photo, initial fallback | First-letter initial | Viewing parent's personal selection |
| Account/profile corner | Photo, initial fallback | Photo, initial fallback | Child's own selection in a child session |
| Shared-device profile picker | Photo, initial fallback | Photo, initial fallback | Child's own selection |
| Selected profile on PIN entry | Photo, initial fallback | Photo, initial fallback | Child's own selection |
| Future child profile surfaces | Photo, initial fallback | Photo, initial fallback | Child's own selection |

Parent images always resolve to the parent's self-photo. The current 1024px parent-shell breakpoint defines the
calendar's desktop/phone boundary. Keep existing circle sizes, rings and nearby accessible names. No new selection
glyphs, branding changes, picker redesign, or complete child-home redesign.

## Implementation progress

The shared `Avatar` component now accepts an optional image URL, preserves an initial fallback when the image is
missing or fails, and supports a calendar-only responsive image suppression flag. Existing Calendar item text and
Home week-calendar avatars opt into that flag. Account/picker/PIN avatars retain their default all-width behavior.
This is the rendering foundation only: no image URLs are currently supplied, and uploading is not enabled.

## Remaining implementation

- Model separate canonical self-images and viewer-owned child selections. Resolve by authenticated identifiers,
  never names, and avoid serving one parent's private child selection to another viewer.
- Add bounded image upload/normalization, private persistence, replace/remove and cleanup. Define concrete limits;
  retain existing image on failure, validate actual decoded image content and strip EXIF/location metadata.
- Enforce parent/child/household access server-side, including image reads after device revocation, membership loss,
  child removal and session switching. Shared-device image reads must validate the same eligible-profile boundary
  as the picker without granting access to other media.
- Add parent self-image and personal child-image controls; add the minimum child self-image selection surface.
- Wire authorized sources to Calendar/Home, account corners, profile tiles, child and parent PIN screens.
- Test two parents, two siblings and another household with synthetic images, failure/replacement and stale sessions.
- Run the browser matrix in light/dark at desktop, 320px and 390px, including picker/PIN photos, mobile calendar
  initials, responsive image failure and keyboard/focus behavior. Component tests alone cannot establish this.

The existing #115 broad media quotas/gallery work and #179 child experience remain separate. Do not enable uploads
without the avatar-specific safeguards above. No merge, deployment or full acceptance is implied by this foundation.
