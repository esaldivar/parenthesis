export const requiredProfiles = ['chromium', 'mobile-chromium-320', 'mobile-chromium-390', 'mobile-webkit-320', 'mobile-webkit-390'];

/** Pure report policy. Counts executions separately from unique scenarios and never treats absent/skipped profiles as green. */
export function summarize(report, { milestones, regressionTag, expectedSha, startedAt } = {}) {
  const tests = [];
  function walk(suite, path = []) {
    for (const spec of suite.specs ?? []) {
      for (const test of spec.tests ?? []) tests.push({
        key: `${spec.file}:${spec.line}:${spec.title}`,
        title: [...path, spec.title].filter(Boolean).join(' › '),
        tags: (spec.tags ?? []).map(t => t.startsWith('@') ? t : `@${t}`),
        profile: test.projectName,
        outcome: test.status,
      });
    }
    for (const child of suite.suites ?? []) walk(child, [...path, child.title].filter(Boolean));
  }
  walk({ suites: report.suites });
  const count = list => ({ total: list.length, passed: list.filter(t => t.outcome === 'expected').length, failed: list.filter(t => t.outcome === 'unexpected').length, flaky: list.filter(t => t.outcome === 'flaky').length, skipped: list.filter(t => t.outcome === 'skipped').length });
  const all = count(tests);
  const perMilestone = milestones.map(m => ({ ...m, ...count(tests.filter(t => t.tags.includes(m.tag))) }));
  const regression = count(tests.filter(t => t.tags.includes(regressionTag)));
  const profiles = requiredProfiles.map(name => ({ name, ...count(tests.filter(t => t.profile === name)), scenarios: new Set(tests.filter(t => t.profile === name).map(t => t.key)).size }));
  const errors = [];
  const testedSha = report.config?.metadata?.testedSha;
  if (!/^[a-f0-9]{40}$/.test(testedSha ?? '') || !expectedSha || testedSha !== expectedSha) errors.push('Missing or stale tested SHA.');
  if (startedAt && (!Number.isFinite(Date.parse(report.stats?.startTime)) || Date.parse(report.stats.startTime) < Date.parse(startedAt) - 5000)) errors.push('Stale or missing report start time.');
  if (report.errors?.length) errors.push('Playwright reported infrastructure/global errors.');
  if (!all.total) errors.push('No test executions.');
  if (all.failed || all.skipped) errors.push('Failed or skipped executions cannot certify the release.');
  if (tests.some(t => !['expected', 'unexpected', 'flaky', 'skipped'].includes(t.outcome))) errors.push('Unknown test outcome.');
  if (tests.some(t => !milestones.some(m => t.tags.includes(m.tag)))) errors.push('Untagged tests.');
  for (const m of milestones) {
    if (!tests.some(t => t.profile === 'chromium' && t.tags.includes(m.tag) && ['expected', 'flaky'].includes(t.outcome))) errors.push(`Missing executed desktop coverage for ${m.tag}.`);
  }
  for (const profile of profiles) {
    if (!tests.some(t => t.profile === profile.name && t.tags.includes('@m3') && t.tags.includes('@mobile') && ['expected', 'flaky'].includes(t.outcome))) errors.push(`Missing executed mobile acceptance scenarios for ${profile.name}.`);
  }
  return { ran: true, gatePassed: errors.length === 0, testedSha, uniqueScenarios: new Set(tests.map(t => t.key)).size, ...all, durationSeconds: Math.round((report.stats?.duration ?? 0) / 1000), milestones: perMilestone, regression, profiles, failedTests: tests.filter(t => t.outcome === 'unexpected').map(t => `[${t.profile}] ${t.title}`), flakyTests: tests.filter(t => t.outcome === 'flaky').map(t => `[${t.profile}] ${t.title}`), errors };
}
