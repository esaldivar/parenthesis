#!/usr/bin/env node
// Development workflow automation: weekly PR and Copilot review limits, Discord notices and the weekly status
// report. The rules live in docs/development-workflow.md; this file only implements them.
//
// Commands (run by the workflows in .github/workflows, or locally by Claude Code sessions):
//   pr-limit        Weekly PR limit check for the PR in $GITHUB_EVENT_PATH.
//   copilot-usage   Counts Copilot reviews when one is requested on the PR in $GITHUB_EVENT_PATH.
//   notify-pr       Discord notice for a major or release PR in $GITHUB_EVENT_PATH.
//   weekly-status   Weekly report. Env: PERIOD=last|current, DRY_RUN=true to print instead of sending.
//   usage           Prints this week's PR and Copilot review usage (for Claude before opening a PR).
//   send FILE       Sends FILE's text to Discord (Claude's notice before opening a major PR).
//
// Needs GITHUB_TOKEN (or GH_TOKEN) and GITHUB_REPOSITORY. Discord needs DISCORD_WEBHOOK_URL. Never print the
// webhook URL: error messages here only ever mention the HTTP status.

import { readFileSync, appendFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

export const LIMITS = { prsPerWeek: 3, copilotPerWeek: 6, copilotPerPr: 2 };

/** The limits apply to PRs opened from this moment (Monday, October 19, 2026, 12:00 AM Central). Earlier PRs stay valid. */
export const LIMITS_START = new Date("2026-10-19T05:00:00Z");

export const LABELS = {
  major: "major", // Owner or Claude marks a PR as major.
  notMajor: "not-major", // Turns off automatic major detection (release PRs are still announced).
  extraPr: "owner-approved-pr", // Owner allows a PR beyond the weekly limit.
  extraReview: "owner-approved-review", // Owner allows a Copilot review beyond the limits.
  replacement: "replacement", // Replaces an earlier PR (for example, a renamed branch); not a new PR.
  blocked: "blocked", // A significant risk or blocker.
};

const TIME_ZONE = "America/Chicago";
const GITHUB_API = "https://api.github.com";
const DAY_MS = 24 * 60 * 60 * 1000;
const DISCORD_LIMIT = 1900; // Discord allows 2000 characters per message; keep a margin.
const MARKER = (key) => `<!-- parenthesis-workflow:${key} -->`;

// ---------- Time ----------

function chicagoOffsetMs(date) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone: TIME_ZONE,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    })
      .formatToParts(date)
      .map((p) => [p.type, p.value]),
  );
  const asUtc = Date.UTC(+parts.year, +parts.month - 1, +parts.day, +parts.hour, +parts.minute, +parts.second);
  return asUtc - Math.floor(date.getTime() / 1000) * 1000;
}

/** Monday 12:00 AM America/Chicago at or before `now`, as a Date. */
export function weekStart(now = new Date()) {
  const local = new Date(now.getTime() + chicagoOffsetMs(now)); // UTC fields now read as Chicago time
  const daysSinceMonday = (local.getUTCDay() + 6) % 7;
  const midnight = Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate() - daysSinceMonday);
  // Convert "midnight in Chicago" to UTC. Check the offset at the result too, in case DST changed that weekend
  // (it switches at 2 AM on Sundays, so Monday midnight itself is never ambiguous).
  const first = midnight - chicagoOffsetMs(new Date(midnight));
  return new Date(midnight - chicagoOffsetMs(new Date(first)));
}

/** The week [start, end) containing `now`, or the week before it when `previous` is set. */
export function weekRange(now = new Date(), { previous = false } = {}) {
  const current = weekStart(now);
  const start = previous ? weekStart(new Date(current.getTime() - DAY_MS)) : current;
  const end = previous ? current : weekStart(new Date(current.getTime() + 8 * DAY_MS));
  return { start, end };
}

export function formatChicagoDate(date) {
  return new Intl.DateTimeFormat("en-US", { timeZone: TIME_ZONE, weekday: "short", month: "short", day: "numeric" })
    .format(date);
}

// ---------- Rules ----------

const labelNames = (pr) => (pr.labels ?? []).map((l) => (typeof l === "string" ? l : l.name));
const isBot = (user) => user?.type === "Bot" || /\[bot\]$/.test(user?.login ?? "");
const isPermanent = (ref) => ["main", "develop", "development"].includes(ref) || ref.startsWith("release/");

