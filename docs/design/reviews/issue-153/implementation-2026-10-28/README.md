# #153 implementation screenshots — October 28, 2026

Headless Chromium screenshots of the implementation branch `feat/153-shared-device-flow`, driven
through the real Angular app against a local API and PostgreSQL. Synthetic data only (Dad, Kai, Rivera Family).
No SMTP server was running, so every notice correctly says the email **couldn't** be sent.

These are implementation evidence for owner review. They are not the approved design boards, don't approve any
pending supplement, and don't replace real-device, screen-reader or email-client testing. The header uses the
unchanged approved icon with the text wordmark (exact wordmark exports still pending).

| File | State |
|---|---|
| `320-light-01-setup-question.png`, `1280-dark-01-setup-question.png` | "Is this a shared family device?" after password sign-in |
| `320-light-02-setup-form.png` | "Yes": device name and initial six-digit parent PIN |
| `320-light-04-picker.png` | Picker after Switch profile: only Dad and approved Kai |
| `320-light-07-parent-pin-paused.png`, `1280-dark-07-parent-pin-paused.png` | Parent PIN paused, retry time, email failure shown honestly |
| `320-light-09-child-paused.png` | Child PIN short break (no email) |
| `320-light-10-child-locked.png` | Child PIN locked until a parent resets it |
| `320-light-12-parent-pin-locked.png` | Parent PIN locked; password sign-in remains |
| `1280-dark-11-picker-with-states.png` | Picker showing paused and locked PINs |
| `1280-dark-15-settings-after-resets.png` | Settings: parent PIN, child PIN reset, device sharing end date |

Also checked in that run: no horizontal scroll at 320px or 1280px on any captured state; Back after Switch profile
did not reopen parent pages; after the 30-day expiry (simulated in the database) the parent's device-bound session
ended and the picker was gone.
