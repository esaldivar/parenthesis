import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { addTrackingReference, trackDependabotRun } from './dependabot-tracking.mjs';
import { references } from './pr-issue-links.mjs';

const repository = 'owner/repo';
const branch = 'dependabot/npm_and_yarn/example';
const run = {
  event: 'pull_request', head_branch: branch, head_sha: 'current',
  head_repository: { full_name: repository },
};
const notes = 'Bumps the npm group.\n\n<details>\n\n## Release notes\nVersion 2.\n\n</details>\n\n@dependabot recreate';

function scenario(prOverrides = {}, { failPatch = false, ambiguous = false } = {}) {
  const pr = {
    number: 123, state: 'open', title: 'Bump the npm group', body: notes, base: { ref: 'main' },
    user: { login: 'dependabot[bot]', type: 'Bot' },
    head: { ref: branch, sha: 'current', repo: { full_name: repository } }, ...prOverrides,
  };
  const issues = [];
  const writes = [];
  const api = async (path, options) => {
    if (options) writes.push({ path, ...options });
    if (path.startsWith('pulls?')) return [pr];
    if (path === 'pulls/123') {
      if (options && failPatch) {
        failPatch = false;
        throw new Error('simulated write error');
      }
      if (options?.body.body) pr.body = options.body.body;
      if (options?.body.base) pr.base.ref = options.body.base;
      return structuredClone(pr);
    }
    if (path.startsWith('milestones?')) return [
      { title: 'M4 — Messaging', number: 4, state: 'open' },
      ...(ambiguous ? [{ title: 'v0.4.0', number: 5, state: 'open' }] : []),
    ];
    if (path.startsWith('branches?')) return [{ name: 'release/0.4.0' }];
    if (path.startsWith('issues?')) return issues;
    if (path === 'issues' && options?.method === 'POST') {
      const number = 234 + issues.length;
      const issue = {
        ...options.body, id: number, number, state: 'open',
        html_url: `https://github.com/${repository}/issues/${number}`, user: { login: 'github-actions[bot]' },
      };
      issues.push(issue);
      return issue;
    }
    if (path === 'issues/777') return {
      id: 777, number: 777, state: 'closed', html_url: `https://github.com/${repository}/issues/777`,
    };
    return issues.find(issue => path === `issues/${issue.number}`);
  };
  return { api, pr, issues, writes };
}

test('creates the issue before editing the PR and keeps the native description byte-for-byte', async () => {
  const { api, pr, issues, writes } = scenario();
  await trackDependabotRun(api, repository, run);
  assert.deepEqual(writes.map(({ method }) => method), ['POST', 'PATCH']);
  assert.deepEqual(writes[0].body.assignees, ['esaldivar']);
  assert.deepEqual(writes[0].body.labels, ['dependencies']);
  assert.equal(issues[0].milestone, 4);
  assert.match(issues[0].body, /\/pull\/123/);
  assert.equal(pr.body, `${notes}\n\n## Tracking issues\n\nRefs #234\n`);
  assert.equal(pr.base.ref, 'release/0.4.0');
  await trackDependabotRun(api, repository, run);
  assert.equal(writes.length, 2);
});

test('recovers the issue after a failed PR write', async () => {
  const { api, pr, issues, writes } = scenario({}, { failPatch: true });
  await assert.rejects(trackDependabotRun(api, repository, run), /simulated write error/);
  assert.equal(issues.length, 1);
  assert.equal(pr.body, notes);
  await trackDependabotRun(api, repository, run);
  assert.deepEqual(writes.map(({ method }) => method), ['POST', 'PATCH', 'PATCH']);
  assert.deepEqual(references(pr.body, repository), [234]);
});

test('preserves manual references and omits ambiguous milestones', async () => {
  const { api, pr, issues } = scenario({ body: `## Tracking issues\nRefs #777\n\n## Description\n${notes}` }, { ambiguous: true });
  await trackDependabotRun(api, repository, run);
  assert.deepEqual(references(pr.body, repository), [234, 777]);
  assert.ok(pr.body.endsWith(notes));
  assert.equal(issues[0].milestone, undefined);
});

test('replaces an empty template placeholder with a verified-reference entry', () => {
  const result = addTrackingReference('## Tracking issues\n<!-- Keep -->\nRefs #ISSUE\n\n## Description\nDetail', 234, repository);
  assert.deepEqual(references(result, repository), [234]);
  assert.match(result, /<!-- Keep -->/);
  assert.match(result, /## Description\nDetail/);
});

test('ignores unrelated workflow runs, human or lookalike authors, forks, and stale heads', async () => {
  for (const [overrides, event] of [
    [{}, { ...run, event: 'push' }],
    [{}, { ...run, head_repository: { full_name: 'fork/repo' } }],
    [{}, { ...run, head_sha: 'stale' }],
    [{ user: { login: 'human', type: 'User' } }, run],
    [{ user: { login: 'dependabot[bot]', type: 'User' } }, run],
    [{ head: { ref: branch, sha: 'current', repo: { full_name: 'fork/repo' } } }, run],
  ]) {
    const { api, writes } = scenario(overrides);
    await trackDependabotRun(api, repository, event);
    assert.deepEqual(writes, []);
  }
});

test('fails closed when more than one generated issue matches the PR', async () => {
  const { api, issues, writes } = scenario();
  await trackDependabotRun(api, repository, run);
  issues.push({ ...issues[0], number: 235 });
  await assert.rejects(trackDependabotRun(api, repository, run), /Multiple tracking issues/);
  assert.equal(writes.length, 2);
});


test('tracking uses the trusted workflow event checkout without a ref override or triggering artifacts', () => {
  const workflow = readFileSync(new URL('../workflows/dependabot-tracking.yml', import.meta.url), 'utf8');
  assert.match(workflow, /workflow_run:/);
  assert.match(workflow, /uses: actions\/checkout@v7/);
  assert.doesNotMatch(workflow, /^\s+ref:/m);
  assert.doesNotMatch(workflow, /uses:.*download-artifact|workflow_run\.head_(sha|repository)/);
  assert.match(workflow, /persist-credentials: false/);
});
