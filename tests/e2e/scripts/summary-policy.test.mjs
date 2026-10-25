import { test } from 'node:test';
import assert from 'node:assert/strict';
import { requiredProfiles, summarize } from './summary-policy.mjs';
const sha = 'a'.repeat(40);
const policy = { expectedSha: sha, startedAt: '2026-10-25T12:00:00Z', milestones: [{ tag: '@m1' }, { tag: '@m2' }, { tag: '@m3' }], regressionTag: '@regression' };
function report() {
  return { config: { metadata: { testedSha: sha } }, stats: { startTime: policy.startedAt, duration: 1000 }, suites: [{ specs: [
    ...['@m1', '@m2'].map((tag, i) => ({ title: tag, file: 'baseline.ts', line: i, tags: [tag], tests: [{ projectName: 'chromium', status: 'expected' }] })),
    { title: 'mobile journey', file: 'mobile.ts', line: 1, tags: ['@m3', '@mobile', '@regression'], tests: requiredProfiles.map(projectName => ({ projectName, status: 'expected' })) },
  ] }] };
}
test('passing executions are reported by profile without multiplying unique scenarios', () => {
  const summary = summarize(report(), policy);
  assert.equal(summary.gatePassed, true);
  assert.equal(summary.uniqueScenarios, 3);
  assert.equal(summary.total, 7);
  assert.equal(summary.profiles.length, 5);
});
for (const outcome of ['unexpected', 'skipped', 'unknown']) test(`${outcome} mobile result blocks`, () => {
  const input = report(); input.suites[0].specs[2].tests[4].status = outcome;
  assert.equal(summarize(input, policy).gatePassed, false);
});
test('controlled negative: missing WebKit profile cannot silently pass', () => {
  const input = report(); input.suites[0].specs[2].tests.pop();
  assert(summarize(input, policy).errors.some(e => e.includes('mobile-webkit-390')));
});
test('stale SHA, stale timestamp, empty results, removed milestones and global errors block', () => {
  for (const mutate of [r => { r.config.metadata.testedSha = 'b'.repeat(40); }, r => { r.stats.startTime = '2026-10-24T00:00:00Z'; }, r => { r.suites = []; }, r => { r.suites[0].specs.shift(); }, r => { r.errors = [{ message: 'runner failed' }]; }]) {
    const input = report(); mutate(input); assert.equal(summarize(input, policy).gatePassed, false);
  }
});
