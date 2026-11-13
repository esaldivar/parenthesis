# Data breach response

What to do if family data may have been seen, changed or taken by someone who shouldn't have it. Owner decision D9 of
[the medication preflight](../privacy/medication-preflight-127.md), November 12, 2026. It covers all data, and
especially health information: allergies, medical providers and medication in Child Essentials.

This is a checklist, not legal advice. Which rules apply, and their deadlines, are confirmed with a lawyer (D2) before
medication reaches production.

## 1. Contain (first hours)

- Stop the exposure: revoke leaked secrets in Key Vault, roll the database password, scale the app to zero or block
  ingress if needed (see [azure-environments.md](azure-environments.md)).
- Keep evidence: don't delete container logs, audit records or the database. Note the time you found the problem.
- Write down what happened as it happens, with times, in a private GitHub issue or a local file. Never put family
  data in that record.

## 2. Assess (first days)

- Which families, which data, which period? Use audit records (ids, no content) and logs.
- Was health information involved (allergies, medical providers, medication)?
- How many people, and which states do they live in? Several rules count people per state.
- Was the data encrypted and the key safe? Some rules don't count encrypted data whose key wasn't exposed.

## 3. Decide who to tell (with a lawyer)

Rules to check, with the lawyer, for the facts found in step 2:

- **FTC Health Breach Notification Rule** (16 CFR 318), if it applies (preflight question). It sets deadlines for
  telling affected people, the FTC and, for larger breaches, the media, counted from discovery.
- **State breach-notification laws**, where the affected people live. Deadlines and who to notify differ by state;
  Washington and Nevada are named in the preflight.
- **Washington and Nevada consumer health data laws**, if they apply.
- **Google API Services**, if Google tokens were exposed: revoke them and follow Google's process.

## 4. Notify and follow up

- Tell affected parents in plain language: what happened, what data, what we've done, what they can do, and how to
  reach `privacy@parenthesisfamily.com`. Don't name children or include the exposed data in the message.
- Notify regulators the lawyer identified, within their deadlines.
- Fix the cause in a `hotfix/…` branch, following [the release security gate](sonar-release-gate.md).
- Record the incident, decisions and notices sent in the tracking issue, and add follow-ups to `TODO.md`.
