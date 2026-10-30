// Tests for sonar-release-gate.mjs, against a fake SonarQube Cloud API. No network, no secrets.
// Run: node --test .github/scripts/sonar-release-gate.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  classifyIssue,
  changedInCandidate,
  configProblems,
  evaluate,
  hasJustification,
  isAccepted,
  isOpen,
  main,
  boundAnalysis,
  report,
  sonarClient,
  waitForAnalysis,
} from "./sonar-release-gate.mjs";

const KEY = "example_project";
const noSleep = async () => {};

// Synthetic findings, shaped like SonarQube Cloud's issues/search answers.
const vulnerability = (over = {}) => ({
  key: "AX-vuln-1",
  rule: "docker:S6505",
  type: "VULNERABILITY",
  severity: "MAJOR",
  impacts: [{ softwareQuality: "SECURITY", severity: "MEDIUM" }],
  issueStatus: "OPEN",
  status: "OPEN",
  component: `${KEY}:docker/api.Dockerfile`,
  line: 2,
  textRange: { startLine: 2, endLine: 2 },
  message: "Prevent package lifecycle scripts from running.",
  comments: [],
  ...over,
});
const securitySmell = (severity, over = {}) => ({
  key: `AX-smell-${severity}`,
  rule: "csharpsquid:S4790",
  type: "CODE_SMELL",
  severity: "MINOR",
  impacts: [{ softwareQuality: "SECURITY", severity }],
  issueStatus: "OPEN",
  component: `${KEY}:src/Example.cs`,
  line: 1,
  message: "Example finding.",
  ...over,
});
const hotspot = (over = {}) => ({
  key: "AX-hot-1",
  component: `${KEY}:src/Example.cs`,
  securityCategory: "weak-cryptography",
  vulnerabilityProbability: "HIGH",
  status: "TO_REVIEW",
  line: 1,
  message: "Make sure this is safe here.",
  ...over,
});

/**
 * A fake SonarQube Cloud. `data` keys: gate, task, issues: { "<scope>": [...] }, hotspots: { "<scope>": [...] },
 * hotspotComments: { key: [...] }. Scope is "pr" or "main". `fail` maps an API path to an HTTP status.
 */
