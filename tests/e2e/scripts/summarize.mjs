// Turns Playwright's JSON report into the release gate's summary: totals, duration, and results per milestone and
// for regression tests. Writes Markdown to $GITHUB_STEP_SUMMARY (or stdout) and results/summary.json, which the
// Discord notification reads. Test titles are synthetic (CLAUDE.md), so the summary holds no personal data.
//
// It also guards coverage: it exits with an error if a milestone in milestones.json has no tests (coverage was
// removed) or if a test has no milestone tag.
import { appendFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs';

const here = new URL('..', import.meta.url);
const reportPath = new URL('results/results.json', here);
const summaryPath = new URL('results/summary.json', here);
const { milestones, regressionTag } = JSON.parse(readFileSync(new URL('milestones.json', here), 'utf8'));

function write(markdown) {
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, markdown);
  else process.stdout.write(markdown);
}

if (!existsSync(reportPath)) {
  writeFileSync(summaryPath, JSON.stringify({ ran: false }, null, 2));
  write('## Playwright release gate\n\n❌ No test results: the suite did not run. Check the job log.\n');
  process.exit(1);
}

const report = JSON.parse(readFileSync(reportPath, 'utf8'));

// Every test, with its tags ("@m1") and its final outcome.
const tests = [];
(function walk(suite, path) {
  for (const spec of suite.specs ?? []) {
    for (const test of spec.tests) {
      tests.push({
        title: [...path, spec.title].filter(Boolean).join(' › '),
        tags: (spec.tags ?? []).map((t) => (t.startsWith('@') ? t : `@${t}`)),
        // expected = passed, unexpected = failed, flaky = passed on retry, skipped.
        outcome: test.status,
      });
    }
  }
  for (const child of suite.suites ?? []) walk(child, suite.file === child.file ? [...path, child.title] : path);
})({ suites: report.suites }, []);

const count = (list) => ({
  total: list.length,
  passed: list.filter((t) => t.outcome === 'expected').length,
  failed: list.filter((t) => t.outcome === 'unexpected').length,
  flaky: list.filter((t) => t.outcome === 'flaky').length,
  skipped: list.filter((t) => t.outcome === 'skipped').length,
});

const all = count(tests);
const perMilestone = milestones.map((m) => ({ ...m, ...count(tests.filter((t) => t.tags.includes(m.tag))) }));
const regression = count(tests.filter((t) => t.tags.includes(regressionTag)));
const knownTags = new Set(milestones.map((m) => m.tag));
const untagged = tests.filter((t) => !t.tags.some((tag) => knownTags.has(tag)));
const missingCoverage = perMilestone.filter((m) => m.total === 0);
const durationSeconds = Math.round((report.stats?.duration ?? 0) / 1000);
const failedTests = tests.filter((t) => t.outcome === 'unexpected').map((t) => t.title);
const flakyTests = tests.filter((t) => t.outcome === 'flaky').map((t) => t.title);
const passed = all.failed === 0 && untagged.length === 0 && missingCoverage.length === 0 && all.total > 0;

const icon = (c) => (c.failed > 0 ? '❌' : c.total === 0 ? '⚠️' : '✅');
const row = (name, c) => `| ${icon(c)} ${name} | ${c.total} | ${c.passed} | ${c.failed} | ${c.flaky} | ${c.skipped} |`;
const lines = [
  '## Playwright release gate',
  '',
  passed ? '✅ **Passed.** Every milestone still works.' : '❌ **Failed.** This release cannot merge into `develop`.',
  '',
  `**${all.total}** tests in ${durationSeconds}s: ${all.passed} passed, ${all.failed} failed, ${all.flaky} flaky (passed on retry), ${all.skipped} skipped.`,
  '',
  '| Coverage | Tests | Passed | Failed | Flaky | Skipped |',
  '|---|---|---|---|---|---|',
  ...perMilestone.map((m) => row(m.name, m)),
  row('Regression tests for fixed bugs', regression),
  '',
];
if (failedTests.length) lines.push('**Failed:**', ...failedTests.map((t) => `- ${t}`), '');
if (flakyTests.length) lines.push('**Flaky (passed on retry; fix before the next release):**', ...flakyTests.map((t) => `- ${t}`), '');
if (missingCoverage.length) {
  lines.push('**Coverage removed:** these milestones have no tests. Released milestones must keep their tests.', ...missingCoverage.map((m) => `- ${m.name}`), '');
}
if (untagged.length) lines.push('**Untagged tests:** tag each test with its milestone (`@m1`, `@m2`, ...).', ...untagged.map((t) => `- ${t.title}`), '');
lines.push('The HTML report, and screenshots and traces of failures, are in this run’s artifacts.', '');
write(lines.join('\n'));

writeFileSync(
  summaryPath,
  JSON.stringify({ ran: true, gatePassed: passed, ...all, durationSeconds, milestones: perMilestone, regression, failedTests, flakyTests }, null, 2),
);
process.exit(passed ? 0 : 1);
