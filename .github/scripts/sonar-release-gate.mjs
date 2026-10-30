#!/usr/bin/env node
// Release security gate: decides whether a release candidate (a PR into main) may ship, from SonarQube Cloud's
// analysis of that exact candidate. The policy lives in docs/runbooks/sonar-release-gate.md; this file only
// implements it. Run by the "Release security gate" job in .github/workflows/sonar.yml, after the analysis.
//
// Env:
//   SONAR_TOKEN        SonarQube Cloud token with Browse permission on the project (secret, never printed).
//   SONAR_PROJECT_KEY  Project key, e.g. esaldivar_parenthesis.
//   SONAR_CE_TASK_ID   The background task of the analysis to check (from the scanner's report-task.txt).
//   SONAR_JOB_RESULT   Result of the analysis job ("success" expected).
//   PR_NUMBER          The PR being checked. Empty after a merge (post-merge check of the branch itself).
//   BASE_BRANCH        SonarQube Cloud's main branch. Defaults to main; the workflow passes develop (#373).
//   SONAR_HOST_URL     Defaults to https://sonarcloud.io.
//   SONAR_RELEASE_MODE "bound" for releases into GitHub's main (#373): see boundAnalysis. Empty: check this run's scan.
//   SONAR_BIND_ONLY    "true" with bound mode: only find and verify the analysis (the "SonarQube Cloud" job).
//
// Why bound mode (#373, owner decision October 29, 2026): on SonarQube Cloud's Free plan only the project's main
// branch, now develop, and PRs into it can be analysed. A PR into GitHub's main (develop -> main) or a push to main
// can't be scanned, so the gate reuses develop's latest analysis, and only when the release's code is identical to
// that analysed commit (same git tree). Anything else, including develop moving on during the check, fails.
//
// Anything unexpected (missing settings, API errors, timeouts, an unknown answer) fails the gate: a release is only
// allowed when every check positively passed.

