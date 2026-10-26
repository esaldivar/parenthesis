import { test } from 'node:test';
import assert from 'node:assert/strict';
import { requiredProfiles, summarize } from './summary-policy.mjs';
import a11yStates from '../a11y-states.json' with { type: 'json' };
const sha = 'a'.repeat(40);
const policy = { expectedSha: sha, startedAt: '2026-10-25T12:00:00Z', milestones: [{ tag: '@m1' }, { tag: '@m2' }, { tag: '@m3' }], regressionTag: '@regression' };
function report() {
  return { config: { metadata: { testedSha: sha } }, stats: { startTime: policy.startedAt, duration: 1000 }, suites: [{ specs: [
    ...['@m1', '@m2'].map((tag, i) => ({ title: tag, file: 'baseline.ts', line: i, tags: [tag], tests: [{ projectName: 'chromium', status: 'expected' }] })),
    { title: 'mobile journey', file: 'mobile.ts', line: 1, tags: ['@m3', '@mobile', '@regression'], tests: requiredProfiles.map(projectName => ({ projectName, status: 'expected', results: [{ attachments: ['light', 'dark'].flatMap(theme => a11yStates.map(state => ({ name: `axe-${theme}-${state}`, body: Buffer.from(JSON.stringify({ schemaVersion: 1, testedSha: sha, profile: projectName, viewport: { width: projectName === 'chromium' ? 1280 : Number(projectName.split('-').at(-1)), height: projectName === 'chromium' ? 800 : 844 }, state: `${theme}-${state}`, capturedAt: policy.startedAt, axeVersion: '4.14.0', rules: ['label'], violations: [], incomplete: [] })).toString('base64') }))) }] })) },
  ] }] };
}
test('passing executions are reported by profile without multiplying unique scenarios', () => {
  const summary = summarize(report(), policy);
  assert.equal(summary.gatePassed, true);
  assert.equal(summary.uniqueScenarios, 3);
  assert.equal(summary.total, 7);
  assert.equal(summary.profiles.length, 5);
});
test('missing, stale, empty, malformed and violated accessibility scans cannot certify a release', () => {
  for (const mutate of [
    attachments => attachments.pop(),
    attachments => { attachments[0].body = 'invalid'; },
    attachments => { const scan = JSON.parse(Buffer.from(attachments[0].body, 'base64')); scan.testedSha = 'b'.repeat(40); attachments[0].body = Buffer.from(JSON.stringify(scan)).toString('base64'); },
    attachments => { const scan = JSON.parse(Buffer.from(attachments[0].body, 'base64')); scan.rules = []; attachments[0].body = Buffer.from(JSON.stringify(scan)).toString('base64'); },
    attachments => { const scan = JSON.parse(Buffer.from(attachments[0].body, 'base64')); scan.violations = [{ id: 'label' }]; attachments[0].body = Buffer.from(JSON.stringify(scan)).toString('base64'); },
  ]) {
    const input = report(); mutate(input.suites[0].specs[2].tests[0].results[0].attachments);
    assert.equal(summarize(input, policy).gatePassed, false);
  }
});
for (const outcome of ['unexpected', 'skipped', 'unknown']) test(`${outcome} mobile result blocks`, () => {
  const input = report(); input.suites[0].specs[2].tests[4].status = outcome;
  assert.equal(summarize(input, policy).gatePassed, false);
});
test('controlled negative: missing WebKit profile cannot silently pass', () => {
  const input = report(); input.suites[0].specs[2].tests.pop();
  assert(summarize(input, policy).errors.some(e => e.includes('mobile-webkit-390')));
});
test('a mobile profile scanned at desktop width cannot certify mobile coverage', () => {
  const input = report();
  const attachment = input.suites[0].specs[2].tests[1].results[0].attachments[0];
  const scan = JSON.parse(Buffer.from(attachment.body, 'base64'));
  scan.viewport.width = 1280;
  attachment.body = Buffer.from(JSON.stringify(scan)).toString('base64');
  assert.equal(summarize(input, policy).gatePassed, false);
});
test('stale SHA, stale timestamp, empty results, removed milestones and global errors block', () => {
  for (const mutate of [r => { r.config.metadata.testedSha = 'b'.repeat(40); }, r => { r.stats.startTime = '2026-10-24T00:00:00Z'; }, r => { r.suites = []; }, r => { r.suites[0].specs.shift(); }, r => { r.errors = [{ message: 'runner failed' }]; }]) {
    const input = report(); mutate(input); assert.equal(summarize(input, policy).gatePassed, false);
  }
});
