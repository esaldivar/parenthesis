import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { apply, command, kindOf, plan, releaseOf, report, run } from './pr-milestones.mjs';

// #140, report-only. Synthetic issues and milestones only.
const repository = 'esaldivar/parenthesis';
const M2 = { number: 1, title: 'M2 — Onboarding' };
const M3 = { number: 2, title: 'M3 — Calendar' };
const work = (issues, current = null, base = 'release/0.3.0', head = 'fix/327-popups') => plan({ base, head, current, issues });

test('milestone titles map to releases as the workflow docs do', () => {
  assert.equal(releaseOf('M3 — Calendar'), '0.3.0');
  assert.equal(releaseOf('v1.0 — Private Beta'), '1.0.0');
  assert.equal(releaseOf('Backlog'), null);
});

test('one milestone-bearing issue: would assign its milestone', () => {
  const r = work([{ number: 327, milestone: M3 }]);
  assert.equal(r.decision, 'assign');
  assert.deepEqual(r.milestone, M3);
  assert.match(report(r).line, /Would set the milestone to M3 — Calendar \(report-only: not set\)/);
  assert.equal(report(r).warn, false);
});

test('several issues in the same milestone work; issues without one are noted, not guessed', () => {
  const r = work([{ number: 327, milestone: M3 }, { number: 372, milestone: M3 }, { number: 141, milestone: null }]);
  assert.equal(r.decision, 'assign');
  assert.deepEqual(r.milestones, [M3]);
  assert.ok(r.notes.some(n => n.includes('No milestone on #141')));
});

test('different milestones need a decision and warn', () => {
  const r = work([{ number: 211, milestone: M2 }, { number: 327, milestone: M3 }]);
  assert.equal(r.decision, 'conflict');
  assert.equal(r.milestone, undefined);
  assert.ok(r.notes.some(n => n.startsWith('Tracking issues are in different milestones (M2 — Onboarding, M3 — Calendar)')));
  assert.equal(report(r).warn, true);
});

test('no milestone anywhere: nothing invented, the maintenance exception is explained', () => {
  const r = work([{ number: 141, milestone: null }]);
  assert.equal(r.decision, 'none');
  assert.ok(r.notes.some(n => n.includes('repository-wide maintenance')));
  assert.equal(report(r).warn, false);
});

test('an already matching PR milestone is confirmed; a different one is kept and reported', () => {
  assert.equal(work([{ number: 327, milestone: M3 }], M3).decision, 'matches');
  const differs = work([{ number: 327, milestone: M3 }], M2);
  assert.equal(differs.decision, 'differs');
  assert.equal(report(differs).warn, true);
});

test('a milestone from another release than the target branch warns', () => {
  const r = work([{ number: 211, milestone: M2 }]);
  assert.ok(r.notes.some(n => n.includes('M2 — Onboarding belongs to release 0.2.0, but this PR targets release/0.3.0')));
  assert.equal(report(r).warn, true);
  assert.ok(!work([{ number: 211, milestone: M2 }], null, 'develop', 'docs/x').notes.some(n => n.includes('belongs to release')));
});

for (const [base, head] of [['develop', 'release/0.3.0'], ['main', 'develop'], ['main', 'hotfix/1.0.1'], ['develop', 'hotfix/1.0.1'], ['release/0.3.0', 'chore/sync-develop-into-release-0.3.0']]) {
  test(`rollups are summarised, never assigned: ${head} → ${base}`, () => {
    assert.equal(kindOf(base, head), 'rollup');
    const r = plan({ base, head, current: null, issues: [{ number: 211, milestone: M2 }, { number: 327, milestone: M3 }] });
    assert.equal(r.decision, 'rollup');
    assert.match(report(r).line, /span M2 — Onboarding, M3 — Calendar/);
    assert.equal(report(r).warn, false);
  });
}