import { appendFileSync, existsSync, readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { isAbsolute, normalize } from "node:path";
import { pathToFileURL } from "node:url";

export const POLICY = {
  // Current (MQR) impact severities that block when the impact is on SECURITY. Legacy CRITICAL maps to HIGH.
  blockingImpactSeverities: ["BLOCKER", "HIGH"],
  // Only used when an issue carries no impacts at all (legacy-only answer).
  blockingLegacySeverities: ["BLOCKER", "CRITICAL"],
  // Hotspots already on main that still need review block at this probability; lower ones are warnings.
  blockingHotspotProbabilities: ["HIGH"],
};

// issueStatus values (current model). Anything not known to be closed counts as open, so a new status fails closed.
const CLOSED_STATUSES = ["FIXED", "ACCEPTED", "FALSE_POSITIVE"];
const ACCEPTED_STATUSES = ["ACCEPTED", "FALSE_POSITIVE"];
// Legacy resolution values, only used when an answer has no issueStatus ("WONTFIX" is the legacy name for Accepted).
const ACCEPTED_RESOLUTIONS = ["WONTFIX", "FALSE-POSITIVE"];
const PAGE_SIZE = 500;
const MAX_RESULTS = 10000; // SonarQube's search APIs stop paging here.

export class GateError extends Error {}

// ---------- SonarQube Cloud API ----------

function describeHttpError(path, status, body) {
  const detail = (() => {
    try {
      return (JSON.parse(body).errors ?? []).map((e) => e.msg).join("; ");
    } catch {
      return "";
    }
  })();
  const hint =
    {
      400: "SonarQube Cloud rejected the request. The Web API may have changed; check the parameters in sonar-release-gate.mjs.",
      401: "SONAR_TOKEN is missing, invalid or expired. Generate a new token and update the repository secret.",
      403: "SONAR_TOKEN lacks Browse permission on the project.",
      404: "The project, pull request or analysis wasn't found. Check SONAR_PROJECT_KEY and that the analysis ran.",
      429: "SonarQube Cloud rate-limited the request. Re-run the job in a few minutes.",
    }[status] ?? "SonarQube Cloud is unavailable. Re-run the job later; check https://status.sonarcloud.io.";
  return `SonarQube Cloud API ${path} answered HTTP ${status}${detail ? ` (${detail})` : ""}. ${hint}`;
}

export function sonarClient({
  token,
  hostUrl = "https://sonarcloud.io",
  fetchImpl = fetch,
  timeoutMs = 30_000,
  retries = 2,
  sleep = (ms) => new Promise((r) => setTimeout(r, ms)),
}) {
  let host = hostUrl;
  while (host.endsWith("/")) host = host.slice(0, -1);
  const api = `${host}/api`;

  async function get(path, params = {}) {
    const query = new URLSearchParams(Object.entries(params).filter(([, v]) => v !== undefined && v !== ""));
    const url = `${api}/${path}?${query}`;
    let lastError;
    for (let attempt = 0; attempt <= retries; attempt++) {
      if (attempt > 0) await sleep(2000 * 2 ** (attempt - 1));
      let res;
      try {
        res = await fetchImpl(url, {
          // The token as the Basic-auth user, as the Sonar Sunday workflow already does successfully (curl -u "$SONAR_TOKEN:").
          headers: { Authorization: `Basic ${Buffer.from(`${token}:`).toString("base64")}`, Accept: "application/json" },
          signal: AbortSignal.timeout(timeoutMs),
        });
      } catch (e) {
        const reason = e?.name === "TimeoutError" ? `timed out after ${timeoutMs / 1000}s` : "could not be reached";
        lastError = new GateError(`SonarQube Cloud API ${path} ${reason}. Re-run the job; if it persists, check https://status.sonarcloud.io.`);
        continue;
      }
      const body = await res.text();
      if (res.ok) {
        try {
          return JSON.parse(body);
        } catch {
          throw new GateError(`SonarQube Cloud API ${path} returned something that isn't JSON.`);
        }
      }
      lastError = new GateError(describeHttpError(path, res.status, body));
      if (res.status !== 429 && res.status < 500) break; // Client errors don't get better by retrying.
    }
    throw lastError;
  }

  /** Every result of a paged search API (issues/search, hotspots/search). */
  async function all(path, params, listKey) {
    const items = [];
    for (let page = 1; ; page++) {
      const data = await get(path, { ...params, ps: PAGE_SIZE, p: page });
      const list = data[listKey];
      if (!Array.isArray(list)) throw new GateError(`SonarQube Cloud API ${path} answered without "${listKey}".`);
      const total = data.paging?.total ?? data.total;
      if (typeof total !== "number") throw new GateError(`SonarQube Cloud API ${path} answered without a result count.`);
      if (total > MAX_RESULTS) throw new GateError(`SonarQube Cloud API ${path} has ${total} results, more than the gate can page through.`);
      items.push(...list);
      if (items.length >= total || list.length === 0) return items;
    }
  }

  return { get, all };
}

/** Waits for the analysis' background task, so the gate reads results for exactly this release candidate. */
export async function waitForAnalysis(client, taskId, {
  projectKey,
  pullRequest,
  timeoutMs = 5 * 60_000,
  intervalMs = 5000,
  sleep = (ms) => new Promise((r) => setTimeout(r, ms)),
  now = () => Date.now(),
} = {}) {
  const deadline = now() + timeoutMs;
  for (;;) {
    const { task } = await client.get("ce/task", { id: taskId });
    if (!task) throw new GateError("SonarQube Cloud's ce/task answer had no task.");
    if (task.status === "SUCCESS") {
      if (projectKey && task.componentKey !== projectKey) {
        throw new GateError(`The analysis belongs to ${task.componentKey ?? "an unknown project"}, not ${projectKey}.`);
      }
      if (pullRequest && String(task.pullRequest ?? "") !== String(pullRequest)) {
        throw new GateError(`The analysis is for ${task.pullRequest ? `PR #${task.pullRequest}` : `branch ${task.branch ?? "unknown"}`}, not PR #${pullRequest}.`);
      }
      if (!task.analysisId) throw new GateError("The analysis finished without an analysis id.");
      return task.analysisId;
    }
    if (task.status === "FAILED" || task.status === "CANCELED") {
      throw new GateError(`SonarQube Cloud couldn't process the analysis (task ${task.status}${task.errorMessage ? `: ${task.errorMessage}` : ""}).`);
    }
    if (task.status !== "PENDING" && task.status !== "IN_PROGRESS") {
      throw new GateError(`Unknown analysis task status "${task.status}".`);
    }
    if (now() >= deadline) {
      throw new GateError(`SonarQube Cloud didn't finish processing the analysis within ${timeoutMs / 60_000} minutes. Re-run the job.`);
    }
    await sleep(intervalMs);
  }
}

/**
 * Bound mode (#373): the analysis of `branch` (develop) whose code is identical to the release candidate. Takes the
 * branch's latest analysis only, because issue and hotspot searches always answer for a branch's latest state.
 * `treeOf(commit)` returns the commit's git tree hash, or null when it can't be read.
 */
export async function boundAnalysis(client, { projectKey, branch, candidateTree, treeOf }) {
  if (!/^[0-9a-f]{40}$/.test(candidateTree ?? "")) throw new GateError("The release candidate's code tree couldn't be read.");
  const data = await client.get("project_analyses/search", { project: projectKey, branch, ps: 1 });
  const latest = Array.isArray(data.analyses) ? data.analyses[0] : undefined;
  if (!latest?.key) {
    throw new GateError(`SonarQube Cloud has no analysis of \`${branch}\`. Push to ${branch}, or re-run its Sonar workflow, first.`);
  }
  if (!/^[0-9a-f]{40}$/.test(latest.revision ?? "")) {
    throw new GateError(`SonarQube Cloud's latest analysis of \`${branch}\` has no commit to compare with this release.`);
  }
  const analysedTree = treeOf(latest.revision);
  if (!analysedTree) throw new GateError(`Commit ${latest.revision.slice(0, 7)}, analysed on \`${branch}\`, couldn't be read from the repository.`);
  if (analysedTree !== candidateTree) {
    throw new GateError(
      `This release's code isn't identical to the code SonarQube Cloud last analysed on \`${branch}\` (commit ` +
        `${latest.revision.slice(0, 7)}). Release exactly what ${branch} holds: bring main into ${branch} first (a sync PR), ` +
        `or wait for ${branch}'s analysis to finish, then re-run. A hotfix must reach ${branch} first.`,
    );
  }
  return { analysisId: latest.key, revision: latest.revision };
}

/** The latest analysis of `branch` is still `analysisId`: nothing newer replaced the state the searches read. */
export async function stillLatest(client, { projectKey, branch, analysisId }) {
  const data = await client.get("project_analyses/search", { project: projectKey, branch, ps: 1 });
  if (data.analyses?.[0]?.key !== analysisId) {
    throw new GateError(`A newer analysis of \`${branch}\` arrived during the check, so its results may not match this release. Re-run the job.`);
  }
}

// ---------- Policy ----------

const securityImpacts = (issue) => (issue.impacts ?? []).filter((i) => i.softwareQuality === "SECURITY");

/** "block", "warn" or null (not a security finding), for an issue regardless of its status. */
export function classifyIssue(issue) {
  if (issue.type === "VULNERABILITY") return "block"; // Every vulnerability blocks, whatever its severity.
  const impacts = securityImpacts(issue);
  if (impacts.some((i) => POLICY.blockingImpactSeverities.includes(i.severity))) return "block";
  if (impacts.length > 0) return "warn";
  return null;
}

/** Open unless SonarQube says it's fixed, accepted or a false positive. Unknown statuses count as open. */
export function isOpen(issue) {
  if (issue.issueStatus) return !CLOSED_STATUSES.includes(issue.issueStatus);
  return !issue.resolution && issue.status !== "CLOSED" && issue.status !== "RESOLVED";
}

export function isAccepted(issue) {
  if (issue.issueStatus) return ACCEPTED_STATUSES.includes(issue.issueStatus);
  return ACCEPTED_RESOLUTIONS.includes(issue.resolution);
}

/**
 * A justification is at least one non-empty comment on the finding in SonarQube Cloud. Returns null when the answer
 * carries no comment list at all, so the caller can say the comments couldn't be read (still blocking).
 */
export function hasJustification(comments) {
  if (!Array.isArray(comments)) return null;
  return comments.some((c) => `${c?.markdown ?? c?.htmlText ?? ""}`.trim().length > 0);
}

const noJustification = (verdict, what) =>
  verdict === null
    ? `${what}, and SonarQube Cloud didn't return its comments, so the justification can't be checked`
    : `${what} without a comment explaining why`;

export function severityLabel(issue) {
  const impact = securityImpacts(issue)
    .map((i) => i.severity)
    .join("/");
  return impact ? `${impact} security` : `${issue.severity ?? "UNKNOWN"} (legacy severity)`;
}

export const filePath = (component = "") => component.slice(component.indexOf(":") + 1);

const squashLines = (text) => text.split("\n").map((line) => line.replace(/\s+/g, ""));

/** Whether `needle` appears in `haystack` as consecutive lines (both already whitespace-free). */
function containsLines(haystack, needle) {
  for (let i = 0; i + needle.length <= haystack.length; i++) {
    if (needle.every((line, j) => haystack[i + j] === line)) return true;
  }
  return false;
}

/**
 * Whether the release candidate changes the exact code a finding on main points at: its file is deleted, or the
 * flagged lines (ignoring whitespace, compared as whole lines) no longer appear in the candidate's copy. Such findings are expected to close
 * when main is re-analysed after the merge, and the post-merge run of this gate checks that they did.
 */
export function changedInCandidate(finding, { readBase, readCandidate }) {
  const path = filePath(finding.component);
  const start = finding.textRange?.startLine ?? finding.line;
  const end = finding.textRange?.endLine ?? start;
  const base = readBase(path);
  if (base === null) return false; // Can't compare, so it isn't counted as fixed.
  const candidate = readCandidate(path);
  if (candidate === null) return true; // File deleted by the release.
  if (!start) return false; // File-level finding: only deleting the file counts.
  const flagged = squashLines(base).slice(start - 1, end);
  if (flagged.every((line) => !line)) return false;
  return !containsLines(squashLines(candidate), flagged);
}

// ---------- The gate ----------

export async function evaluate({
  client,
  projectKey,
  analysisId,
  pullRequest,
  baseBranch = "main",
  hostUrl = "https://sonarcloud.io",
  readBase,
  readCandidate,
}) {
  const blocking = [];
  const warnings = [];
  const fixed = [];
  const candidateScope = pullRequest ? { pullRequest } : { branch: baseBranch };
  const scopeQuery = (scope) => (scope.pullRequest ? `pullRequest=${scope.pullRequest}` : `branch=${scope.branch}`);
  const issueLink = (scope, key) => `${hostUrl}/project/issues?id=${projectKey}&${scopeQuery(scope)}&open=${key}`;
  const hotspotLink = (scope, key) => `${hostUrl}/project/security_hotspots?id=${projectKey}&${scopeQuery(scope)}&hotspots=${key}`;
  const where = (f) => `\`${filePath(f.component)}${f.line ? `:${f.line}` : ""}\``;

  // 1. Quality gate of this exact analysis.
  const { projectStatus } = await client.get("qualitygates/project_status", { analysisId });
  const gateStatus = projectStatus?.status;
  if (gateStatus !== "OK") {
    const failed = (projectStatus?.conditions ?? [])
      .filter((c) => c.status !== "OK")
      .map((c) => `\`${c.metricKey}\` is ${c.actualValue ?? "n/a"} (needs ${c.comparator === "GT" ? "≤" : "≥"} ${c.errorThreshold})`);
    blocking.push(
      `**Quality gate is ${gateStatus ?? "unknown"}**${failed.length ? `: ${failed.join(", ")}` : ""}. ` +
        `[Open the analysis](${hostUrl}/summary/new_code?id=${projectKey}&${scopeQuery(candidateScope)}).`,
    );
  }

  // Security issues in a scope, by status filter. Two searches, so both the current and the legacy model are covered.
  async function securityIssues(scope, statusParams) {
    const params = { componentKeys: projectKey, ...scope, ...statusParams, additionalFields: "comments" };
    const byKey = new Map();
    for (const extra of [{ impactSoftwareQualities: "SECURITY" }, { types: "VULNERABILITY" }]) {
      for (const issue of await client.all("issues/search", { ...params, ...extra }, "issues")) byKey.set(issue.key, issue);
    }
    return [...byKey.values()];
  }

  const describe = (issue, scope) =>
    `**${severityLabel(issue)}** ${(issue.type ?? "issue").toLowerCase().replace(/_/g, " ")}: ${issue.message} — ${where(issue)} ` +
    `(\`${issue.rule}\`, [open](${issueLink(scope, issue.key)}))`;

  // 2. Open security issues in the release candidate (new code in the PR, or all of main after a merge).
  for (const issue of await securityIssues(candidateScope, { resolved: "false" })) {
    if (!isOpen(issue)) continue;
    const verdict = classifyIssue(issue);
    if (verdict === "block") blocking.push(describe(issue, candidateScope));
    else if (verdict === "warn") warnings.push(describe(issue, candidateScope));
  }

  // 3. Security issues already on main: they ship with the release unless the release removes the flagged code.
  const baseScope = { branch: baseBranch };
  if (pullRequest) {
    for (const issue of await securityIssues(baseScope, { resolved: "false" })) {
      if (!isOpen(issue)) continue;
      const verdict = classifyIssue(issue);
      if (verdict === "block") {
        if (changedInCandidate(issue, { readBase, readCandidate })) fixed.push(describe(issue, baseScope));
        else blocking.push(`${describe(issue, baseScope)} — already on \`${baseBranch}\``);
      } else if (verdict === "warn") warnings.push(`${describe(issue, baseScope)} — already on \`${baseBranch}\``);
    }
  }

  // 4. Security hotspots still to review.
  const hotspotLine = (h, scope) =>
    `**${h.vulnerabilityProbability} hotspot** (${h.securityCategory}): ${h.message} — ${where(h)} ([review](${hotspotLink(scope, h.key)}))`;
  for (const h of await client.all("hotspots/search", { projectKey, ...candidateScope, status: "TO_REVIEW" }, "hotspots")) {
    // In a PR these are new code: all must be reviewed. After a merge, main follows the rule for existing code.
    const blocks = pullRequest || POLICY.blockingHotspotProbabilities.includes(h.vulnerabilityProbability);
    (blocks ? blocking : warnings).push(hotspotLine(h, candidateScope));
  }
  if (pullRequest) {
    for (const h of await client.all("hotspots/search", { projectKey, ...baseScope, status: "TO_REVIEW" }, "hotspots")) {
      const line = `${hotspotLine(h, baseScope)} — already on \`${baseBranch}\``;
      if (!POLICY.blockingHotspotProbabilities.includes(h.vulnerabilityProbability)) warnings.push(line);
      else if (changedInCandidate(h, { readBase, readCandidate })) fixed.push(hotspotLine(h, baseScope));
      else blocking.push(line);
    }
  }

  // 5. Accepted findings need a written justification in SonarQube Cloud.
  const scopes = pullRequest ? [candidateScope, baseScope] : [candidateScope];
  for (const scope of scopes) {
    for (const issue of await securityIssues(scope, { issueStatuses: ACCEPTED_STATUSES.join(",") })) {
      if (!isAccepted(issue) || !classifyIssue(issue)) continue;
      const verdict = hasJustification(issue.comments);
      if (verdict !== true) {
        blocking.push(`${describe(issue, scope)} — ${noJustification(verdict, `marked **${issue.issueStatus ?? issue.resolution}**`)}`);
      }
    }
    // hotspots/search only filters resolution by FIXED or SAFE, so fetch every reviewed hotspot and skip the fixed ones.
    for (const h of await client.all("hotspots/search", { projectKey, ...scope, status: "REVIEWED" }, "hotspots")) {
      if (h.resolution === "FIXED") continue;
      const detail = await client.get("hotspots/show", { hotspot: h.key });
      const verdict = hasJustification(detail.comment);
      if (verdict !== true) {
        blocking.push(`${hotspotLine(h, scope)} — ${noJustification(verdict, `reviewed as **${h.resolution ?? "reviewed"}**`)}`);
      }
    }
  }

  return { passed: blocking.length === 0, gateStatus, blocking, warnings, fixed };
}

export function report(result, { pullRequest, baseBranch = "main", bound }) {
  const list = (items) => items.map((i) => `- ${i}`).join("\n");
  const subject = bound
    ? `release${pullRequest ? ` (PR #${pullRequest})` : ""}: \`${baseBranch}\`'s analysis of identical code (commit ${bound.revision.slice(0, 7)})`
    : pullRequest ? `release candidate (PR #${pullRequest})` : `\`${baseBranch}\` after the merge`;
  const lines = [`## Release security gate: ${result.passed ? "passed ✅" : "failed ❌"}`, ""];
  lines.push(`SonarQube Cloud's analysis of the ${subject}. Quality gate: **${result.gateStatus ?? "unknown"}**.`, "");
  if (result.blocking.length) {
    lines.push(`### Blocking (${result.blocking.length})`, list(result.blocking), "");
    lines.push(
      "**To release:** fix each finding on a branch into `develop`, or, if it's a false positive or a risk the owner",
      "accepts, mark it in SonarQube Cloud (Accept / False positive, or hotspot Safe / Acknowledged) **with a comment",
      "explaining why**. Then re-run this job. See docs/runbooks/sonar-release-gate.md.",
      "",
    );
  }
  if (result.fixed.length) {
    lines.push(`### Fixed by this release (${result.fixed.length})`);
    lines.push("The flagged code is changed or removed. The post-merge run on `main` confirms they closed.", list(result.fixed), "");
  }
  if (result.warnings.length) lines.push(`### Warnings, not blocking (${result.warnings.length})`, list(result.warnings), "");
  return lines.join("\n");
}

/** Problems with the job's settings, as actionable messages. Empty when everything needed is present. */
export function configProblems(env) {
  const problems = [];
  if (!env.SONAR_TOKEN) problems.push("The SONAR_TOKEN secret isn't available to this job. Add it under Settings → Secrets and variables → Actions (see docs/runbooks/sonarqube-cloud.md). PRs from forks don't get secrets.");
  if (!env.SONAR_PROJECT_KEY) problems.push("The SONAR_PROJECT_KEY variable isn't set. Add it under Settings → Secrets and variables → Actions → Variables.");
  if (env.SONAR_RELEASE_MODE && env.SONAR_RELEASE_MODE !== "bound") problems.push(`Unknown SONAR_RELEASE_MODE "${env.SONAR_RELEASE_MODE}".`);
  if (env.SONAR_JOB_RESULT && env.SONAR_JOB_RESULT !== "success") {
    problems.push(`The SonarQube Cloud analysis job didn't succeed (result: ${env.SONAR_JOB_RESULT}). Fix that job first; a skipped job means SONAR_ORGANIZATION isn't set.`);
  } else if (env.SONAR_RELEASE_MODE !== "bound" && !env.SONAR_CE_TASK_ID) {
    problems.push("The analysis didn't report a SonarQube Cloud task id, so there's no analysis of this release candidate to check.");
  }
  if (env.PR_NUMBER && !/^\d+$/.test(env.PR_NUMBER)) problems.push(`PR_NUMBER "${env.PR_NUMBER}" isn't a number.`);
  return problems;
}

// ---------- Files for the "fixed by this release" comparison ----------

function safePath(path) {
  const clean = normalize(path);
  if (!clean || isAbsolute(clean) || clean.startsWith("..")) throw new GateError(`Refusing to read path "${path}".`);
  return clean;
}

export const readCandidateFile = (path) => {
  const clean = safePath(path);
  return existsSync(clean) ? readFileSync(clean, "utf8") : null;
};

/** A commit's git tree hash, fetching the commit if this shallow checkout lacks it. Null when it can't be read. */
export const treeOfCommit = (commit) => {
  if (!/^[0-9a-f]{40}$/.test(commit ?? "")) return null;
  const tree = () => execFileSync("git", ["rev-parse", "--verify", "--quiet", `${commit}^{tree}`], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
  try {
    return tree();
  } catch {
    try {
      execFileSync("git", ["fetch", "--no-tags", "--depth=1", "origin", commit], { stdio: "ignore" });
      return tree();
    } catch {
      return null;
    }
  }
};

export const readBaseFile = (baseBranch) => (path) => {
  try {
    return execFileSync("git", ["show", `origin/${baseBranch}:${safePath(path)}`], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
  } catch {
    return null;
  }
};

// ---------- Entry point ----------

function summary(text) {
  console.log(text);
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${text}\n`);
}

export async function main(env = process.env, deps = {}) {
  const problems = configProblems(env);
  if (problems.length) {
    summary(["## Release security gate: failed ❌", "", "The gate couldn't check this release, so it is blocked:", ...problems.map((p) => `- ${p}`)].join("\n"));
    for (const p of problems) console.error(`::error::${p}`);
    return false;
  }
  const baseBranch = env.BASE_BRANCH || "main";
  const hostUrl = env.SONAR_HOST_URL || "https://sonarcloud.io";
  const pullRequest = env.PR_NUMBER || undefined;
  const client = deps.client ?? sonarClient({ token: env.SONAR_TOKEN, hostUrl, fetchImpl: deps.fetchImpl });
  try {
    if (env.SONAR_RELEASE_MODE === "bound") {
      // A release into GitHub's main: reuse the primary branch's analysis of identical code (see boundAnalysis).
      const treeOf = deps.treeOf ?? treeOfCommit;
      const projectKey = env.SONAR_PROJECT_KEY;
      const bound = await boundAnalysis(client, { projectKey, branch: baseBranch, candidateTree: deps.candidateTree ?? treeOf(execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim()), treeOf });
      if (env.SONAR_BIND_ONLY === "true") {
        summary(`## SonarQube Cloud: reusing \`${baseBranch}\`'s analysis\n\nThe Free plan only analyses \`${baseBranch}\` (#373). This release's code is identical to commit ${bound.revision} there, so the Release security gate checks that analysis.`);
        return true;
      }
      // Branch scope, not the PR: the findings are those of the analysed branch, with the post-merge rules.
      const result = await evaluate({ client, projectKey, analysisId: bound.analysisId, baseBranch, hostUrl, readBase: () => null, readCandidate: () => null });
      await stillLatest(client, { projectKey, branch: baseBranch, analysisId: bound.analysisId });
      summary(report(result, { pullRequest, baseBranch, bound }));
      if (!result.passed) console.error(`::error::Release blocked: ${result.blocking.length} blocking SonarQube Cloud finding(s). See the job summary.`);
      return result.passed;
    }
    const analysisId = await waitForAnalysis(client, env.SONAR_CE_TASK_ID, { projectKey: env.SONAR_PROJECT_KEY, pullRequest, ...deps.wait });
    const result = await evaluate({
      client,
      projectKey: env.SONAR_PROJECT_KEY,
      analysisId,
      pullRequest,
      baseBranch,
      hostUrl,
      readBase: deps.readBase ?? readBaseFile(baseBranch),
      readCandidate: deps.readCandidate ?? readCandidateFile,
    });
    summary(report(result, { pullRequest, baseBranch }));
    if (!result.passed) console.error(`::error::Release blocked: ${result.blocking.length} blocking SonarQube Cloud finding(s). See the job summary.`);
    return result.passed;
  } catch (e) {
    const message = e instanceof GateError ? e.message : `Unexpected error: ${e?.message ?? e}`;
    summary(["## Release security gate: failed ❌", "", "The gate couldn't finish checking this release, so it is blocked:", `- ${message}`].join("\n"));
    console.error(`::error::${message}`);
    return false;
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  main().then(
    (passed) => (process.exitCode = passed ? 0 : 1),
    (e) => {
      console.error(`::error::${e.message}`);
      process.exitCode = 1;
    },
  );
}
