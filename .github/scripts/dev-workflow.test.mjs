// Tests for dev-workflow.mjs. Run: node --test .github/scripts/
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  LIMITS,
  weekStart,
  weekRange,
  countsTowardLimit,
  classifyPr,
  isCopilot,
  parseSections,
  buildPrMessage,
  chunk,
  sendDiscord,
  developmentPrs,
  ownerApproved,
} from "./dev-workflow.mjs";

const iso = (d) => d.toISOString();
const pr = (over = {}) => ({
  number: 70,
  title: "Add calendar export",
  created_at: "2026-10-20T15:00:00Z",
  user: { login: "esaldivar", type: "User" },
  base: { ref: "develop" },
  head: { ref: "feature/calendar-export" },
  labels: [],
  additions: 120,
  deletions: 10,
  changed_files: 4,
  html_url: "https://github.com/example/repo/pull/70",
  body: "",
  ...over,
});

test("limits match the owner's brief", () => {
  assert.deepEqual(LIMITS, { prsPerWeek: 3, copilotPerWeek: 6, copilotPerPr: 2 });
});

test("week starts Monday 12:00 AM Central in daylight time (UTC-5)", () => {
  assert.equal(iso(weekStart(new Date("2026-10-21T12:00:00Z"))), "2026-10-19T05:00:00.000Z");
  // Sunday 11:59 PM Central still belongs to the previous week.
  assert.equal(iso(weekStart(new Date("2026-10-26T04:59:00Z"))), "2026-10-19T05:00:00.000Z");
  // Monday 12:00 AM Central starts the new week.
  assert.equal(iso(weekStart(new Date("2026-10-26T05:00:00Z"))), "2026-10-26T05:00:00.000Z");
});

test("week starts Monday 12:00 AM Central in standard time (UTC-6), across the DST change", () => {
  // DST ends Sunday, November 1, 2026.
  assert.equal(iso(weekStart(new Date("2026-11-04T12:00:00Z"))), "2026-11-02T06:00:00.000Z");
  assert.equal(iso(weekStart(new Date("2026-11-02T05:30:00Z"))), "2026-10-26T05:00:00.000Z"); // Sunday 11:30 PM CST
  // DST starts Sunday, March 14, 2027.
  assert.equal(iso(weekStart(new Date("2027-03-17T12:00:00Z"))), "2027-03-15T05:00:00.000Z");
});

test("previous week range ends where the current week starts", () => {
  const { start, end } = weekRange(new Date("2026-11-04T12:00:00Z"), { previous: true });
  assert.equal(iso(start), "2026-10-26T05:00:00.000Z");
  assert.equal(iso(end), "2026-11-02T06:00:00.000Z");
});

test("development PRs count; releases, back-merges, hotfixes, bots and replacements don't", () => {
  assert.equal(countsTowardLimit(pr()).counts, true);
  assert.equal(countsTowardLimit(pr({ base: { ref: "release/0.2.0" } })).counts, true);
  assert.equal(countsTowardLimit(pr({ base: { ref: "main" }, head: { ref: "develop" } })).counts, false);
  assert.equal(countsTowardLimit(pr({ base: { ref: "development" }, head: { ref: "release/0.2.0" } })).counts, false);
  assert.equal(countsTowardLimit(pr({ head: { ref: "chore/sync-main" } })).counts, false);
  assert.equal(countsTowardLimit(pr({ base: { ref: "main" }, head: { ref: "hotfix/login" } })).counts, false);
  assert.equal(countsTowardLimit(pr({ user: { login: "dependabot[bot]", type: "Bot" } })).counts, false);
  assert.equal(countsTowardLimit(pr({ labels: [{ name: "replacement" }] })).counts, false);
});

test("PRs opened before the limits started stay valid and don't count", () => {
  assert.equal(countsTowardLimit(pr({ created_at: "2026-10-17T12:17:46Z" })).counts, false);
});

test("Copilot is recognised as a requested reviewer and as a review author", () => {
  assert.equal(isCopilot("Copilot"), true);
  assert.equal(isCopilot("copilot-pull-request-reviewer[bot]"), true);
  assert.equal(isCopilot("copilot-fan"), false);
  assert.equal(isCopilot("esaldivar"), false);
});

