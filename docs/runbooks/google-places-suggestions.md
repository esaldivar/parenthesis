# Address suggestions: Google Places setup (#354)

While a parent types an event's location, Parenthesis can suggest addresses from Google Places Autocomplete (New).
The API asks Google with a server-side key; browsers never see the key and load no Google script. The feature is
**off until `Places__ApiKey` is set**, so an environment without a key behaves as it did before.

Owner decisions (October 29, 2026): suggestions go through our API; a picked suggestion saves its text only (no Place
Details, so only the *Autocomplete Requests* SKU applies); at most **300 requests a Pacific day** (about 9,300 a month,
under the 10,000 a month Google gives free); a **$1 budget alert**.

## What it sends and keeps
- Sent to Google: the text typed so far (at least three characters) and a random session token. Nothing about the
  family, children or events.
- Kept by Parenthesis: nothing. Request logs record only method, path, status and duration; Google errors are logged
  with their status code only.
- Who can ask: signed-in parents of that family, 60 requests a minute each. Children never can.

## Limits, in order
1. **Parenthesis's own daily cap**: `Places__DailyLimit` (default 300) per Pacific day, the day Google's quotas use.
   Once reached, the field quietly works as plain text until midnight Pacific. The count is per running API instance,
   so if the app ever runs more than one replica, lower it to 300 ÷ replicas.
2. **Google's quota**: the hard limit, set below. Parenthesis treats a refusal like "no suggestions".
3. **Budget alert**: an email, not a stop. Google keeps billing if the other limits are missing.

## 1. Google Cloud (owner, in the Google Cloud console)
1. Create or choose a project (e.g. `parenthesis-dev`) and link a billing account. Google requires one even for free
   usage.
2. **APIs & Services → Library**: enable **Places API (New)**. Nothing else is needed: no Maps JavaScript API, no
   Place Details.
3. **APIs & Services → Credentials → Create credentials → API key**. Edit the key:
   - **API restrictions → Restrict key → Places API (New)** only.
   - Application restrictions: leave as *None*, or *IP addresses* with the Container App's outbound IPs
     (`az containerapp show -g $RG -n ca-parenthesis-$ENV --query properties.outboundIpAddresses`). Not *Websites*:
     the key is used by our server, not a browser.
4. **APIs & Services → Places API (New) → Quotas**: find the Autocomplete quota and lower it.
   - If a **per-day** limit is offered, set it to **300**.
   - If only **per-minute** limits are offered, set the Autocomplete one low (e.g. **10 per minute**). Parenthesis's
     daily cap then does the daily limiting.
   Google's quota names change; check the current page, not this list.
5. **Billing → Budgets & alerts → Create budget**: scope it to the project, amount **$1**, alerts at 50%, 90% and 100%
   to the owner's email.
6. Check the free allowance and price on Google's [pricing page](https://developers.google.com/maps/billing-and-pricing/pricing)
   (*Autocomplete Requests*). The figures above were current in October 2026 according to third-party summaries.

## 2. Development site (owner, Azure CLI or Cloud Shell)
Use the same variables as [the Azure runbook](azure-environments.md) (`ENV=dev`, `$RG`, `$KV`). Never paste the key
into chat, issues or commits.

```bash
az keyvault secret set --vault-name $KV -n places-api-key --value "<the key>"
az containerapp secret set -g $RG -n ca-parenthesis-$ENV \
  --secrets "places-api-key=keyvaultref:https://$KV.vault.azure.net/secrets/places-api-key,identityref:system"
az containerapp update -g $RG -n ca-parenthesis-$ENV --set-env-vars Places__ApiKey=secretref:places-api-key Places__DailyLimit=300
```

The app's identity already reads the vault (Azure runbook). To switch suggestions off without removing the key:
`--set-env-vars Places__Enabled=false`.

## 3. Production
Leave `Places__ApiKey` unset until the owner decides; the field is plain text there. Before turning it on, use a
separate key and budget for production and revisit the cap with real usage.

## 4. Check it works
On the development site, add an activity and type part of a synthetic address (e.g. "100 Example"): up to five
suggestions appear with "Google Maps" under them. Picking one fills the field. With the key removed or
`Places__Enabled=false`, the field is plain text and nothing else changes.
