import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { references, validate, run } from './pr-issue-links.mjs';

const repository = 'esaldivar/parenthesis';
const body = value => `## Tracking issues\n${value}\n\n## Testing\nTests pass.`;
const issue = (number, state = 'open') => ({ id: number + 1000, number, state, html_url: `https://github.com/${repository}/issues/${number}` });
test('explicit local references, duplicates and case-insensitive full URLs', () => {
  assert.deepEqual(references(body('- Refs #132\nRefs #132\nhttps://github.com/ESALDIVAR/Parenthesis/issues/65'), repository), [132, 65]);
});
test('release rollups and hotfix syncs can reuse closed tracking issues without closing them', async () => {
  assert.deepEqual(await validate({ body: body('Refs #65\nRefs #132'), repository, getIssue: async n => issue(n, 'closed') }), [65, 132]);
});
for (const [name, text] of [
  ['missing section', 'Closes #132'], ['empty section', body('')],
  ['placeholder', body('Refs #ISSUE')], ['zero', body('Refs #0')],
  ['arbitrary mention', body('This might involve #132')],
  ['other repository shorthand', body('other/repo#132')],
  ['cross-repository URL', body('https://github.com/other/repo/issues/132')],
  ['PR URL', body('https://github.com/esaldivar/parenthesis/pull/132')],
  ['comment example', body('<!-- Refs #132 -->')],
  ['code example', body('```text\nRefs #132\n```')],
  ['inline code example', body('`Refs #132`')],
  ['duplicate section', body('Refs #132') + '\n## Tracking issues\nRefs #65'],
  ['reference in other section', body('') + '\nRefs #132'],
  ['unsafe integer', body('Refs #999999999999999999999')],
  ['HTTP URL', body('http://github.com/esaldivar/parenthesis/issues/132')],
  ['query or anchor URL', body('https://github.com/esaldivar/parenthesis/issues/132?fake=1')],
]) test(`rejects ${name}`, () => assert.throws(() => references(text, repository)));
test('rejects more than 100 unique references', () => assert.throws(() => references(body(Array.from({ length: 101 }, (_, i) => `Refs #${i + 1}`).join('\n')), repository)));
test('GitHub issues endpoint returning a PR does not count', async () => {
  await assert.rejects(validate({ body: body('Refs #124'), repository, getIssue: async n => ({ ...issue(n), pull_request: {} }) }));
});
test('every listed reference must verify, not just the first', async () => {
  await assert.rejects(validate({ body: body('Refs #132\nRefs #999'), repository, getIssue: async n => n === 132 ? issue(n) : null }));
});
test('API failure fails closed', async () => {
  await assert.rejects(validate({ body: body('Refs #132'), repository, getIssue: async () => { throw new Error('HTTP 404'); } }));
});
test('mismatched repository and malformed API responses fail closed', async () => {
  for (const result of [null, {}, { ...issue(132), state: 'unknown' }, { ...issue(132), html_url: 'https://github.com/other/repo/issues/132' }]) {
    await assert.rejects(validate({ body: body('Refs #132'), repository, getIssue: async () => result }));
  }
});

async function workflow(t, { current, second = current, status = 200, eventHead = 'head' } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'issue-links-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const file = path.join(dir, 'event.json');
  fs.writeFileSync(file, JSON.stringify({ pull_request: { number: 133, head: { sha: eventHead }, base: { ref: 'release/0.3.0' } } }));
  let reads = 0;
  const calls = [];
  const result = run({ env: { GITHUB_EVENT_PATH: file, GITHUB_REPOSITORY: repository, GITHUB_TOKEN: 'synthetic-test-token' }, fetchImpl: async (url, options) => {
    calls.push({ url, options });
    const data = url.endsWith('/pulls/133') ? (++reads === 1 ? current : second) : issue(132);
    return { ok: status === 200, status, json: async () => data };
  } });
  return { result, calls };
}
const current = { head: { sha: 'head' }, base: { ref: 'release/0.3.0' }, state: 'open', body: body('Refs #132') };
test('workflow reads live metadata twice and only fixed-origin REST GETs', async t => {
  const { result, calls } = await workflow(t, { current });
  assert.deepEqual(await result, [132]);
  assert.equal(calls.length, 3);
  assert(calls.every(c => c.url.startsWith('https://api.github.com/repos/esaldivar/parenthesis/') && c.options.redirect === 'error'));
});
test('workflow fails on stale head event', async t => {
  const { result } = await workflow(t, { current, eventHead: 'stale' });
  await assert.rejects(result, /changed/);
});
test('workflow fails if PR body changes while verifying', async t => {
  const { result } = await workflow(t, { current, second: { ...current, body: body('Refs #65') } });
  await assert.rejects(result, /changed/);
});
test('workflow fails closed on inaccessible GitHub API', async t => {
  const { result } = await workflow(t, { current, status: 403 });
  await assert.rejects(result, /HTTP 403/);
});