function fakeSonar(data = {}, { fail = {} } = {}) {
  const calls = [];
  const fetchImpl = async (url, init) => {
    const u = new URL(url);
    const path = u.pathname.replace(/^\/api\//, "");
    const q = Object.fromEntries(u.searchParams);
    calls.push({ path, q, auth: init.headers.Authorization });
    const json = (status, body) => ({ ok: status < 400, status, text: async () => JSON.stringify(body) });
    if (fail[path]) return json(fail[path], { errors: [{ msg: "synthetic failure" }] });
    const scope = q.pullRequest ? "pr" : "main";
    switch (path) {
      case "ce/task":
        return json(200, { task: data.task ?? { status: "SUCCESS", analysisId: "A1", componentKey: KEY, pullRequest: "99" } });
      case "qualitygates/project_status":
        return json(200, { projectStatus: data.gate ?? { status: "OK", conditions: [] } });
      case "issues/search": {
        // Like SonarQube: resolved=false keeps unresolved issues; issueStatuses keeps the listed statuses.
        const wanted = q.issueStatuses?.split(",");
        let list = (data.issues?.[scope] ?? []).filter((i) => (wanted ? wanted.includes(i.issueStatus) : isOpen(i)));
        if (q.types) list = list.filter((i) => i.type === "VULNERABILITY");
        if (q.impactSoftwareQualities) list = list.filter((i) => (i.impacts ?? []).some((x) => x.softwareQuality === "SECURITY"));
        return json(200, { issues: list, paging: { pageIndex: 1, pageSize: 500, total: list.length } });
      }
      case "hotspots/search": {
        // Like SonarQube Cloud, which rejects any other resolution filter with HTTP 400.
        if (q.resolution && !["FIXED", "SAFE"].includes(q.resolution)) {
          return json(400, { errors: [{ msg: `Value of parameter 'resolution' (${q.resolution}) must be one of: [FIXED, SAFE]` }] });
        }
        const list = (data.hotspots?.[scope] ?? []).filter((h) => h.status === q.status && (!q.resolution || h.resolution === q.resolution));
        return json(200, { hotspots: list, paging: { pageIndex: 1, pageSize: 500, total: list.length } });
      }
      case "project_analyses/search": {
        // Newest first, like SonarQube. A list of answers lets a test show develop moving on between calls.
        const answers = data.analyses ?? [[{ key: "AN1", revision: "a".repeat(40) }]];
        const n = calls.filter((c) => c.path === path).length - 1;
        return json(200, { analyses: answers[Math.min(n, answers.length - 1)], paging: { pageIndex: 1, pageSize: 1, total: 1 } });
      }
      case "hotspots/show":
        return json(200, data.hotspotShow?.[q.hotspot] ?? { key: q.hotspot, comment: data.hotspotComments?.[q.hotspot] ?? [] });
      default:
        return json(404, { errors: [{ msg: `unknown ${path}` }] });
    }
  };
  return { fetchImpl, calls, client: sonarClient({ token: "synthetic-token", fetchImpl, sleep: noSleep }) };
}

const files = (base, candidate) => ({
  readBase: (p) => base[p] ?? null,
  readCandidate: (p) => candidate[p] ?? null,
});
const dockerfile = "FROM node:22\nRUN npm ci\n";
const unchanged = files({ "docker/api.Dockerfile": dockerfile }, { "docker/api.Dockerfile": dockerfile });
const gate = (sonar, over = {}) =>
  evaluate({ client: sonar.client, projectKey: KEY, analysisId: "A1", pullRequest: "99", ...unchanged, ...over });

// ---------- Policy ----------

test("every vulnerability blocks, including MEDIUM and LOW ones like those in issue #65", () => {
  assert.equal(classifyIssue(vulnerability()), "block");
  assert.equal(classifyIssue(vulnerability({ severity: "MINOR", impacts: [{ softwareQuality: "SECURITY", severity: "LOW" }] })), "block");
});

test("BLOCKER and HIGH security impacts block whatever the issue type; lower ones warn", () => {
  assert.equal(classifyIssue(securitySmell("BLOCKER")), "block");
  assert.equal(classifyIssue(securitySmell("HIGH")), "block");
  assert.equal(classifyIssue(securitySmell("MEDIUM")), "warn");
  assert.equal(classifyIssue(securitySmell("LOW")), "warn");
  assert.equal(classifyIssue(securitySmell("INFO")), "warn");
});

test("non-security findings are ignored", () => {
  assert.equal(classifyIssue({ type: "CODE_SMELL", impacts: [{ softwareQuality: "MAINTAINABILITY", severity: "HIGH" }] }), null);
  assert.equal(classifyIssue({ type: "BUG", impacts: [{ softwareQuality: "RELIABILITY", severity: "BLOCKER" }] }), null);
});

test("legacy-only answers (no impacts) still block vulnerabilities", () => {
  assert.equal(classifyIssue({ type: "VULNERABILITY", severity: "CRITICAL" }), "block");
});

test("statuses use the current issueStatus, with the legacy status and resolution as a fallback", () => {
  assert.equal(isOpen({ issueStatus: "CONFIRMED" }), true);
  assert.equal(isOpen({ issueStatus: "ACCEPTED" }), false);
  assert.equal(isOpen({ issueStatus: "FIXED" }), false);
  assert.equal(isOpen({ issueStatus: "IN_SANDBOX" }), true, "an unknown status fails closed");
  assert.equal(isOpen({ status: "REOPENED" }), true);
  assert.equal(isOpen({ status: "RESOLVED", resolution: "WONTFIX" }), false);
  assert.equal(isAccepted({ issueStatus: "FALSE_POSITIVE" }), true);
  assert.equal(isAccepted({ resolution: "WONTFIX" }), true);
  assert.equal(isAccepted({ issueStatus: "FIXED", resolution: "FIXED" }), false);
});

test("a justification is a non-empty comment", () => {
  assert.equal(hasJustification([]), false);
  assert.equal(hasJustification(undefined), null, "no comment list at all: can't be checked");
  assert.equal(hasJustification([{ markdown: "  " }]), false);
  assert.equal(hasJustification([{ markdown: "Required so keyboard users can scroll." }]), true);
  assert.equal(hasJustification([{ htmlText: "Reviewed: test-only code." }]), true);
});

// ---------- Fixed by the release ----------

test("a finding counts as fixed only when the flagged code is changed or its file is deleted", () => {
  const f = vulnerability();
  assert.equal(changedInCandidate(f, unchanged), false);
  // Re-indenting the line doesn't fix it.
  assert.equal(changedInCandidate(f, files({ "docker/api.Dockerfile": dockerfile }, { "docker/api.Dockerfile": "FROM node:22\n  RUN   npm ci\n" })), false);
  assert.equal(changedInCandidate(f, files({ "docker/api.Dockerfile": dockerfile }, { "docker/api.Dockerfile": "FROM node:22\nRUN npm ci --ignore-scripts\n" })), true);
  assert.equal(changedInCandidate(f, files({ "docker/api.Dockerfile": dockerfile }, {})), true);
  // Main's copy unavailable, or a file-level finding: can't be shown fixed.
  assert.equal(changedInCandidate(f, files({}, {})), false);
  assert.equal(changedInCandidate({ ...f, line: undefined, textRange: undefined }, files({ "docker/api.Dockerfile": dockerfile }, { "docker/api.Dockerfile": "x" })), false);
});

// ---------- The gate ----------

test("a compliant release passes", async () => {
  const sonar = fakeSonar({ issues: { main: [securitySmell("LOW")] }, hotspots: { main: [hotspot({ vulnerabilityProbability: "LOW" })] } });
  const result = await gate(sonar);
  assert.equal(result.passed, true, result.blocking.join("\n"));
  assert.equal(result.warnings.length, 2);
  const basic = `Basic ${Buffer.from("synthetic-token:").toString("base64")}`;
  assert.ok(sonar.calls.every((c) => c.auth === basic), "the token is sent as the Basic-auth user, like Sonar Sunday");
});

test("a failing quality gate blocks, naming the failed conditions", async () => {
  const result = await gate(
    fakeSonar({ gate: { status: "ERROR", conditions: [{ status: "ERROR", metricKey: "new_coverage", comparator: "LT", errorThreshold: "80", actualValue: "41.2" }] } }),
  );
  assert.equal(result.passed, false);
  assert.match(result.blocking[0], /Quality gate is ERROR.*new_coverage.*41\.2.*80/);
});

test("a quality gate that isn't OK (NONE, WARN or missing) blocks", async () => {
  for (const gateAnswer of [{ status: "NONE" }, { status: "WARN" }, {}]) {
    assert.equal((await gate(fakeSonar({ gate: gateAnswer }))).passed, false);
  }
});

test("a new vulnerability in the release candidate blocks", async () => {
  const result = await gate(fakeSonar({ issues: { pr: [vulnerability()] } }));
  assert.equal(result.passed, false);
  assert.match(result.blocking[0], /MEDIUM security.*docker\/api\.Dockerfile:2.*docker:S6505.*pullRequest=99&open=AX-vuln-1/);
});

test("a vulnerability already on main blocks the release unless the release changes the flagged code", async () => {
  const sonar = fakeSonar({ issues: { main: [vulnerability()] } });
  const blocked = await gate(sonar);
  assert.equal(blocked.passed, false);
  assert.match(blocked.blocking[0], /already on `main`/);

  const fixed = await gate(sonar, files({ "docker/api.Dockerfile": dockerfile }, { "docker/api.Dockerfile": "FROM node:22\nRUN npm ci --ignore-scripts\n" }));
  assert.equal(fixed.passed, true, fixed.blocking.join("\n"));
  assert.equal(fixed.fixed.length, 1);
});

test("after a merge, every open blocking finding on main fails (no 'fixed by this release' allowance)", async () => {
  const sonar = fakeSonar({ issues: { main: [vulnerability()] } });
  const result = await evaluate({ client: sonar.client, projectKey: KEY, analysisId: "A1", ...files({}, {}) });
  assert.equal(result.passed, false);
});

test("accepted findings need a justification comment", async () => {
  const accepted = vulnerability({ issueStatus: "ACCEPTED", status: "RESOLVED", resolution: "WONTFIX" });
  const bare = await gate(fakeSonar({ issues: { main: [accepted] } }));
  assert.equal(bare.passed, false);
  assert.match(bare.blocking[0], /marked \*\*ACCEPTED\*\* without a comment/);

  const justified = await gate(fakeSonar({ issues: { main: [{ ...accepted, comments: [{ markdown: "Synthetic reason: build-only stage." }] }] } }));
  assert.equal(justified.passed, true, justified.blocking.join("\n"));
});

test("any hotspot to review in the release candidate's new code blocks", async () => {
  const result = await gate(fakeSonar({ hotspots: { pr: [hotspot({ vulnerabilityProbability: "LOW" })] } }));
  assert.equal(result.passed, false);
});

test("hotspots already on main: HIGH blocks, MEDIUM and LOW warn", async () => {
  const high = await gate(fakeSonar({ hotspots: { main: [hotspot()] } }));
  assert.equal(high.passed, false);
  const medium = await gate(fakeSonar({ hotspots: { main: [hotspot({ vulnerabilityProbability: "MEDIUM" })] } }));
  assert.equal(medium.passed, true);
  assert.equal(medium.warnings.length, 1);
});

test("hotspots reviewed as Safe or Acknowledged need a comment", async () => {
  const reviewed = hotspot({ status: "REVIEWED", resolution: "SAFE" });
  assert.equal((await gate(fakeSonar({ hotspots: { main: [reviewed] } }))).passed, false);
  const justified = await gate(fakeSonar({ hotspots: { main: [reviewed] }, hotspotComments: { "AX-hot-1": [{ markdown: "Synthetic: not user input." }] } }));
  assert.equal(justified.passed, true, justified.blocking.join("\n"));
  const fixedHotspot = await gate(fakeSonar({ hotspots: { main: [hotspot({ status: "REVIEWED", resolution: "FIXED" })] } }));
  assert.equal(fixedHotspot.passed, true);
  const acknowledged = await gate(fakeSonar({ hotspots: { main: [hotspot({ status: "REVIEWED", resolution: "ACKNOWLEDGED" })] } }));
  assert.equal(acknowledged.passed, false);
  assert.match(acknowledged.blocking.join("\n"), /reviewed as \*\*ACKNOWLEDGED\*\*/);
});

// ---------- Failing safely ----------

test("missing credentials, settings or analysis are reported and fail", async () => {
  const ok = { SONAR_TOKEN: "t", SONAR_PROJECT_KEY: KEY, SONAR_CE_TASK_ID: "T1", SONAR_JOB_RESULT: "success", PR_NUMBER: "99" };
  assert.deepEqual(configProblems(ok), []);
  assert.match(configProblems({ ...ok, SONAR_TOKEN: "" }).join(), /SONAR_TOKEN/);
  assert.match(configProblems({ ...ok, SONAR_PROJECT_KEY: "" }).join(), /SONAR_PROJECT_KEY/);
  assert.match(configProblems({ ...ok, SONAR_JOB_RESULT: "skipped", SONAR_CE_TASK_ID: "" }).join(), /didn't succeed.*skipped/);
  assert.match(configProblems({ ...ok, SONAR_CE_TASK_ID: "" }).join(), /task id/);
  assert.match(configProblems({ ...ok, PR_NUMBER: "1;rm" }).join(), /isn't a number/);

  const sonar = fakeSonar();
  assert.equal(await main({ ...ok, SONAR_TOKEN: "" }, { fetchImpl: sonar.fetchImpl }), false);
  assert.equal(sonar.calls.length, 0, "nothing is called without credentials");
});

test("API errors fail with an actionable message and never print the token", async () => {
  for (const [status, hint] of [[401, /SONAR_TOKEN is missing, invalid or expired/], [403, /Browse permission/], [404, /SONAR_PROJECT_KEY/], [503, /unavailable/]]) {
    const sonar = fakeSonar({}, { fail: { "qualitygates/project_status": status } });
    await assert.rejects(gate(sonar), (e) => hint.test(e.message) && !e.message.includes("synthetic-token"));
  }
});

test("server errors are retried before failing; client errors aren't", async () => {
  const server = fakeSonar({}, { fail: { "qualitygates/project_status": 502 } });
  await assert.rejects(gate(server));
  assert.equal(server.calls.filter((c) => c.path === "qualitygates/project_status").length, 3);
  const client = fakeSonar({}, { fail: { "qualitygates/project_status": 401 } });
  await assert.rejects(gate(client));
  assert.equal(client.calls.filter((c) => c.path === "qualitygates/project_status").length, 1);
});

test("network errors, timeouts and non-JSON answers fail", async () => {
  const timeout = sonarClient({ token: "t", sleep: noSleep, fetchImpl: async () => { throw Object.assign(new Error("t"), { name: "TimeoutError" }); } });
  await assert.rejects(timeout.get("ce/task", { id: "T1" }), /timed out/);
  const down = sonarClient({ token: "t", sleep: noSleep, fetchImpl: async () => { throw new TypeError("fetch failed"); } });
  await assert.rejects(down.get("ce/task", { id: "T1" }), /could not be reached/);
  const html = sonarClient({ token: "t", fetchImpl: async () => ({ ok: true, status: 200, text: async () => "<html>" }) });
  await assert.rejects(html.get("ce/task", { id: "T1" }), /isn't JSON/);
  const partial = sonarClient({ token: "t", fetchImpl: async () => ({ ok: true, status: 200, text: async () => "{}" }) });
  await assert.rejects(partial.all("issues/search", {}, "issues"), /without "issues"/);
});

test("the gate waits for the analysis, and fails if it fails, times out or is for another PR", async () => {
  const answers = (list) => {
    let i = 0;
    return { get: async () => ({ task: list[Math.min(i++, list.length - 1)] }) };
  };
  const done = { status: "SUCCESS", analysisId: "A7", componentKey: KEY, pullRequest: "99" };
  assert.equal(await waitForAnalysis(answers([{ status: "PENDING" }, { status: "IN_PROGRESS" }, done]), "T1", { pullRequest: "99", sleep: noSleep }), "A7");
  await assert.rejects(waitForAnalysis(answers([{ status: "FAILED", errorMessage: "boom" }]), "T1", { sleep: noSleep }), /FAILED: boom/);
  let clock = 0;
  await assert.rejects(
    waitForAnalysis(answers([{ status: "PENDING" }]), "T1", { timeoutMs: 60_000, sleep: async (ms) => { clock += ms; }, now: () => clock }),
    /didn't finish processing/,
  );
  await assert.rejects(waitForAnalysis(answers([{ ...done, pullRequest: "12" }]), "T1", { pullRequest: "99", sleep: noSleep }), /PR #12, not PR #99/);
  await assert.rejects(waitForAnalysis(answers([{ ...done, componentKey: "other" }]), "T1", { projectKey: KEY, sleep: noSleep }), /belongs to other/);
});

test("main() end to end: passes a compliant release, blocks one with findings, and blocks on API failure", async () => {
  const env = { SONAR_TOKEN: "synthetic-token", SONAR_PROJECT_KEY: KEY, SONAR_CE_TASK_ID: "T1", SONAR_JOB_RESULT: "success", PR_NUMBER: "99" };
  const deps = (sonar) => ({ client: sonar.client, ...unchanged });
  assert.equal(await main(env, deps(fakeSonar())), true);
  assert.equal(await main(env, deps(fakeSonar({ issues: { main: [vulnerability()] } }))), false);
  assert.equal(await main(env, deps(fakeSonar({}, { fail: { "issues/search": 500 } }))), false);
});

// ---------- Realistic answers (fixtures/sonar-release-gate) ----------
// Shaped like SonarQube Cloud's documented Web API answers. The seven vulnerabilities use the keys, messages, files and
// lines of the real Sonar Sunday issue #56 (tracked in #65); rule keys and impacts there are illustrative.

const fixture = (name) => JSON.parse(readFileSync(new URL(`./fixtures/sonar-release-gate/${name}.json`, import.meta.url), "utf8"));
const REAL_KEY = "esaldivar_parenthesis";
const mainIssues = fixture("issues-main").answer.issues;
const acceptedIssues = fixture("issues-accepted").answer.issues;
const ceTask = fixture("ce-task");
const qualityGate = fixture("quality-gate");
const hotspots = fixture("hotspots");
const errors = fixture("errors");

// Every file a fixture finding points at, with numbered lines; the candidate is identical unless a test changes it.
const sourceFiles = Object.fromEntries(
  [...mainIssues, ...acceptedIssues].map((i) => [i.component.split(":")[1], Array.from({ length: 120 }, (_, n) => `line ${n + 1} code`).join("\n")]),
);
const realFiles = (candidateChanges = {}) => files(sourceFiles, { ...sourceFiles, ...candidateChanges });
const realGate = (sonar, over = {}) =>
  evaluate({ client: sonar.client, projectKey: REAL_KEY, analysisId: "AZanalysis00000000001", pullRequest: "99", ...realFiles(), ...over });

test("fixtures: issue #65's seven vulnerabilities on main block the release; the bug and code smell don't", async () => {
  const sonar = fakeSonar({ gate: qualityGate.ok.projectStatus, issues: { main: mainIssues } });
  const result = await realGate(sonar);
  assert.equal(result.passed, false);
  assert.equal(result.blocking.length, 7);
  for (const key of ["AaFJgkAVnwwNvcZN96mT", "AaFJgj-qnwwNvcZN96mS", "AaFJqlaJCiUwZk3h2z-2"]) {
    assert.ok(result.blocking.some((b) => b.includes(`open=${key}`)), `${key} is listed with its link`);
  }
  assert.ok(result.blocking.some((b) => b.includes("**LOW security** vulnerability") && b.includes("AntiforgeryExtensions.cs:34")));
  assert.ok(!result.blocking.some((b) => /AaFJqlcRCiUwZk3h2z-3|AaFJqlc5CiUwZk3h2z-4/.test(b)), "non-security findings are ignored");
  assert.equal(result.gateStatus, "OK", "main's quality gate can be OK while old vulnerabilities remain (as on October 18)");
});

test("fixtures: the gate sends current-model filters and asks for comments", async () => {
  const sonar = fakeSonar({ issues: { main: mainIssues } });
  await realGate(sonar);
  const searches = sonar.calls.filter((c) => c.path === "issues/search");
  assert.ok(searches.length > 0);
  assert.ok(searches.every((c) => c.q.additionalFields === "comments" && c.q.componentKeys === REAL_KEY));
  assert.ok(searches.every((c) => !("resolutions" in c.q) && !("statuses" in c.q)), "no deprecated status filters");
  assert.ok(searches.some((c) => c.q.resolved === "false" && c.q.impactSoftwareQualities === "SECURITY"));
  assert.ok(searches.some((c) => c.q.issueStatuses === "ACCEPTED,FALSE_POSITIVE"));
  assert.ok(sonar.calls.some((c) => c.path === "qualitygates/project_status" && c.q.analysisId === "AZanalysis00000000001"));
});

test("fixtures: a release that changes one flagged line clears only that finding", async () => {
  const dockerfile = sourceFiles["docker/api.Dockerfile"].split("\n");
  dockerfile[7] = "RUN npm ci --ignore-scripts";
  const sonar = fakeSonar({ issues: { main: mainIssues } });
  const result = await realGate(sonar, realFiles({ "docker/api.Dockerfile": dockerfile.join("\n") }));
  assert.equal(result.passed, false);
  assert.equal(result.blocking.length, 6);
  assert.equal(result.fixed.length, 1);
  assert.match(result.fixed[0], /AaFJgkAVnwwNvcZN96mT/);
});

test("fixtures: a justified acceptance passes; a false positive with no comment blocks", async () => {
  const result = await realGate(fakeSonar({ issues: { main: acceptedIssues } }));
  assert.equal(result.passed, false);
  assert.equal(result.blocking.length, 1);
  assert.match(result.blocking[0], /AaFJqlc5CiUwZk3h2z-8.*marked \*\*FALSE_POSITIVE\*\* without a comment/);
});

test("fixtures: an accepted finding whose comments weren't returned blocks with its own message", async () => {
  const { comments, ...noComments } = acceptedIssues[0];
  const result = await realGate(fakeSonar({ issues: { main: [noComments] } }));
  assert.equal(result.passed, false);
  assert.match(result.blocking[0], /didn't return its comments/);
});

test("fixtures: hotspots to review: HIGH on main blocks, LOW warns; in the PR's new code both block", async () => {
  const onMain = await realGate(fakeSonar({ hotspots: { main: hotspots.toReview.hotspots } }));
  assert.equal(onMain.passed, false);
  assert.equal(onMain.blocking.length, 1);
  assert.match(onMain.blocking[0], /HIGH hotspot.*AZhot01/);
  assert.equal(onMain.warnings.length, 1);
  const inPr = await realGate(fakeSonar({ hotspots: { pr: hotspots.toReview.hotspots } }));
  assert.equal(inPr.blocking.length, 2);
});

test("fixtures: hotspots reviewed as Safe need a comment, and a missing comment list blocks", async () => {
  const reviewed = { hotspots: { main: hotspots.reviewedSafe.hotspots } };
  assert.equal((await realGate(fakeSonar({ ...reviewed, hotspotShow: { AZhot03: hotspots.showWithComment } }))).passed, true);
  const bare = await realGate(fakeSonar({ ...reviewed, hotspotShow: { AZhot03: hotspots.showWithoutComment } }));
  assert.match(bare.blocking[0], /reviewed as \*\*SAFE\*\* without a comment/);
  const missing = await realGate(fakeSonar({ ...reviewed, hotspotShow: { AZhot03: hotspots.showMissingCommentField } }));
  assert.match(missing.blocking[0], /didn't return its comments/);
});

test("fixtures: a failing quality gate blocks with the condition that failed", async () => {
  const result = await realGate(fakeSonar({ gate: qualityGate.error.projectStatus }));
  assert.equal(result.passed, false);
  assert.match(result.blocking[0], /new_coverage.*41\.2.*80/);
});

test("fixtures: a compliant release passes and the report says so", async () => {
  const sonar = fakeSonar({
    gate: qualityGate.ok.projectStatus,
    issues: { main: [acceptedIssues[0]] },
    hotspots: { main: hotspots.reviewedSafe.hotspots },
    hotspotShow: { AZhot03: hotspots.showWithComment },
  });
  const result = await realGate(sonar);
  assert.equal(result.passed, true, result.blocking.join("\n"));
  assert.match(report(result, { pullRequest: "99" }), /Release security gate: passed/);
});

test("fixtures: the analysis task (pending, then success) and a failed task", async () => {
  const answers = [ceTask.pending, ceTask.pending, ceTask.success];
  const client = { get: async () => answers.shift() ?? ceTask.success };
  assert.equal(await waitForAnalysis(client, "AZtask0000000000000001", { projectKey: REAL_KEY, pullRequest: "99", sleep: noSleep }), "AZanalysis00000000001");
  await assert.rejects(waitForAnalysis({ get: async () => ceTask.failed }, "T", { sleep: noSleep }), /FAILED: Synthetic processing failure/);
});

test("fixtures: SonarQube's own error messages are passed on", async () => {
  const withBody = (status, body) => sonarClient({ token: "t", fetchImpl: async () => ({ ok: false, status, text: async () => JSON.stringify(body) }) });
  await assert.rejects(withBody(401, errors.unauthorized).get("ce/task"), /HTTP 401 \(Authentication is required\).*SONAR_TOKEN/);
  await assert.rejects(withBody(400, errors.badParameter).get("issues/search"), /HTTP 400 .*must be one of.*Web API may have changed/);
});

test("main(): a skipped or failed analysis job blocks without calling SonarQube", async () => {
  const env = { SONAR_TOKEN: "synthetic-token", SONAR_PROJECT_KEY: REAL_KEY, PR_NUMBER: "99" };
  for (const result of ["skipped", "failure", "cancelled"]) {
    const sonar = fakeSonar();
    assert.equal(await main({ ...env, SONAR_JOB_RESULT: result, SONAR_CE_TASK_ID: "" }, { client: sonar.client, ...realFiles() }), false, result);
    assert.equal(sonar.calls.length, 0);
  }
  // A task id with a failed job still blocks: the analysis may be incomplete.
  assert.equal(await main({ ...env, SONAR_JOB_RESULT: "failure", SONAR_CE_TASK_ID: "T1" }, { client: fakeSonar().client }), false);
});

// ---------- The workflow wiring (.github/workflows/sonar.yml) ----------
// Text checks, as Node has no YAML parser built in; actionlint checks the syntax.

test("sonar.yml: the gate job can't be skipped, reads this run's analysis and keeps its check name", () => {
  const yml = readFileSync(new URL("../workflows/sonar.yml", import.meta.url), "utf8");
  const gateJob = yml.slice(yml.indexOf("\n  release-gate:"));
  assert.ok(gateJob.length > 1, "release-gate job exists");
  assert.match(gateJob, /\n    name: Release security gate\n/, "the required check's name");
  assert.match(gateJob, /\n    needs: sonar\n/);
  assert.match(gateJob, /\n    if: \$\{\{ !cancelled\(\) \}\}\n/, "runs when the analysis is skipped or fails");
  assert.match(gateJob, /SONAR_CE_TASK_ID: \$\{\{ needs\.sonar\.outputs\.ce-task-id \}\}/);
  assert.match(gateJob, /SONAR_JOB_RESULT: \$\{\{ needs\.sonar\.result \}\}/);
  assert.match(gateJob, /PR_NUMBER: \$\{\{ github\.event\.pull_request\.number \}\}/);
  assert.match(gateJob, /run: node \.github\/scripts\/sonar-release-gate\.mjs\n/);
  assert.doesNotMatch(gateJob, /continue-on-error/);
  assert.match(yml, /pull_request:\n    branches: \[develop, main\]/, "runs on every PR into develop and main (#373)");
  assert.match(yml, /push:\n    branches: \[develop, main\]/);
  assert.match(yml, /ce-task-id: \$\{\{ steps\.report\.outputs\.ce-task-id \}\}/);
  // #373: anything going to main reuses develop's analysis (bound mode), and the gate is told which mode applies.
  assert.match(yml, /SONAR_PRIMARY_BRANCH: develop\n/);
  assert.match(gateJob, /SONAR_RELEASE_MODE: \$\{\{ needs\.sonar\.outputs\.mode \}\}/);
  assert.match(gateJob, /BASE_BRANCH: \$\{\{ env\.SONAR_PRIMARY_BRANCH \}\}/);
  const scanJob = yml.slice(yml.indexOf("\n  sonar:"), yml.indexOf("\n  release-gate:"));
  assert.match(scanJob, /elif \[ "\$TARGET" = "main" \]; then echo "mode=bound"/);
  assert.match(scanJob, /else echo "::error::Unexpected target branch/, "an unknown target fails instead of skipping the scan");
  const steps = scanJob.split("\n      - ").slice(1);
  const scanSteps = steps.filter((st) => /^(uses: actions\/setup|name: (Install|Frontend tests|Begin|Build|Backend tests|End analysis|Report the analysis))/.test(st));
  assert.equal(scanSteps.length, 10);
  for (const st of scanSteps) assert.match(st, /if: steps\.mode\.outputs\.mode != 'bound'/, st.split("\n")[0]);
  assert.match(scanJob, /SONAR_BIND_ONLY: "true"/);
});

// ---------- Bound mode: releases into GitHub's main reuse develop's analysis (#373) ----------

const TREE = "b".repeat(40);
const sameTree = () => TREE;
const boundEnv = { SONAR_TOKEN: "synthetic-token", SONAR_PROJECT_KEY: KEY, SONAR_JOB_RESULT: "success", SONAR_RELEASE_MODE: "bound", BASE_BRANCH: "develop", PR_NUMBER: "120" };
const boundDeps = (sonar, over = {}) => ({ client: sonar.client, candidateTree: TREE, treeOf: sameTree, ...over });

test("bound: a release whose code is identical to develop's latest analysis is checked against that analysis", async () => {
  const sonar = fakeSonar();
  assert.equal(await main(boundEnv, boundDeps(sonar)), true);
  const gateCall = sonar.calls.find((c) => c.path === "qualitygates/project_status");
  assert.equal(gateCall.q.analysisId, "AN1");
  const issueCalls = sonar.calls.filter((c) => c.path === "issues/search");
  assert.ok(issueCalls.length > 0 && issueCalls.every((c) => c.q.branch === "develop" && !c.q.pullRequest), "develop's findings, never a PR scope");
  assert.ok(!sonar.calls.some((c) => c.path === "ce/task"), "no scan of main is expected");
});

test("bound: different code (a hotfix, or main not synced into develop) blocks, never reusing other code's results", async () => {
  const sonar = fakeSonar();
  await assert.rejects(boundAnalysis(sonar.client, { projectKey: KEY, branch: "develop", candidateTree: TREE, treeOf: () => "c".repeat(40) }), /isn't identical.*A hotfix must reach develop first/);
  assert.equal(await main(boundEnv, boundDeps(fakeSonar(), { treeOf: () => "c".repeat(40) })), false);
});

test("bound: no analysis, no commit on it, an unreadable commit or tree all block", async () => {
  for (const analyses of [[[]], [[{ key: "AN1" }]], [[{ key: "AN1", revision: "not-a-sha" }]]]) {
    assert.equal(await main(boundEnv, boundDeps(fakeSonar({ analyses }))), false);
  }
  assert.equal(await main(boundEnv, boundDeps(fakeSonar(), { treeOf: () => null })), false);
  assert.equal(await main(boundEnv, boundDeps(fakeSonar(), { candidateTree: "" })), false);
});

test("bound: develop moving on during the check blocks", async () => {
  const moved = fakeSonar({ analyses: [[{ key: "AN1", revision: "a".repeat(40) }], [{ key: "AN2", revision: "d".repeat(40) }]] });
  assert.equal(await main(boundEnv, boundDeps(moved)), false);
});

test("bound: the same policy applies: an open vulnerability or a failing quality gate on develop blocks", async () => {
  assert.equal(await main(boundEnv, boundDeps(fakeSonar({ issues: { main: [vulnerability()] } }))), false);
  assert.equal(await main(boundEnv, boundDeps(fakeSonar({ gate: { status: "ERROR", conditions: [] } }))), false);
});

test("bound, bind only (the SonarQube Cloud job on main): verifies identical code and checks nothing else", async () => {
  const sonar = fakeSonar({ issues: { main: [vulnerability()] } });
  assert.equal(await main({ ...boundEnv, SONAR_BIND_ONLY: "true" }, boundDeps(sonar)), true);
  assert.ok(sonar.calls.every((c) => c.path === "project_analyses/search"));
  assert.equal(await main({ ...boundEnv, SONAR_BIND_ONLY: "true" }, boundDeps(fakeSonar(), { treeOf: () => "c".repeat(40) })), false);
});

test("bound: an unknown mode or a failed bind job blocks without calling SonarQube", async () => {
  const sonar = fakeSonar();
  assert.equal(await main({ ...boundEnv, SONAR_RELEASE_MODE: "trust-me" }, boundDeps(sonar)), false);
  assert.equal(await main({ ...boundEnv, SONAR_JOB_RESULT: "skipped" }, boundDeps(sonar)), false);
  assert.equal(sonar.calls.length, 0);
});
