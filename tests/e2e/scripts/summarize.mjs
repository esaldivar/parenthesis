// Existing release summary/Discord shape, now with exact SHA and required profile guards (#278).
import { appendFileSync, existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { summarize } from './summary-policy.mjs';
const here = new URL('..', import.meta.url);
const reportPath = new URL('results/results.json', here);
const summaryPath = new URL('results/summary.json', here);
const policy = JSON.parse(readFileSync(new URL('milestones.json', here), 'utf8'));
const write = text => process.env.GITHUB_STEP_SUMMARY ? appendFileSync(process.env.GITHUB_STEP_SUMMARY, text) : process.stdout.write(text);
mkdirSync(new URL('results/', here), { recursive: true });
if (!existsSync(reportPath)) {
  writeFileSync(summaryPath, JSON.stringify({ ran: false, gatePassed: false }));
  write('## Playwright release gate\n\n❌ No test results.\n');
  process.exit(1);
}
const summary = summarize(JSON.parse(readFileSync(reportPath, 'utf8')), { ...policy, expectedSha: process.env.E2E_TESTED_SHA ?? execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(), startedAt: process.env.E2E_RUN_STARTED_AT });
const row = (name, c) => `| ${name} | ${c.total} | ${c.passed} | ${c.failed} | ${c.flaky} | ${c.skipped} |`;
write([
  '## Playwright release gate', '',
  summary.gatePassed ? '✅ **Passed.** Required profiles and milestone scenarios executed successfully.' : '❌ **Failed.** This release cannot merge into develop.', '',
  `Tested SHA: \`${summary.testedSha ?? 'missing'}\``, '',
  `${summary.uniqueScenarios} unique scenarios; ${summary.total} profile executions in ${summary.durationSeconds}s. Counts below are executions, not additional unique tests.`, '',
  '| Coverage/profile | Executions | Passed | Failed | Flaky | Skipped |', '|---|---|---|---|---|---|',
  ...summary.milestones.map(m => row(m.name, m)), row('Regression', summary.regression),
  ...summary.profiles.map(p => row(p.name, p)), '',
  ...summary.errors.map(error => `- ${error}`),
  ...summary.failedTests.map(title => `- Failed: ${title}`), ...summary.flakyTests.map(title => `- Flaky: ${title}`), '',
  'HTML report, state screenshots/profile JSON and failure traces are in the run artifacts. Mobile profiles are emulation, not real-device or screen-reader acceptance.', '',
].join('\n'));
writeFileSync(summaryPath, JSON.stringify(summary, null, 2));
process.exit(summary.gatePassed ? 0 : 1);
