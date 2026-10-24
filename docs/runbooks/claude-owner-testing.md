# Owner testing and design readiness (#152)

This is an owner-supervised runner change, not an unattended task for the runner to edit itself. Protected path,
owner identity, issue approval, active milestone, priority, blocking, one-run lock, PR-only, CI, security and
no-auto-merge/no-auto-deploy guards remain in force. No live Windows task was started, rescheduled or installed
while preparing this change.

## Flow

Only coding work is managed (owner decision, October 21, 2026): issues with the `claude-implementation` label, or an
owner control record with `work_type:"implementation"`. Umbrella and tracking issues (such as #94, #132 and #152) that
many PRs mention with `Refs` are left alone and never take the testing slot. Design work follows the design rules below.

Merged implementation PRs enter **Ready to Test**, never deployment/Done from merge or main reachability alone.
There is one global waiting slot on Project #2. Other merged work remains **Code Review** and is reconsidered on
each reconciliation. The owner alone moves waiting work to **Test**; one waiting plus one being tested is allowed.
Manual Test moves survive routine sync. New implementation PRs invalidate prior acceptance.

The adapter reads all paginated PRs, issue comments and label events. Plain `Refs #n` tracking lines and explicit
closing lines count; fenced examples, incidental mentions and PR-only numbers do not. Release-promotion PRs do not
start a new implementation cycle. Implementation PRs target `release/*`.

In Test, owner-applied **meets all acceptance criteria** plus a control record bound to the current implementation
revision advances deployable work to **Awaiting Deployment**. Explicit no-deployment work may go directly to Done.
Deployment completion requires the owner's verification record, a successful GitHub Deployment for the declared
development/production environment, and all merged implementation commits reachable from that deployed SHA.
The owner record supplies post-deployment verification; an Actions success or main commit alone is insufficient.
Deployment systems must publish GitHub Deployment/status evidence; without it the card stays open, pending evidence.

**acceptance changes requested** wins over acceptance. In Ready to Test, Test or Awaiting Deployment it removes
stale positive acceptance, moves to Ready For Development and remains attached. Eligible rework ranks before ordinary work but never bypasses queue
approval, milestone, priority or blocking. A shared local run lock is the claim. After confirmed In Development the
runner removes the negative label. Failures restore it and return the issue to Ready For Development. An interrupted
claim has a durable local recovery record. A rework request that can't start yet (no current failure report, an
earlier worktree left for inspection, an open linked PR, a label not applied by the owner, or a design-only record)
is **skipped**, not a stop (owner decision, October 21, 2026): one Discord line says what it needs, sent again only
if the reason changes, and the next approved issue runs. The request keeps waiting until the owner fixes it. Historical merged PRs do not prevent a fresh branch keyed by the new owner label event.

For actionable rework, the owner comment must include **failed**, **expected**, **actual**, and **repro** details
(for example headings), written no earlier than a day before the label: a report from an earlier rework round
doesn't count. All comments reach Claude as untrusted task data (text, author, date and whether the owner wrote it). Report repairs with evidence for every
unresolved criterion. Rework must repeat review and fresh owner acceptance. No details means no claim of repair.

## Owner control records

Run `python scripts/claude_queue_run.py --workflow-plan` from the reviewed checkout. This prints each issue's
`scope` (title/body hash) and `revision` (implementation PR IDs/SHAs/states hash), plus proposed moves and hold reasons.
It needs existing read access through owner-authenticated `gh`; it cannot prove the Windows installation is active.

Owner-authored comments use one exact line, `/queue-control ` followed by JSON. Records must be **new, unedited
comments**; the latest valid full record replaces the prior one. No agent adds one on the owner's behalf. The
scope must match current text; reissue the control after changing requirements. Ticking or unticking checklist
boxes in the issue doesn't change the scope. Comments are not shell commands.
Replace the hash placeholders with preview values:

```text
/queue-control {"scope":"SCOPE_HASH","work_type":"implementation","design_required":false,"requirements_ready":true,"dependencies":[],"ready":true,"deployment":"required"}
```