test("classification: migrations, auth, security and infrastructure are major", () => {
  const cases = [
    ["src/backend/Modules/CoParent.Modules.Calendar/Infrastructure/Migrations/20261020_Add.cs", "database migrations"],
    ["src/frontend/src/app/core/auth/session.service.ts", "authentication or authorization"],
    ["src/backend/Modules/CoParent.Modules.Identity/Endpoints/Login.cs", "authentication or authorization"],
    ["src/backend/CoParent.SharedKernel/Security/TenantGuard.cs", "security-sensitive code"],
    [".github/workflows/ci.yml", "infrastructure or CI"],
    ["docker/api.Dockerfile", "infrastructure or CI"],
  ];
  for (const [file, reason] of cases) {
    const c = classifyPr(pr(), [file]);
    assert.equal(c.major, true, file);
    assert.ok(c.reasons.includes(reason), `${file}: ${c.reasons}`);
  }
});

test("classification: a small UI change isn't major; a large one is", () => {
  assert.equal(classifyPr(pr(), ["src/frontend/src/app/features/calendar/day.component.ts"]).major, false);
  assert.equal(classifyPr(pr({ additions: 1400, deletions: 200 }), ["src/a.ts"]).major, true);
  assert.equal(classifyPr(pr({ changed_files: 31 }), ["src/a.ts"]).major, true);
});

test("classification: labels force or suppress major; release targets always notify", () => {
  assert.equal(classifyPr(pr({ labels: [{ name: "major" }] }), ["README.md"]).major, true);
  assert.equal(classifyPr(pr({ labels: [{ name: "not-major" }] }), [".github/workflows/ci.yml"]).major, false);
  const release = classifyPr(pr({ base: { ref: "main" }, head: { ref: "develop" }, labels: [{ name: "not-major" }] }), ["README.md"]);
  assert.equal(release.release, true);
  assert.ok(release.reasons.includes("release to production"));
  assert.equal(classifyPr(pr({ base: { ref: "release/0.2.0" } }), ["README.md"]).release, true);
  assert.equal(classifyPr(pr(), ["README.md"]).release, false);
  // develop is the development site: a release branch going into it is release work; a hotfix sync isn't.
  assert.equal(classifyPr(pr({ head: { ref: "release/0.2.0" } }), ["README.md"]).release, true);
  assert.equal(classifyPr(pr({ head: { ref: "chore/sync-main" } }), ["README.md"]).release, false);
});

const templateBody = `## Description
<!-- One or two sentences -->
Lets a parent export the shared calendar.

## Summary of changes
<!-- A short bullet list -->
- New export endpoint.
- Download button on the calendar.

## Type of change
- [x] ✨ Feature
- [ ] 🐛 Bug fix

## Checklist
- [x] Tests added or updated, and they pass locally (unit 12/12)
- [ ] Checked at phone size

## Risks and known issues
- Large calendars export slowly.

---
_Generated by [Claude Code](https://claude.ai/code)_`;

test("PR sections are parsed without HTML comments, placeholders or footers", () => {
  const s = parseSections(templateBody);
  assert.equal(s.description, "Lets a parent export the shared calendar.");
  assert.equal(s["summary of changes"], "- New export endpoint.\n- Download button on the calendar.");
  assert.equal(s["risks and known issues"], "- Large calendars export slowly.");
});

test("the Discord message has every required field and stays under Discord's limit", () => {
  const p = pr({ body: templateBody });
  const msg = buildPrMessage(p, classifyPr(p, ["src/frontend/src/app/core/auth/x.ts"]), "major-ready");
  for (const part of [
    "PARENTHESIS — MAJOR PR READY",
    "PR: #70 — Add calendar export",
    "Branch: feature/calendar-export",
    "Target: develop",
    "Why: authentication or authorization",
    "Type: Feature",
    "Lets a parent export",
    "- New export endpoint.",
    "Tests added or updated, and they pass locally (unit 12/12)",
    "Large calendars export slowly.",
    "Outstanding work",
    "Status: Awaiting owner approval",
    "GitHub: https://github.com/example/repo/pull/70",
  ]) assert.ok(msg.includes(part), `missing: ${part}\n${msg}`);
  const huge = buildPrMessage(pr({ body: `## Summary of changes\n${"- x\n".repeat(3000)}` }), { reasons: ["large change"] }, "major-ready");
  assert.ok(huge.length <= 2000);
});

