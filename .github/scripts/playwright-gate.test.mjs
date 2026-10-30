import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

const workflow = readFileSync(new URL('../workflows/playwright-release.yml', import.meta.url), 'utf8');
const gate = workflow.split('  gate:\n')[1].split('\n  notify:')[0];
const script = gate.split('        run: |\n')[1].split('\n').map(line => line.slice(10)).join('\n');
function run(base, head, result, draft = false, fork = false) {
  return spawnSync('bash', ['-eu', '-c', script], {
    env: { ...process.env, BASE_REF: base, HEAD_REF: head, E2E_RESULT: result,
      IS_DRAFT: String(draft), FROM_FORK: String(fork) }, encoding: 'utf8',
  });
}

for (const [base, head] of [['release/0.3.0', 'feat/example'], ['release/0.4.0', 'dependabot/npm'],
  ['release/team/0.4.0', 'fix/example'], ['develop', 'release/0.3.0']]) {
  test(`${head} -> ${base}: only successful ready same-repo browser runs pass`, () => {
    assert.equal(run(base, head, 'success').status, 0);
    for (const result of ['failure', 'skipped', 'cancelled', '']) {
      const failed = run(base, head, result);
      assert.equal(failed.status, 1, `${result}: ${failed.stdout} ${failed.stderr}`);
    }
    assert.equal(run(base, head, 'success', true).status, 1);
    assert.equal(run(base, head, 'success', false, true).status, 1);
  });
}
for (const head of ['hotfix/example', 'chore/sync-main', 'feat/example']) {
  test(`${head} -> develop preserves the existing no-E2E behavior`, () => {
    assert.equal(run('develop', head, 'skipped').status, 0);
  });
}

test('workflow triggers include release targets, retargeting and draft transitions', () => {
  assert.match(workflow, /branches: \[develop, 'release\/\*\*'\]/);
  for (const event of ['opened', 'synchronize', 'reopened', 'ready_for_review', 'edited', 'converted_to_draft']) {
    assert.match(workflow.split('permissions:')[0], new RegExp(`\\b${event}\\b`));
  }
  assert.match(gate, /if: always\(\)/);
  assert.match(gate, /BASE_REF: \$\{\{ github.base_ref \}\}/);
  assert.match(gate, /E2E_RESULT: \$\{\{ needs.e2e.result \}\}/);
});

test('browser job scope covers work PRs and preserves isolation and full matrix', () => {
  const e2e = workflow.split('  e2e:\n')[1].split('\n  gate:')[0];
  assert.match(e2e, /startsWith\(github.base_ref, 'release\/'\) \|\|/);
  assert.match(e2e, /github.base_ref == 'develop' && startsWith\(github.head_ref, 'release\/'\)/);
  assert.match(e2e, /head.repo.full_name == github.repository/);
  assert.match(e2e, /!github.event.pull_request.draft/);
  assert.match(e2e, /E2E_TESTED_SHA: \$\{\{ github.sha \}\}/);
  assert.match(e2e, /\n          npm test\n/);
  assert.match(e2e, /run: node scripts\/summarize.mjs/);
});

test('webhook notifications remain restricted to release promotions', () => {
  const notify = workflow.split('  notify:\n')[1];
  assert.match(notify, /github.base_ref == 'develop' &&/);
  assert.match(notify, /startsWith\(github.head_ref, 'release\/'\)/);
});
