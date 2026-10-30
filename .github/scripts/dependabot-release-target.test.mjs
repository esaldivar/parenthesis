import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { selectRelease, routeUpdates } from './dependabot-release-target.mjs';

const branches = (...names) => names.map(name => ({ name }));
const milestones = (...titles) => titles.map(title => ({ title, state: 'open' }));
test('selects latest numeric release with an open matching milestone', () => {
  assert.equal(selectRelease(branches('main', 'develop', 'release/0.2.0', 'release/0.3.0', 'release/0.10.0', 'release/0.11.0'),
    milestones('M2 — Onboarding', 'M3 — Calendar', 'M10 — Later')), 'release/0.10.0');
});
test('recognizes exact version milestones and excludes closed milestones', () => {
  assert.equal(selectRelease(branches('release/1.0.0', 'release/0.3.0'),
    [...milestones('M3 — Calendar'), { title: 'v1.0.0 — Beta', state: 'closed' }]), 'release/0.3.0');
  assert.equal(selectRelease(branches('release/1.0.0'), milestones('v1.0.0 — Beta')), 'release/1.0.0');
  assert.equal(selectRelease(branches('release/1.0.0'), milestones('v1.0 — Private Beta')), 'release/1.0.0');
});
test('refuses missing, malformed and unmatched branches without fallback', () => {
  for (const names of [[], ['main', 'develop'], ['release/0.03.0'], ['release/0.3.1'], ['release/0.30.0']]) {
    assert.throws(() => selectRelease(branches(...names), milestones('M3 — Calendar')), /No release branch/);
  }
});
const pr = (number, overrides = {}) => ({ number, state: 'open', user: { login: 'dependabot[bot]', type: 'Bot' },
  head: { ref: 'dependabot/npm/example', repo: { full_name: 'owner/repo' } }, base: { ref: 'main' }, ...overrides });
test('routes only open same-repository Dependabot updates and skips correct targets', async () => {
  const writes = [];
  const api = async (path, options) => {
    if (options) { writes.push([path, options.body]); return {}; }
    if (path.startsWith('branches')) return branches('release/0.3.0');
    if (path.startsWith('milestones')) return milestones('M3 — Calendar');
    return [pr(1), pr(2, { user: { login: 'human', type: 'User' } }),
      pr(3, { head: { ref: 'dependabot/npm/x', repo: { full_name: 'fork/repo' } } }),
      pr(4, { base: { ref: 'release/0.3.0' } }), pr(5, { state: 'closed' }),
      pr(6, { head: { ref: 'feature/example', repo: { full_name: 'owner/repo' } } })];
  };
  assert.equal(await routeUpdates(api, 'owner/repo'), 'release/0.3.0');
  assert.deepEqual(writes, [['pulls/1', { base: 'release/0.3.0' }]]);
});
test('PR events route only the event PR; API failures propagate', async () => {
  const paths = [];
  const api = async (path, options) => {
    paths.push(path);
    if (path.startsWith('branches')) return branches('release/0.3.0');
    if (path.startsWith('milestones')) return milestones('M3 — Calendar');
    assert.equal(options.body.base, 'release/0.3.0');
    throw new Error('permission denied');
  };
  await assert.rejects(routeUpdates(api, 'owner/repo', { pull_request: pr(7) }), /permission denied/);
  assert.deepEqual(paths, ['branches?per_page=100', 'milestones?state=open&per_page=100', 'pulls/7']);
});
test('every configured ecosystem targets release/0.3.0', () => {
  const config = readFileSync(new URL('../dependabot.yml', import.meta.url), 'utf8');
  assert.equal((config.match(/package-ecosystem:/g) || []).length, 5);
  assert.equal((config.match(/target-branch: release\/0\.3\.0/g) || []).length, 5);
});