/** Owner policy (2026-10-20): only release/* -> develop PRs consume the weekly cap. */
export function countsTowardLimit(pr) {
  const base = pr.base.ref;
  const head = pr.head.ref;
  if (new Date(pr.created_at) < LIMITS_START) return { counts: false, reason: "opened before the weekly limits started" };
  if (base !== "develop" || !head.startsWith("release/") || head.length <= "release/".length) {
    return { counts: false, reason: "only release/* source branches targeting develop consume the cap" };
  }
  return { counts: true, reason: "release-branch promotion into develop" };
}

/**
 * Copilot reviews on PRs into develop (releases, hotfixes, back-merges) are requested automatically by the develop
 * ruleset and don't count toward the weekly Copilot limit (owner decision, October 20, 2026). The per-PR limit
 * still applies.
 */
export const copilotWeeklyExempt = (pr) => ["develop", "development"].includes(pr.base?.ref);

export const isCopilot = (login = "") => /^copilot(-pull-request-reviewer)?(\[bot\])?$/i.test(login);

/**
 * Whether a PR is release work: anything into main (production) or a release/x.y.z branch, and a release branch
 * going into develop (the development site). Hotfix syncs and back-merges into develop aren't.
 */
export const targetsRelease = (base, head = "") =>
  base === "main" || base.startsWith("release/") || (["develop", "development"].includes(base) && head.startsWith("release/"));