test('apply mode only fills an empty milestone, and never on a decision that isn’t an assignment', async () => {
  const set = [];
  const setMilestone = async m => set.push(m);
  assert.equal(await apply({ result: work([{ number: 327, milestone: M3 }]), current: null, setMilestone }), true);
  assert.equal(await apply({ result: work([{ number: 327, milestone: M3 }], M2), current: M2, setMilestone }), false);
  assert.equal(await apply({ result: work([{ number: 1, milestone: M2 }, { number: 2, milestone: M3 }]), current: null, setMilestone }), false);
  assert.deepEqual(set, [M3.number]);
});

test('workflow command text is escaped', () => {
  assert.equal(command('a%b\r\nc::warning::x'), 'a%25b%0D%0Ac: :warning: :x');
});

// The run: trusted context, fresh reads, race detection and report-only behavior.
function context(prs, issues, { mode } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pr-milestones-'));
  const eventPath = path.join(dir, 'event.json');
  fs.writeFileSync(eventPath, JSON.stringify({ pull_request: { number: 9, head: { sha: 'abc' } } }));
  const calls = [];
  let read = 0;
  const fetchImpl = async (url, init = {}) => {
    calls.push({ url, method: init.method ?? 'GET', body: init.body });
    const route = url.replace(`https://api.github.com/repos/${repository}/`, '');
    let value;
    if (route === 'pulls/9') value = prs[Math.min(read++, prs.length - 1)];
    else if (route.startsWith('issues/') && init.method === 'PATCH') value = {};
    else value = issues[Number(route.split('/')[1])];
    return value === undefined ? { ok: false, status: 404, json: async () => ({}) } : { ok: true, status: 200, json: async () => value };
  };
  const out = [];
  const env = { GITHUB_EVENT_PATH: eventPath, GITHUB_REPOSITORY: repository, GITHUB_TOKEN: 'test', PR_MILESTONE_MODE: mode };
  return { env, fetchImpl, calls, out, write: s => out.push(s) };
}
const pr = (overrides = {}) => ({ state: 'open', head: { sha: 'abc', ref: 'fix/327-popups' }, base: { ref: 'release/0.3.0' }, body: '## Tracking issues\nRefs #327\n', milestone: null, ...overrides });
const issueWith = (number, milestone) => ({ id: number + 1000, number, state: 'open', html_url: `https://github.com/${repository}/issues/${number}`, milestone });

test('report mode reads the PR and issues, summarises, and writes nothing to GitHub', async () => {
  const c = context([pr(), pr()], { 327: issueWith(327, M3) });
  const result = await run(c);
  assert.equal(result.decision, 'assign');
  assert.ok(c.out[0].includes('Would set the milestone to M3 — Calendar'));
  assert.ok(c.calls.every(call => call.method === 'GET'));
});

test('apply mode sets the inherited milestone on an empty PR', async () => {
  const c = context([pr(), pr()], { 327: issueWith(327, M3) }, { mode: 'apply' });
  await run(c);
  const patch = c.calls.find(call => call.method === 'PATCH');
  assert.ok(patch.url.endsWith('/issues/9'));
  assert.deepEqual(JSON.parse(patch.body), { milestone: M3.number });
});

test('a PR that changes during the check reports nothing for this run', async () => {
  const c = context([pr(), pr({ body: '## Tracking issues\nRefs #211\n' })], { 327: issueWith(327, M3) });
  await assert.rejects(run(c), /changed during the check/);
  const stale = context([pr({ head: { sha: 'newer', ref: 'fix/x' } })], {});
  await assert.rejects(run(stale), /changed since this event/);
});

test('API errors and unverifiable tracking issues fail the run (the CLI turns that into a warning)', async () => {
  await assert.rejects(run(context([pr(), pr()], {})), /HTTP 404/);
  await assert.rejects(run(context([pr({ body: 'no section' }), pr()], {})), /Tracking issues/);
});

test('missing trusted context is refused', async () => {
  const c = context([pr()], {});
  await assert.rejects(run({ ...c, env: { ...c.env, GITHUB_TOKEN: '' } }), /trusted workflow context/);
});
