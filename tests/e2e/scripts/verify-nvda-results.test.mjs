import { test } from 'node:test';
import assert from 'node:assert/strict';
import { join, resolve } from 'node:path';
import { reportInWorkingDirectory, verifyNvdaResults } from './verify-nvda-results.mjs';

const sha = 'a'.repeat(40);
function report() {
  return { config: { metadata: { testedSha: sha } }, suites: [{ suites: [{ specs: [
    'real-reader-smoke', 'navigation-nvda', 'forms-nvda', 'calendar-nvda', 'calendar-dialog-nvda',
  ].map(file => ({ file: `screen-reader/${file}.spec.ts`, tests: [{ status: 'expected', results: [{
    status: 'passed', attachments: [{ name: 'nvda-app-speech', body: Buffer.from(JSON.stringify([{ stage: 'test', phrases: ['actual speech'] }])).toString('base64') }],
  }] }] })) }] }] };
}
test('five passing exact-candidate executions with real speech are accepted', () => {
  assert.deepEqual(verifyNvdaResults(report(), sha), { testedSha: sha, passed: 5 });
});
test('wrong revision, missing tests, duplicates, skips, retries, infrastructure errors and absent speech fail closed', () => {
  for (const mutate of [
    r => { r.config.metadata.testedSha = 'b'.repeat(40); },
    r => { r.suites[0].suites[0].specs.pop(); },
    r => { r.suites[0].suites[0].specs[1].file = 'real-reader-smoke.spec.ts'; },
    r => { r.suites[0].suites[0].specs[0].tests[0].results[0].status = 'skipped'; },
    r => { r.suites[0].suites[0].specs[0].tests[0].results.push({ status: 'passed' }); },
    r => { r.errors = [{ message: 'startup failure' }]; },
    r => { r.suites[0].suites[0].specs[0].tests[0].results[0].attachments = []; },
    r => { r.suites[0].suites[0].specs[0].tests[0].results[0].attachments[0].body = Buffer.from('[]').toString('base64'); },
  ]) {
    const input = report();
    mutate(input);
    assert.throws(() => verifyNvdaResults(input, sha));
  }
});

test('the report path must stay inside the working directory', () => {
  // Platform paths: this test also runs on the Windows NVDA runner.
  const cwd = resolve('work', 'e2e');
  assert.equal(reportInWorkingDirectory('guidepup-results/nvda-results.json', cwd), join(cwd, 'guidepup-results', 'nvda-results.json'));
  for (const outside of ['../secrets.json', resolve(cwd, '..', 'elsewhere.json'), '.', '', undefined]) {
    assert.throws(() => reportInWorkingDirectory(outside, cwd), /NVDA (JSON )?report/);
  }
});