This explicitly reviewed no-design path can promote Backlog or an accidental In Design card. Missing labels do not
mean no design is needed. For design-required implementation, use `design_required:true`, a `handoff` repository path,
and owner-applied **design approved**. Alternatively specify `design_issue:48` to use explicit owner-accepted linked
design evidence. Dependencies are actual issue numbers and must be closed; missing/invalid dependencies fail closed.
Design-only controls use `work_type:"design"`, `deliverables_accepted:true`, `dependencies:[]`, `deployment:"none"`,
and owner-applied `design approved`. These complete design work without putting it in the coding queue. No execution
or acceptance label is added by a design transition.

For acceptance include `accepted_revision:"REVISION_HASH"` and deployment classification in the full current-scope
record, then apply the positive acceptance label as owner. Label-first and status-first both reconcile. For deployment
verification also include `verified_deployment:123` (actual GitHub Deployment ID) and `environment:"development"`
or `"production"`, after the owner has verified that deployment. A stale/revoked design label or stale scope cannot
grant new readiness. Revocation after coding starts does not silently interrupt an active task: owner review is needed.

## Notification and concurrency behavior

Each actual Ready to Test admission creates a durable outbox record keyed by issue/revision. Failed sends retry;
successful records prevent repeats on ordinary runs. No notification is sent for an unconfirmed status update.
Discord webhooks have no idempotency key: a crash after delivery but before recording success can duplicate a notice;
inspect that rare ambiguous delivery before retrying. This limitation does not affect board admission or acceptance.

Run only **one installed coordinator** using the shared common-git-dir lock. That lock covers board reconciliation,
selection and coding. The runner rechecks the waiting slot immediately before admission. GitHub Projects does not
provide an atomic global capacity constraint: independently installed runners or simultaneous manual admissions are
outside that lock. Do not enable a second coordinator; if the board already exceeds capacity, leave it for owner
resolution rather than moving cards automatically.

## Rollout and smoke test — pending owner supervision

1. Review/merge the draft PR through normal checks. Merging makes code available but does not activate v2.
2. Confirm Ready to Test, Test, In Design and all other existing statuses. Check/create the exact `design approved` and
   acceptance changes requested labels through an owner-approved setup; verify the existing positive label.
3. Inspect Project #2 built-in workflows before activation. Read-only inspection on October 21, 2026 found
   **Pull request merged**, **Auto-close issue**, and **Item closed** disabled. Their saved actions reference
   Ready For Development and must not be enabled unchanged. Recheck Code review approved and other status workflows.
   Record any needed owner changes; never reset all cards or mass-reopen issues.
4. Use isolated fixtures first: `python -B -m unittest discover -s tests -p "test_claude_queue_*.py"` and workflow CI.
5. Run `--workflow-plan` on the owner's machine and review **every** proposed move. Use controlled synthetic issues
   for the #152 smoke sequence: two merged reviews, one waiting slot, manual Test, acceptance label/status ordering,
   failure precedence, priority rework, old merged PR follow-up, comment pagination, stale approval, API/Discord
   failure and restart recovery. Do not use pilot #98 without separate authorization.
6. Before any live reconciliation, obtain the owner's explicit activation approval. In the **installed dedicated
   queue checkout's git common directory**, create `claude-queue/workflow-v2.json` containing:

   ```json
   {"version": 2, "owner_approved": true}
   ```

   This is a local rollout record; never commit it. Do not start or reschedule the task as part of preparation.
   For a supervised board-only smoke test without launching Claude, use `--workflow-apply` after approval. Record
   results before allowing the next scheduled coding run. No end-to-end smoke test is claimed by the mock tests.
7. Keep completed smoke evidence and the approved configuration on #152. The positive acceptance label remains
   the owner's own sign-off. Document applicable deployment environment and proof requirements per work item.

Rollback: pause the task with owner approval; preserve v2 state/outbox/claim records and inspect any active worktree.
Do **not** simply delete the activation record and resume: that would restore legacy merge-to-Done behavior. Pin a
reviewed runner version or fix forward with owner review. Never loosen protected paths, erase PR history or bypass
the testing gate to recover.
