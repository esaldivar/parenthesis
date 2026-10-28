# Shared-device screen direction — issue #153

[Picker and setup reference](assets/shared-device-picker-issue-153.png) · [PIN and device reference](assets/shared-device-pin-recovery-issue-153.jpeg) · [Desktop picker and PIN reference](assets/shared-device-desktop-issue-153.png) · [Issue #153](https://github.com/esaldivar/parenthesis/issues/153)

The owner approved the visual direction in both four-screen boards: shared-device setup, picker, child PIN entry and pause; parent PIN entry and pause, child PIN lock, and expired shared-device entry. These are visual references, not proof of implementation or approval of the entire handoff. Their generated logos approximate the approved artwork: use the exact approved brand artwork per BRANDING.md; never extract or recreate the mockup logo for production. Reconcile screens with the existing design system and issue decisions. Use synthetic data for development and tests. PIN reset and recovery flows, desktop, dark mode, emails and other states remain to be designed and reviewed. Child personal-device design is deferred.

The owner approved the desktop visual direction for the picker, parent PIN entry and child PIN lock. Names shown are placeholders; display actual eligible profile names. The approved brand artwork remains to be placed in the headers. Other desktop states remain to be designed and reviewed.

The owner approved the parent recovery flow, with the corrected parent-only PIN copy. [Parent recovery visual reference](assets/parent-pin-recovery-issue-153.png). The logo is a generated approximation; use the verified approved asset for final design and implementation. Email templates and recovery edge states remain to be designed and reviewed.

The owner approved the four-email visual direction. [Email design reference](assets/pin-notification-emails-issue-153.png): parent PIN pause, parent PIN lock, child PIN lock and child PIN reset notification. The image contains sample names and an approximated logo; use the verified approved branding, real authorized recipients and appropriate dynamic names. The HTML and plain-text templates, actual links, email-client testing and security/privacy validation still need implementation.

The owner approved the [dark desktop picker visual direction](assets/shared-device-dark-desktop-picker-issue-153.png). Profile labels are placeholders. The generated logo and tagline are approximations; use the verified approved artwork and actual branding for the final design. Other dark-mode and desktop states remain to be designed and reviewed.

The owner approved the [dark desktop parent PIN screen](assets/parent-pin-dark-desktop-issue-153.png). Place the approved brand artwork in the header for the final design. It is a visual reference; keyboard accessibility, error states and runtime security must be verified.

Owner approved the [dark desktop parent PIN pause](assets/parent-pin-pause-dark-desktop-issue-153.png). It shows the ten-minute wait, reset, and email notice. Add verified branding in the final header. Only show email-sent confirmation if delivery was successfully initiated; account for delivery failure. Verify accessibility and security in implementation.

Owner approved the [dark desktop child PIN lock screen](assets/child-pin-lock-dark-desktop-issue-153.png). The child is directed to ask a parent and can return to profiles. Add verified branding in the final header. Either authorized parent may reset the PIN; the agreed notification and security rules in #153 still apply.
