// Tests for sonar-release-gate.mjs, against a fake SonarQube Cloud API. No network, no secrets.
// Run: node --test .github/scripts/sonar-release-gate.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  classifyIssue,
  changedInCandidate,
  configProblems,
  evaluate,
  hasJustification,
  isAccepted,
  isOpen,
  main,
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
        const accepted = Boolean(q.resolutions);
        let list = (data.issues?.[scope] ?? []).filter((i) => (accepted ? isAccepted(i) : isOpen(i)));
        if (q.types) list = list.filter((i) => i.type === "VULNERABILITY");
        if (q.impactSoftwareQualities) list = list.filter((i) => (i.impacts ?? []).some((x) => x.softwareQuality === "SECURITY"));
        return json(200, { issues: list, paging: { pageIndex: 1, pageSize: 500, total: list.length } });
      }
      case "hotspots/search": {
        const list = (data.hotspots?.[scope] ?? []).filter((h) => h.status === q.status && (!q.resolution || h.resolution === q.resolution));
        return json(200, { hotspots: list, paging: { pageIndex: 1, pageSize: 500, total: list.length } });
      }
      case "hotspots/show":
        return json(200, { key: q.hotspot, comment: data.hotspotComments?.[q.hotspot] ?? [] });
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
  assert.equal(isOpen({ status: "REOPENED" }), true);
  assert.equal(isOpen({ status: "RESOLVED", resolution: "WONTFIX" }), false);
  assert.equal(isAccepted({ issueStatus: "FALSE_POSITIVE" }), true);
  assert.equal(isAccepted({ resolution: "WONTFIX" }), true);
  assert.equal(isAccepted({ issueStatus: "FIXED", resolution: "FIXED" }), false);
});

test("a justification is a non-empty comment", () => {
  assert.equal(hasJustification([]), false);
  assert.equal(hasJustification(undefined), false);
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
  assert.ok(sonar.calls.every((c) => c.auth === "Bearer synthetic-token"));
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
