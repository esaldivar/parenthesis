# Google Photos export: Google Cloud setup and verification (#404)

**Backend merged (API and export worker, #425); the screens come in the frontend PR.** The design is in
[GOOGLE_PHOTOS_EXPORT_404.md](../design/handoffs/GOOGLE_PHOTOS_EXPORT_404.md). Start the Google Cloud setup and
Google's review now: Google's review has no guaranteed duration.

Each parent will be able to connect their own Google Photos under **Settings → Google Photos** and export Family
Memories photos they're allowed to download into one album per event. One way only: Parenthesis never reads their
library. The feature will be **off until `GooglePhotos__ClientId` and `GooglePhotos__ClientSecret` are set**, and off
on production until Google's review is approved.

## How it will work (summary)
- **Scope:** only `https://www.googleapis.com/auth/photoslibrary.appendonly`. Google: "Only allows new media to be
  created in the user's library and in albums created by the app." Enough to upload, create albums and add items to
  them. No read scopes and no sign-in scopes.
- **Own OAuth client**, in the same Google Cloud project as Google Calendar, so disconnecting one never revokes the
  other.
- **Redirect:** `{App:PublicBaseUrl}/settings/google-photos`, finished through the API (same-origin cookie and
  antiforgery), with PKCE and an encrypted, 10-minute `state`.
- **Tokens:** refresh token encrypted with data protection (purpose `CoParent.Memories.GooglePhotos.RefreshToken.v1`),
  never logged.
- **Limits:** Google allows 10,000 Library API requests per project per day; a 429 means the project hit it. Uploads
  count toward each parent's Google storage at original quality.

## 1. Google Cloud (owner, in the Google Cloud console)
Use the existing project `parenthesis-dev` (the one Google Calendar uses, see
[the Calendar runbook](google-calendar-sync.md)).

1. **APIs & Services → Library**: enable **Photos Library API**.
2. **Google Auth Platform → Data access → Add or remove scopes**: add `.../auth/photoslibrary.appendonly` only.
   Leave every other Photos scope off. **Note what tier the console shows for it (sensitive or restricted)** and
   record it in the tracker below: Google's Photos pages don't say, and restricted scopes also need a CASA security
   assessment.
3. **Audience → Test users:** the test Google accounts that will try export (the same list as Calendar). Use two
   accounts that hold no real family photos.
4. **Credentials → Create credentials → OAuth client ID**:
   - Application type **Web application**, name `parenthesis-dev-photos`. A separate client from Calendar's.
   - **Authorized redirect URIs:** `https://dev.parenthesisfamily.com/settings/google-photos` and, for local work,
     `https://localhost:4200/settings/google-photos`. Production adds its own `…/settings/google-photos`.
   - No JavaScript origins: the browser never talks to Google's APIs.
   - Copy the client ID and secret. Never paste the secret into chat, issues or commits.

## 2. Development site (owner; done November 5, 2026)
Same variables as [the Azure runbook](azure-environments.md) (`ENV=dev`, `$RG`, `$KV`).

```bash
az keyvault secret set --vault-name $KV -n google-photos-client-secret --value "<the client secret>"
```

```bash
az containerapp secret set -g $RG -n ca-parenthesis-$ENV \
  --secrets "google-photos-client-secret=keyvaultref:https://$KV.vault.azure.net/secrets/google-photos-client-secret,identityref:system"
```

```bash
az containerapp update -g $RG -n ca-parenthesis-$ENV --set-env-vars \
  GooglePhotos__ClientId="<the client id>" \
  GooglePhotos__ClientSecret=secretref:google-photos-client-secret
```

Optional settings: `GooglePhotos__Enabled=false` switches it off while keeping the client (production until Google approves); `GooglePhotos__DailyRequestLimit` (default 9000) stops below Google's 10,000 requests a day.

## 3. Google verification (start now)
Domain ownership, brand verification and data-access review are three separate things. Calendar's progress on the
first two is shared with Photos (same project and domain); the Photos scope still needs its own data-access review.
Testing mode with test users is not production approval.

- [ ] Check and record the actual status in the console: domain ownership of `parenthesisfamily.com` (#111), brand
  verification, publishing status, and Calendar's review (#386). Don't infer it.
- [ ] Privacy Notice (published in #416/#418) updated to name Google Photos: only photos the parent chooses, the
  stored WebP version, into albums the app created; nothing read back; disconnect revokes. Lands with the backend PR,
  before submitting.
- [ ] Scope justification, for example: "Parents choose photos from their family's event memories in Parenthesis and
  export them to their own Google Photos. Parenthesis creates one album per event and adds the chosen photos to it.
  It never reads, lists or changes anything else in the user's library."
- [ ] Demo video of connecting, exporting a memory to its album and disconnecting, on the development site with a
  test account. Needs the working feature.
- [ ] Submit, then record each round of Google feedback below.

### Tracker
Our readiness and Google's are separate. Update both as they change; don't mark either done without evidence.

| | Status | Evidence / date |
|---|---|---|
| Photos Library API enabled | Done (owner) | November 5, 2026 |
| `appendonly` scope added; tier shown by console | Done: **sensitive** (not restricted, so no CASA assessment); Calendar's `calendar.app.created` shows non-sensitive | November 5, 2026, Data access page |
| OAuth client `parenthesis-dev-photos` created | Done, separate from Calendar's client; development site settings and Key Vault secret set (section 2) | November 5, 2026 |
| Privacy Notice names Google Photos | Done in #425 (in `release/0.3.0`; public with that release) | November 4, 2026 |
| Our implementation (backend, frontend) | Backend merged into `release/0.3.0` (#425); frontend not built | November 5, 2026 |
| End-to-end test with test accounts | Not started | |
| Google submission | Not submitted | |
| Google project/app reference (no secrets) | | |
| Last Google feedback | | |
| Accountable owner | esaldivar | |
| Next follow-up date | | |

## 4. Check it works (once built)
1. As a test-user parent on the development site: **Settings → Google Photos → Connect**. Google asks only to add to
   the Google Photos library.
2. Open a Family Memory, **Export to Google Photos**, export 2 photos. Within a minute or two they show "In your
   Google Photos", and the album "{event} · {date}" holds them.
3. As the co-parent with the uploader's download setting OFF: their shared photos are listed as not exportable.
   Turn it ON: they can be exported. Turn it OFF while an export is queued: those photos are skipped.
4. Remove Parenthesis's access at [Google Account → Third-party connections](https://myaccount.google.com/connections):
   the next export asks to reconnect.
5. **Disconnect**: queued photos are cancelled; the album stays in Google Photos; Parenthesis no longer appears under
   third-party connections; Google Calendar's connection is unaffected.