const MAJOR_PATHS = [
  [/\/Migrations\//, "database migrations"],
  [/CoParent\.Modules\.Identity\/|\/(auth|identity)\/|Authenticat|Authoriz|Antiforgery/i, "authentication or authorization"],
  [/(?:CoParent\.SharedKernel\/Security\/)|(?:(?:^|\/)SECURITY\.md$)/, "security-sensitive code"],
  [/^\.github\/workflows\/|^docker\/|Dockerfile|^compose\.ya?ml$|^infra\/|\.bicep$/, "infrastructure or CI"],
];
const LARGE_FILES = 30;
const LARGE_LINES = 1500;

/** Classifies a PR as major and/or release, with plain-English reasons. `files` are paths. */
export function classifyPr(pr, files = []) {
  const labels = labelNames(pr);
  const release = targetsRelease(pr.base.ref, pr.head.ref);
  const detected = [];
  if (!labels.includes(LABELS.notMajor)) {
    for (const [pattern, why] of MAJOR_PATHS) if (files.some((f) => pattern.test(f))) detected.push(why);
    const lines = (pr.additions ?? 0) + (pr.deletions ?? 0);
    if ((pr.changed_files ?? files.length) >= LARGE_FILES || lines >= LARGE_LINES) detected.push("large change");
  }
  const reasons = [
    ...(release ? [pr.base.ref === "main" ? "release to production" : `targets the release branch ${pr.base.ref}`] : []),
    ...(labels.includes(LABELS.major) ? ["marked major"] : []),
    ...detected,
  ];
  return { release, major: labels.includes(LABELS.major) || detected.length > 0, reasons };
}

// ---------- Messages ----------

/** Splits a PR description into its "## " sections, keyed by lower-case heading, without HTML comments. */
export function parseSections(body = "") {
  const clean = (body ?? "").replace(/<!--[\s\S]*?-->/g, "").replace(/\r/g, "");
  const sections = {};
  for (const chunk of clean.split(/^##\s+/m).slice(1)) {
    const [heading, ...rest] = chunk.split("\n");
    const text = rest
      .map((l) => l.trimEnd())
      .filter((l) => l.trim() && !/^[-*]\s*$/.test(l.trim()) && !/^---+$/.test(l.trim()) && !/^_Generated by/.test(l.trim()))
      .join("\n")
      .trim();
    sections[heading.trim().toLowerCase()] = text;
  }
  return sections;
}

const truncate = (text, max) => (text.length <= max ? text : `${text.slice(0, max - 1).trimEnd()}…`);
const section = (sections, ...names) => {
  for (const name of names) {
    const key = Object.keys(sections).find((k) => k.startsWith(name));
    if (key && sections[key]) return sections[key];
  }
  return "";
};

function checkedItems(text) {
  return text
    .split("\n")
    .filter((l) => /^\s*-\s*\[x\]/i.test(l))
    .map((l) => l.replace(/^\s*-\s*\[x\]\s*/i, "").replace(/^[^\w`(]+/u, "").trim());
}

/** Builds a concise Discord notice from the PR's own template sections. Never includes the diff. */
export function buildPrMessage(pr, classification, kind, { commitTitles = [] } = {}) {
  const s = parseSections(pr.body);
  const plainBody = (pr.body ?? "").replace(/<!--[\s\S]*?-->/g, "").split(/^##\s+/m)[0].trim();
  const headline = {
    "release-candidate": "PARENTHESIS — RELEASE CANDIDATE NEEDS OWNER APPROVAL",
    "release-ready": "PARENTHESIS — RELEASE PR READY",
    "major-ready": "PARENTHESIS — MAJOR PR READY",
    blocked: "PARENTHESIS — MAJOR PR BLOCKED",
    "pr-limit": "PARENTHESIS — WEEKLY PR LIMIT REACHED",
  }[kind];
  const types = checkedItems(section(s, "type of change"));
  const checklist = section(s, "checklist");
  const tests = checkedItems(checklist).filter((l) => /test/i.test(l));
  const testing = section(s, "testing", "tests");
  const lines = [
    `**${headline}**`,
    "",
    `PR: #${pr.number} — ${pr.title}`,
    `Branch: ${pr.head.ref}`,
    `Target: ${pr.base.ref}`,
    `Why: ${classification.reasons.join(", ") || "major change"}`,
  ];
  if (types.length) lines.push(`Type: ${types.join(", ")}`);
  const add = (title, text, max) => text && lines.push("", `**${title}**`, truncate(text, max));
  add("Summary", section(s, "description", "summary") || plainBody, 300);
  const commits = commitTitles.slice(0, 8).map((t) => `- ${t}`).join("\n") + (commitTitles.length > 8 ? `\n- …and ${commitTitles.length - 8} more commits` : "");
  add("Changes", section(s, "summary of changes", "changes") || commits, 500);
  add("Testing", testing || tests.map((t) => `- ${t}`).join("\n") || "Not stated in the PR.", 300);
  add("Risks and known issues", section(s, "risks", "known issues") || "None listed in the PR.", 250);
  add("Outstanding work", section(s, "outstanding") || "None listed in the PR.", 200);
  lines.push("", `Status: ${kind === "blocked" ? "Blocked. Needs the owner's attention." : "Awaiting owner approval. Merging is always manual."}`);
  lines.push(`GitHub: ${pr.html_url}`);
  return truncate(lines.join("\n"), DISCORD_LIMIT);
}

/** Splits long text into Discord-sized messages on line boundaries. */
export function chunk(text, max = DISCORD_LIMIT) {
  const out = [];
  let current = "";
  for (const line of text.split("\n")) {
    const piece = truncate(line, max);
    if (current && current.length + 1 + piece.length > max) {
      out.push(current);
      current = piece;
    } else current = current ? `${current}\n${piece}` : piece;
  }
  if (current) out.push(current);
  return out;
}

// ---------- Discord ----------

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Sends one message. Mentions are disabled so PR text can't ping @everyone. Errors never include the URL. */
export async function sendDiscord(content, { webhookUrl = process.env.DISCORD_WEBHOOK_URL, fetchImpl = fetch } = {}) {
  if (!webhookUrl?.trim()) throw new Error("DISCORD_WEBHOOK_URL is not set, so the Discord notice was not sent.");
  for (let attempt = 1; attempt <= 3; attempt++) {
    let res;
    try {
      res = await fetchImpl(`${webhookUrl.trim()}?wait=true`, {
        method: "POST",
        headers: { "content-type": "application/json", "user-agent": "parenthesis-dev-workflow" },
        body: JSON.stringify({ content, allowed_mentions: { parse: [] } }),
      });
    } catch {
      throw new Error("Could not reach Discord (network error); the notice was not sent.");
    }
    if (res.ok) return true;
    if (res.status === 429 && attempt < 3) {
      const info = await res.json().catch(() => ({}));
      await sleep(Math.min(10, Number(info.retry_after) || 2) * 1000);
      continue;
    }
    throw new Error(`Discord rejected the notice (HTTP ${res.status}); it was not sent.`);
  }
  throw new Error("Discord kept rate-limiting the notice; it was not sent.");
}

export async function sendDiscordLong(text, options) {
  for (const part of chunk(text)) await sendDiscord(part, options);
}

// ---------- GitHub ----------

// Only GitHub's own API: a pagination link from elsewhere, or a path that leaves the API root, is refused.
export function apiUrl(path) {
  const url = new URL(path.startsWith("https://") ? path : `${GITHUB_API}${path}`);
  if (url.origin !== GITHUB_API) {
    throw new Error("Refusing a GitHub API request outside https://api.github.com.");
  }
  return url.href;
}

// The rel="next" target of a GitHub Link header, if any.
export function nextLink(link) {
  for (const part of link.split(",")) {
    const [target, ...params] = part.split(";").map((p) => p.trim());
    if (params.includes('rel="next"') && target.startsWith("<") && target.endsWith(">")) return target.slice(1, -1);
  }
  return undefined;
}

export function github({
  token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN,
  repo = process.env.GITHUB_REPOSITORY,
  fetchImpl = fetch,
} = {}) {
  if (!token) throw new Error("GITHUB_TOKEN (or GH_TOKEN) is not set.");
  if (!repo) throw new Error("GITHUB_REPOSITORY is not set (owner/name).");
  async function request(method, path, body) {
    const url = apiUrl(path);
    const res = await fetchImpl(url, {
      method,
      headers: {
        authorization: `Bearer ${token}`,
        accept: "application/vnd.github+json",
        "x-github-api-version": "2022-11-28",
        "user-agent": "parenthesis-dev-workflow",
        ...(body ? { "content-type": "application/json" } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (!res.ok) throw new Error(`GitHub API ${method} ${url.split("?")[0]} failed: HTTP ${res.status}`);
    return { data: res.status === 204 ? null : await res.json(), link: res.headers.get("link") ?? "" };
  }
  async function* paginate(path) {
    let next = path;
    while (next) {
      const { data, link } = await request("GET", next);
      for (const item of Array.isArray(data) ? data : data.items) yield item;
      next = nextLink(link);
    }
  }
  return {
    repo,
    get: async (path) => (await request("GET", path)).data,
    post: async (path, body) => (await request("POST", path, body)).data,
    paginate,
  };
}

/** Release promotions created in [start, end), oldest first. Reopening never changes created_at.
 * Keep the exported name for existing callers; this is no longer an ordinary development-PR count.
 */
export async function developmentPrs(gh, { start, end }) {
  const found = [];
  for await (const pr of gh.paginate(`/repos/${gh.repo}/pulls?state=all&sort=created&direction=desc&per_page=100`)) {
    const created = new Date(pr.created_at);
    if (created < start) break;
    if (created < end && countsTowardLimit(pr).counts) found.push(pr);
  }
  return found.reverse();
}

/** Copilot reviews: submitted in [start, end) across the repo, plus Copilot requests still pending. */
export async function copilotUsage(gh, { start, end }) {
  const perPr = new Map();
  let used = 0;
  let pending = 0;
  // A review updates its PR, so every PR reviewed since `start` has updated_at >= start.
  for await (const pr of gh.paginate(`/repos/${gh.repo}/pulls?state=all&sort=updated&direction=desc&per_page=100`)) {
    if (new Date(pr.updated_at) < start) break;
    if (copilotWeeklyExempt(pr)) continue;
    const reviews = await allCopilotReviews(gh, pr.number);
    const inWeek = reviews.filter((r) => r.submitted_at && new Date(r.submitted_at) >= start && new Date(r.submitted_at) < end);
    const waiting = pr.state === "open" && (pr.requested_reviewers ?? []).some((u) => isCopilot(u.login)) ? 1 : 0;
    used += inWeek.length;
    pending += waiting;
    if (inWeek.length || waiting) perPr.set(pr.number, { title: pr.title, week: inWeek.length, total: reviews.length, pending: waiting });
  }
  return { used, pending, perPr };
}

export async function allCopilotReviews(gh, number) {
  const reviews = [];
  for await (const r of gh.paginate(`/repos/${gh.repo}/pulls/${number}/reviews?per_page=100`)) if (isCopilot(r.user?.login)) reviews.push(r);
  return reviews;
}

async function prFiles(gh, number) {
  const files = [];
  for await (const f of gh.paginate(`/repos/${gh.repo}/pulls/${number}/files?per_page=100`)) files.push(f.filename);
  return files;
}

async function comments(gh, number) {
  const all = [];
  for await (const c of gh.paginate(`/repos/${gh.repo}/issues/${number}/comments?per_page=100`)) all.push(c);
  return all;
}

const hasMarker = (all, key) => all.some((c) => isBot(c.user) && c.body?.includes(MARKER(key)));

async function commentOnce(gh, number, existing, key, text) {
  if (hasMarker(existing, key)) return false;
  await gh.post(`/repos/${gh.repo}/issues/${number}/comments`, { body: `${text}\n\n${MARKER(key)}` });
  return true;
}

/** True when the label is on the PR and its most recent "labeled" event was by the repository owner. */
export async function ownerApproved(gh, pr, label, owner = process.env.OWNER_LOGIN || gh.repo.split("/")[0]) {
  if (!labelNames(pr).includes(label)) return false;
  let last;
  for await (const e of gh.paginate(`/repos/${gh.repo}/issues/${pr.number}/events?per_page=100`)) {
    if (e.event === "labeled" && e.label?.name === label) last = e;
  }
  return last?.actor?.login?.toLowerCase() === owner.toLowerCase();
}

// ---------- Commands ----------

const event = () => JSON.parse(readFileSync(process.env.GITHUB_EVENT_PATH, "utf8"));
// The job log gets one line: text from a PR (a title, a reason) can't start a new line, so it can't forge a
// `::command::` or a log entry (SonarQube S5145). The step summary keeps the Markdown as written.
export const logLine = (text) => String(text).replace(/[\r\n\u2028\u2029]+/g, " ");
const summary = (text) => {
  console.log(logLine(text));
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${text}\n`);
};

export async function prLimit(gh, number = event().pull_request.number) {
  const pr = await gh.get(`/repos/${gh.repo}/pulls/${number}`);
  const rule = countsTowardLimit(pr);
  if (!rule.counts) return summary(`#${pr.number} doesn't count toward the weekly PR limit: ${rule.reason}.`);
  const week = weekRange(new Date(pr.created_at));
  const prs = await developmentPrs(gh, week);
  const position = prs.findIndex((p) => p.number === pr.number) + 1;
  if (position === 0) throw new Error('PR count changed during verification; rerun the latest event.');
  const limit = LIMITS.prsPerWeek;
  const weekText = `the week of ${formatChicagoDate(week.start)}`;
  summary(`#${pr.number} is release promotion ${position} of ${limit} allowed in ${weekText}.`);
  const existing = await comments(gh, pr.number);
  if (position === limit) {
    await commentOnce(gh, pr.number, existing, "pr-limit-last",
      `ℹ️ This is release promotion ${limit} of ${limit} for ${weekText}. Any further release/* -> develop PR this week needs the owner's \`${LABELS.extraPr}\` label. The limit resets Monday at 12:00 AM Central. See docs/development-workflow.md.`);
  }
  if (position <= limit) return;
  if (await ownerApproved(gh, pr, LABELS.extraPr)) return summary(`Over the limit, but the owner approved it with \`${LABELS.extraPr}\`.`);
  const others = prs.slice(0, position - 1).map((p) => `#${p.number}`).join(", ");
  const posted = await commentOnce(gh, pr.number, existing, "pr-limit-over",
    `⛔ Weekly PR limit reached: this is release promotion ${position}, and the limit is ${limit} per week (${others} came first, ${weekText}). It can stay open, but it shouldn't merge until the owner adds the \`${LABELS.extraPr}\` label or a later promotion is created in a new week. The limit resets Monday at 12:00 AM Central. See docs/development-workflow.md.`);
  if (posted) {
    await sendDiscord(`**PARENTHESIS — WEEKLY PR LIMIT REACHED**\n\nPR: #${pr.number} — ${pr.title}\nBranch: ${pr.head.ref} → ${pr.base.ref}\nThis is release promotion ${position}; the limit is ${limit} per week (${others} came first).\nTo allow it, add the \`${LABELS.extraPr}\` label.\nGitHub: ${pr.html_url}`)
      .catch((e) => summary(`⚠️ ${e.message}`));
  }
  throw new Error(`Weekly PR limit reached (${position} of ${limit}). The owner can allow it with the "${LABELS.extraPr}" label.`);
}

async function copilotCheck(gh) {
  const ev = event();
  if (!isCopilot(ev.requested_reviewer?.login)) return summary("The requested reviewer isn't Copilot; nothing to count.");
  const pr = await gh.get(`/repos/${gh.repo}/pulls/${ev.pull_request.number}`);
  const week = weekRange();
  const usage = await copilotUsage(gh, week);
  const onPr = (await allCopilotReviews(gh, pr.number)).length + 1; // this request included; reopening doesn't reset
  const exempt = copilotWeeklyExempt(pr);
  const weekly = exempt ? usage.used : usage.used + Math.max(usage.pending, 1);
  summary(exempt
    ? `Copilot reviews: this request makes ${onPr} of ${LIMITS.copilotPerPr} on #${pr.number}. PRs into ${pr.base.ref} don't count toward the weekly limit.`
    : `Copilot reviews: this request makes ${onPr} of ${LIMITS.copilotPerPr} on #${pr.number}, and ${weekly} of ${LIMITS.copilotPerWeek} this week.`);
  const existing = await comments(gh, pr.number);
  const over = [];
  if (onPr > LIMITS.copilotPerPr) over.push(`review ${onPr} on this PR (limit ${LIMITS.copilotPerPr}: one initial review and one follow-up)`);
  if (!exempt && weekly > LIMITS.copilotPerWeek) over.push(`review ${weekly} this week (limit ${LIMITS.copilotPerWeek})`);
  if (!over.length) {
    if (!exempt && weekly >= LIMITS.copilotPerWeek - 1) {
      await commentOnce(gh, pr.number, existing, `copilot-week-${weekly}`,
        `ℹ️ Copilot review ${weekly} of ${LIMITS.copilotPerWeek} for this week. Requests beyond ${LIMITS.copilotPerWeek} need the owner's \`${LABELS.extraReview}\` label. The count resets Monday at 12:00 AM Central.`);
    }
    return;
  }
  if (await ownerApproved(gh, pr, LABELS.extraReview)) return summary(`Over the Copilot limit, but the owner approved it with \`${LABELS.extraReview}\`.`);
  const text = `Copilot review limit exceeded: ${over.join("; ")}. GitHub can't cancel a review request once it's made, so this one may still run. Please don't request more without the owner's \`${LABELS.extraReview}\` label.`;
  const posted = await commentOnce(gh, pr.number, existing, `copilot-over-${onPr}-${weekly}`, `⛔ ${text}`);
  if (posted) {
    await sendDiscord(`**PARENTHESIS — COPILOT REVIEW LIMIT EXCEEDED**\n\nPR: #${pr.number} — ${pr.title}\n${text}\nGitHub: ${pr.html_url}`)
      .catch((e) => summary(`⚠️ ${e.message}`));
  }
  throw new Error(text);
}

async function notifyPr(gh) {
  const ev = event();
  const pr = await gh.get(`/repos/${gh.repo}/pulls/${ev.pull_request.number}`);
  if (pr.draft) return summary(`#${pr.number} is a draft; Discord is notified when it's marked ready for review.`);
  if (ev.action === "edited" && !ev.changes?.base) return summary("Only the title or description changed; no notice.");
  const classification = classifyPr(pr, await prFiles(gh, pr.number));
  const justBlocked = ev.action === "labeled" && ev.label?.name === LABELS.blocked;
  if (ev.action === "labeled" && !justBlocked && ![LABELS.major].includes(ev.label?.name)) return summary("This label doesn't change the notice.");
  let kind;
  let key;
  if (justBlocked && (classification.major || classification.release)) [kind, key] = ["blocked", `discord-blocked-${pr.head.sha}`];
  else if (classification.release) {
    kind = pr.base.ref === "main" ? "release-candidate" : "release-ready";
    key = `discord-${kind}-${pr.base.ref}`;
  } else if (classification.major) [kind, key] = ["major-ready", "discord-major-ready"];
  if (!kind) return summary(`#${pr.number} isn't major and doesn't target a release branch; no Discord notice.`);
  const existing = await comments(gh, pr.number);
  if (hasMarker(existing, key)) return summary(`Discord was already notified for this event (${key}); not sending a duplicate.`);
  try {
    const commitTitles = [];
    for await (const c of gh.paginate(`/repos/${gh.repo}/pulls/${pr.number}/commits?per_page=100`)) {
      const title = c.commit.message.split("\n")[0];
      if (!/^Merge (branch|remote-tracking branch|pull request)/.test(title)) commitTitles.push(title);
    }
    await sendDiscord(buildPrMessage(pr, classification, kind, { commitTitles }));
  } catch (e) {
    await gh.post(`/repos/${gh.repo}/issues/${pr.number}/comments`, { body: `⚠️ The Discord notice for this PR failed: ${e.message}` });
    throw e;
  }
  await commentOnce(gh, pr.number, existing, key, `📣 The owner was notified on Discord (${kind.replace("-", " ")}: ${classification.reasons.join(", ")}).`);
  summary(`Sent the ${kind} notice for #${pr.number}.`);
}

export async function weeklyReport(gh, { period = "last", now = new Date() } = {}) {
  const week = weekRange(now, { previous: period === "last" });
  const label = `${formatChicagoDate(week.start)} – ${formatChicagoDate(new Date(week.end.getTime() - 1))}`;
  const lines = [`**PARENTHESIS — WEEKLY DEVELOPMENT STATUS** (${period === "last" ? "last week" : "this week so far"}: ${label})`, ""];
  if (week.start < LIMITS_START) lines.push(`_The weekly limits started ${formatChicagoDate(LIMITS_START)}; earlier PRs aren't counted._`, "");
  const capped = (items, max = 10) => (items.length > max ? [...items.slice(0, max), `- …and ${items.length - max} more`] : items);
  const unavailable = [];

  const prs = await developmentPrs(gh, week);
  lines.push(`**Release promotions created:** ${prs.length} of ${LIMITS.prsPerWeek}${prs.length > LIMITS.prsPerWeek ? " (over the limit)" : ""}`);
  for (const p of prs) lines.push(`- #${p.number} ${p.title}`);
  lines.push(period === "last"
    ? `**Release-promotion allowance this week:** ${LIMITS.prsPerWeek} (reset Monday; unused slots don't roll over)`
    : `**Release-promotion allowance left:** ${Math.max(0, LIMITS.prsPerWeek - prs.length)} of ${LIMITS.prsPerWeek}`);

  try {
    const usage = await copilotUsage(gh, week);
    lines.push(`**Copilot reviews used:** ${usage.used} of ${LIMITS.copilotPerWeek}${usage.pending ? ` (+${usage.pending} requested, not finished)` : ""}`);
    for (const [n, u] of usage.perPr) if (u.total > LIMITS.copilotPerPr) lines.push(`- #${n} has ${u.total} Copilot reviews (limit ${LIMITS.copilotPerPr})`);
    lines.push(period === "last"
      ? `**Copilot allowance this week:** ${LIMITS.copilotPerWeek}`
      : `**Copilot reviews left:** ${Math.max(0, LIMITS.copilotPerWeek - usage.used - usage.pending)} of ${LIMITS.copilotPerWeek}`);
  } catch (e) {
    unavailable.push(`Copilot review count (${e.message})`);
  }

  const open = [];
  for await (const p of gh.paginate(`/repos/${gh.repo}/pulls?state=open&per_page=100`)) open.push(p);
  const awaiting = open.filter((p) => !p.draft);
  lines.push("", `**PRs awaiting review:** ${awaiting.length}`);
  for (const p of awaiting) lines.push(`- #${p.number} ${p.title} (${p.head.ref} → ${p.base.ref})`);

  const merged = [];
  for await (const p of gh.paginate(`/repos/${gh.repo}/pulls?state=closed&sort=updated&direction=desc&per_page=100`)) {
    if (new Date(p.updated_at) < week.start) break;
    if (p.merged_at && new Date(p.merged_at) >= week.start && new Date(p.merged_at) < week.end) merged.push(p);
  }
  const majors = [];
  for (const p of merged) {
    const full = await gh.get(`/repos/${gh.repo}/pulls/${p.number}`);
    const c = classifyPr(full, await prFiles(gh, p.number));
    if (c.major || c.release) majors.push(`- #${p.number} ${p.title} (${c.reasons.join(", ")})`);
  }
  lines.push("", `**Major changes merged:** ${majors.length} (of ${merged.length} PRs merged)`, ...capped(majors));

  // Branches that already have a PR (open, merged or closed) aren't waiting; squash merges keep them "ahead".
  const hadPr = new Set(open.map((p) => p.head.ref));
  for await (const p of gh.paginate(`/repos/${gh.repo}/pulls?state=closed&per_page=100`)) hadPr.add(p.head.ref);
  const waiting = [];
  const branches = [];
  for await (const b of gh.paginate(`/repos/${gh.repo}/branches?per_page=100`)) branches.push(b.name);
  const integration = branches.includes("development") ? "development" : "develop";
  for (const name of branches) {
    if (isPermanent(name) || hadPr.has(name) || !/^(feature|feat|bugfix|fix|chore|docs|design|hotfix)\//.test(name)) continue;
    if (waiting.length >= 15) break;
    try {
      const cmp = await gh.get(`/repos/${gh.repo}/compare/${integration}...${name.split("/").map(encodeURIComponent).join("/")}`);
      const lastCommit = cmp.commits?.at(-1)?.commit?.committer?.date;
      if (cmp.ahead_by > 0 && lastCommit && now - new Date(lastCommit) < 30 * DAY_MS) waiting.push(`- ${name} (${cmp.ahead_by} commits, no PR)`);
    } catch {
      unavailable.push(`comparison for branch ${name}`);
    }
  }
  lines.push("", `**Work waiting for a PR slot:** ${waiting.length}`, ...capped(waiting));

  try {
    const cmp = await gh.get(`/repos/${gh.repo}/compare/main...${integration}`);
    const releasePr = open.find((p) => p.base.ref === "main" && p.head.ref === integration);
    lines.push("", `**Release readiness:** \`${integration}\` has ${cmp.ahead_by} commit(s) that \`main\` doesn't. ${releasePr ? `Release PR #${releasePr.number} is open.` : "No release PR is open."}`);
  } catch (e) {
    unavailable.push(`release comparison (${e.message})`);
  }

  const blockers = [];
  for await (const i of gh.paginate(`/repos/${gh.repo}/issues?state=open&labels=${LABELS.blocked}&per_page=100`)) blockers.push(`- #${i.number} ${i.title}`);
  lines.push("", `**Blockers (\`${LABELS.blocked}\` label):** ${blockers.length}`, ...blockers);

  unavailable.push("Copilot premium-request billing (GitHub doesn't expose it per repository)");
  lines.push("", `_Not available: ${unavailable.join("; ")}._`);
  return lines.join("\n");
}

async function main([command, ...args]) {
  if (command === "send") {
    if (!args[0]) throw new Error("Usage: dev-workflow.mjs send FILE");
    await sendDiscordLong(readFileSync(args[0], "utf8").trim());
    return console.log("Sent to Discord.");
  }
  const gh = github();
  switch (command) {
    case "pr-limit":
      return prLimit(gh);
    case "copilot-usage":
      return copilotCheck(gh);
    case "notify-pr":
      return notifyPr(gh);
    case "weekly-status": {
      const report = await weeklyReport(gh, { period: process.env.PERIOD === "current" ? "current" : "last" });
      summary(report);
      if (process.env.DRY_RUN === "true") return console.log("\n(Dry run: not sent to Discord.)");
      await sendDiscordLong(report);
      return console.log("\nSent to Discord.");
    }
    case "usage": {
      const week = weekRange();
      const prs = await developmentPrs(gh, week);
      const copilot = await copilotUsage(gh, week);
      console.log(`Week of ${formatChicagoDate(week.start)} (resets Monday 12:00 AM Central)`);
      console.log(`Release promotions: ${prs.length} of ${LIMITS.prsPerWeek}${prs.length ? ` (${prs.map((p) => `#${p.number}`).join(", ")})` : ""}`);
      console.log(`Copilot reviews: ${copilot.used} of ${LIMITS.copilotPerWeek}${copilot.pending ? `, plus ${copilot.pending} pending` : ""}`);
      return;
    }
    default:
      throw new Error(`Unknown command "${command}". See the comment at the top of this file.`);
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  main(process.argv.slice(2)).catch((e) => {
    console.error(`::error::${e.message}`);
    process.exitCode = 1;
  });
}