test("release PRs into main are announced as release candidates needing approval", () => {
  const p = pr({ base: { ref: "main" }, head: { ref: "develop" }, title: "Release 0.2.0" });
  const msg = buildPrMessage(p, classifyPr(p, []), "release-candidate");
  assert.match(msg, /RELEASE CANDIDATE NEEDS OWNER APPROVAL/);
  assert.match(msg, /Not stated in the PR\./);
});

test("long reports are split on line boundaries under Discord's limit", () => {
  const parts = chunk(Array.from({ length: 300 }, (_, i) => `- line ${i}`).join("\n"));
  assert.ok(parts.length > 1);
  for (const p of parts) assert.ok(p.length <= 1900);
  assert.equal(parts.join("\n").split("\n").length, 300);
});

test("Discord: mentions are disabled and errors never reveal the webhook URL", async () => {
  const secret = "https://discord.com/api/webhooks/123/SECRET-TOKEN";
  let sent;
  await sendDiscord("@everyone hello", {
    webhookUrl: secret,
    fetchImpl: async (url, init) => ((sent = { url, body: JSON.parse(init.body) }), { ok: true, status: 200 }),
  });
  assert.deepEqual(sent.body.allowed_mentions, { parse: [] });
  assert.match(sent.url, /\?wait=true$/);

  await assert.rejects(
    sendDiscord("x", { webhookUrl: secret, fetchImpl: async () => ({ ok: false, status: 404 }) }),
    (e) => /HTTP 404/.test(e.message) && !e.message.includes("SECRET-TOKEN"),
  );
  await assert.rejects(
    sendDiscord("x", { webhookUrl: secret, fetchImpl: async () => { throw new Error(`fetch failed ${secret}`); } }),
    (e) => !e.message.includes("SECRET-TOKEN"),
  );
  await assert.rejects(sendDiscord("x", { webhookUrl: "" }), /not set/);
});

const fakeGh = (pages) => ({
  repo: "example/repo",
  async *paginate(path) {
    for (const [prefix, items] of pages) if (path.startsWith(prefix)) yield* items;
  },
});

test("weekly PR count uses creation time, oldest first, and skips what doesn't count", async () => {
  const prs = [
    pr({ number: 9, created_at: "2026-10-23T12:00:00Z" }),
    pr({ number: 8, created_at: "2026-10-22T12:00:00Z", head: { ref: "chore/sync-main" } }),
    pr({ number: 7, created_at: "2026-10-21T12:00:00Z", state: "closed" }), // reopening/closing doesn't matter
    pr({ number: 6, created_at: "2026-10-20T12:00:00Z" }),
    pr({ number: 5, created_at: "2026-10-18T12:00:00Z" }), // previous week: stops the scan
  ];
  const gh = fakeGh([["/repos/example/repo/pulls", prs]]);
  const found = await developmentPrs(gh, weekRange(new Date("2026-10-21T00:00:00Z")));
  assert.deepEqual(found.map((p) => p.number), [6, 7, 9]);
});

test("only the owner's label counts as approval", async () => {
  const labeled = pr({ labels: [{ name: "owner-approved-pr" }] });
  const byOwner = fakeGh([["/repos/example/repo/issues/70/events", [{ event: "labeled", label: { name: "owner-approved-pr" }, actor: { login: "Example" } }]]]);
  const bySomeoneElse = fakeGh([["/repos/example/repo/issues/70/events", [
    { event: "labeled", label: { name: "owner-approved-pr" }, actor: { login: "example" } },
    { event: "unlabeled", label: { name: "owner-approved-pr" }, actor: { login: "example" } },
    { event: "labeled", label: { name: "owner-approved-pr" }, actor: { login: "claude-bot" } },
  ]]]);
  assert.equal(await ownerApproved(byOwner, labeled, "owner-approved-pr", "example"), true);
  assert.equal(await ownerApproved(bySomeoneElse, labeled, "owner-approved-pr", "example"), false);
  assert.equal(await ownerApproved(byOwner, pr(), "owner-approved-pr", "example"), false);
});
