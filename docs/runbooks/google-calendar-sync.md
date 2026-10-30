# Google Calendar copy: Google Cloud setup (#386)

Each parent can choose, in **Settings → Google Calendar**, to have the family's confirmed events copied to a separate
**"Parenthesis Family"** calendar in their own Google account. It's one way: Parenthesis never reads a Google calendar
and never brings anything from Google into the family calendar. The feature is **off until `GoogleCalendar__ClientId`
and `GoogleCalendar__ClientSecret` are set**; until then Settings says it isn't available yet.

Owner decisions (October 30, 2026): the option lives under Settings, not on the calendar; one way only; the narrowest
scope; refresh tokens encrypted at rest and never logged; Google's free quota.

## How it works
- **Scope:** only `https://www.googleapis.com/auth/calendar.app.created`. Parenthesis can make secondary calendars
  and manage the ones it made. It can't see the parent's other calendars or their events. No sign-in scopes
  (`openid`, `email`) are requested, so Parenthesis doesn't learn which Google account was used.
- **Connecting:** the OAuth authorization-code flow with PKCE. The `state` is encrypted, expires after 10 minutes and
  only works for the parent who started it, in that family. Google sends the parent back to
  `{App:PublicBaseUrl}/settings/google-calendar`, and the page finishes connecting through the API (same-origin
  cookie and antiforgery, as for everything else). Parenthesis then makes the "Parenthesis Family" calendar in the
  family's time zone.
- **Each parent chooses what's copied** (owner decision, October 30, 2026): under "Events to copy" they tick the
  kinds of event they want (parenting time, family events, school, medical, dental, activities, birthdays,
  holidays, other, their own unavailable time, the co-parent's unavailable time). Everything except the co-parent's
  unavailable time is ticked at first. Unticking a kind removes those events from their Google calendar on the next
  pass. The choice is theirs alone and is kept when they reconnect.
- **What's copied:** confirmed events only, with their confirmed values. A request waiting for approval, or a change
  waiting on a confirmed event, isn't copied until both parents agree. The other parent's unavailable time shows as
  "Unavailable" with no place or notes, as in Parenthesis. Children's names aren't sent.
- **When:** a background worker copies changes every minute (and straight after connecting), only what changed since
  the last copy. Events from 30 days ago to about 13 months ahead are kept up to date; Google keeps older copies as
  they were. A parent's first copy of a busy calendar is spread over a few minutes (200 writes per parent per pass).
  While the app is scaled to zero nothing runs; changes are copied once it's awake, which it is whenever someone is
  using it.
- **Stopping:** if the parent removes Parenthesis's access in their Google account, or deletes the calendar in Google,
  copying stops and Settings asks them to reconnect. **Disconnect** removes the "Parenthesis Family" calendar from
  their Google account and revokes the access. If a parent deletes their Parenthesis account or leaves the family,
  their connection and token are deleted; the calendar stays in their Google account for them to delete.
- **Tokens:** the refresh token is encrypted with ASP.NET Core data protection (purpose
  `CoParent.Calendar.GoogleCalendar.RefreshToken.v1`) and stored in `calendar.google_connections`. Access tokens live
  in memory only. Neither is logged: the Google HttpClient has no request logging, and Google errors are logged with
  their status code only. Until the data-protection key ring is encrypted with a Key Vault key (TODO.md, Platform
  hardening), the token encryption protects against a leak of that table on its own, not of the whole database.

## 1. Google Cloud (owner, in the Google Cloud console)
Use the existing project `parenthesis-dev` for development. Production can use the same project or its own.

1. **APIs & Services → Library**: enable **Google Calendar API**.
2. **APIs & Services → OAuth consent screen** (now called **Google Auth Platform**):
   - **User type: External.** Publishing status stays **Testing** for development.
   - App name **Parenthesis**, support email and developer contact: the owner's address.
   - **Authorized domains:** `parenthesisfamily.com`.
   - **Data access → Add scopes:** add `.../auth/calendar.app.created` only ("Make secondary Google calendars, and
     see, create, change, and delete events on them").
   - **Audience → Test users:** add each Google account that will try it (up to 100 while unverified). They'll see an
     "unverified app" warning first; that's expected in Testing.
3. **APIs & Services → Credentials → Create credentials → OAuth client ID**:
   - Application type **Web application**, name e.g. `parenthesis-dev-calendar`.
   - **Authorized redirect URIs:** `https://dev.parenthesisfamily.com/settings/google-calendar` (and, for local work,
     `https://localhost:4200/settings/google-calendar`). Production adds `https://parenthesisfamily.com/settings/google-calendar`
     or whatever `App__PublicBaseUrl` is there. It must match exactly.
   - No JavaScript origins are needed: the browser never talks to Google's APIs.
   - Copy the **client ID** and **client secret**. Never paste the secret into chat, issues or commits.
4. **Quotas:** nothing to change. The Calendar API is free, and its default quotas (on the API's **Quotas** page) are
   far above what a few families use.

## 2. Development site (owner, Azure CLI or Cloud Shell)
Same variables as [the Azure runbook](azure-environments.md) (`ENV=dev`, `$RG`, `$KV`).

```bash
az keyvault secret set --vault-name $KV -n google-calendar-client-secret --value "<the client secret>"
az containerapp secret set -g $RG -n ca-parenthesis-$ENV \
  --secrets "google-calendar-client-secret=keyvaultref:https://$KV.vault.azure.net/secrets/google-calendar-client-secret,identityref:system"
az containerapp update -g $RG -n ca-parenthesis-$ENV --set-env-vars \
  GoogleCalendar__ClientId="<the client id>" \
  GoogleCalendar__ClientSecret=secretref:google-calendar-client-secret
```

The client ID isn't secret. To switch the feature off without removing the client:
`--set-env-vars GoogleCalendar__Enabled=false`.

Locally: `dotnet user-secrets set GoogleCalendar:ClientId "<id>"` and `GoogleCalendar:ClientSecret "<secret>"` in
`src/backend/CoParent.Api`.

## 3. Check it works
1. Sign in to the development site as a parent whose Google account is a test user.
2. **Settings → Google Calendar → Connect Google Calendar**. Google shows the unverified-app warning, then asks only to
   "Make secondary Google calendars…". Allow it.
3. Back in Settings it says **Connected**. Within a minute or two Google Calendar shows a "Parenthesis Family" calendar
   with the family's confirmed events.
4. Untick **School** under "Events to copy": school events leave Google Calendar within a minute or two.
5. Edit an event, cancel one, and create a parenting-time request: the edit and cancellation follow within a minute or
   two; the request appears only after the other parent approves it.
6. **Disconnect…** → **Disconnect**: the calendar disappears from Google Calendar, and Parenthesis no longer appears
   under [Google Account → Third-party connections](https://myaccount.google.com/connections).

## 4. Before public launch: Google verification
The Calendar scopes are **sensitive**, so Google must verify the app before anyone outside the test-user list can
connect. It's free and can take days to weeks.
- A public **privacy policy** at a page on `parenthesisfamily.com` that says what Parenthesis sends to Google (confirmed
  event titles, times, places and the parent's own notes) and that it reads nothing back. The privacy notice doesn't
  exist yet (TODO.md).
- The home page and privacy policy on the **verified domain** `parenthesisfamily.com` (Search Console verification by
  the owner).
- A short **demo video** of connecting and of what the scope is used for, and the scope justification: "Parenthesis
  creates one secondary calendar and writes the family's confirmed events to it. It never reads the user's other
  calendars."
- Then **Publish app** on the consent screen and submit for verification.
