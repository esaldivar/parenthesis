import a11yStates from '../a11y-states.json' with { type: 'json' };

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
        attachments: test.results?.at(-1)?.attachments ?? [],
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
  // Publish every violation for reproduction, including from failed executions that cannot count as scans below.
  // Scan attachments already hold only rule IDs and sanitized selectors, never HTML or input values.
  const violations = [];
  for (const execution of tests) {
    for (const attachment of execution.attachments.filter(a => a.name.startsWith('axe-'))) {
      try {
        const scan = JSON.parse(Buffer.from(attachment.body, 'base64').toString('utf8'));
        for (const v of Array.isArray(scan.violations) ? scan.violations : []) {
          violations.push({ rule: String(v.id), state: String(scan.state), profile: execution.profile, testedSha: scan.testedSha ?? null, targets: (v.targets ?? []).map(t => [t].flat().join(' ')) });
        }
      } catch { /* malformed attachments are rejected by the per-profile checks */ }
    }
  }
  if (violations.length) errors.push(`${violations.length} accessibility violations; no exception or baseline applies.`);
  let scans = 0, manualReviewRules = 0;
  for (const profile of requiredProfiles) {
    const expectedWidth = profile === 'chromium' ? 1280 : Number(profile.split('-').at(-1));
    const states = new Set();
    for (const execution of tests.filter(t => t.profile === profile && ['expected', 'flaky'].includes(t.outcome))) {
      for (const attachment of execution.attachments.filter(a => a.name.startsWith('axe-'))) {
        try {
          const scan = JSON.parse(Buffer.from(attachment.body, 'base64').toString('utf8'));
          if (scan.schemaVersion !== 1 || scan.testedSha !== expectedSha || scan.profile !== profile ||
              scan.viewport?.width !== expectedWidth ||
              !scan.axeVersion || !Array.isArray(scan.rules) || !scan.rules.length ||
              !Array.isArray(scan.violations) || scan.violations.length || !Array.isArray(scan.incomplete) ||
              !Number.isFinite(Date.parse(scan.capturedAt)) || Date.parse(scan.capturedAt) < Date.parse(report.stats?.startTime)) {
            throw new Error('invalid scan');
          }
          states.add(scan.state); scans++; manualReviewRules += scan.incomplete.length;
        } catch { errors.push(`Invalid accessibility scan attachment for ${profile}.`); }
      }
    }
    const missing = ['light', 'dark'].flatMap(theme => a11yStates.map(state => `${theme}-${state}`)).filter(state => !states.has(state));
    if (missing.length) errors.push(`Missing accessibility scans for ${profile}: ${missing.join(', ')}.`);
  }
  return { ran: true, gatePassed: errors.length === 0, testedSha, accessibility: { scans, manualReviewRules, violations }, uniqueScenarios: new Set(tests.map(t => t.key)).size, ...all, durationSeconds: Math.round((report.stats?.duration ?? 0) / 1000), milestones: perMilestone, regression, profiles, failedTests: tests.filter(t => t.outcome === 'unexpected').map(t => `[${t.profile}] ${t.title}`), flakyTests: tests.filter(t => t.outcome === 'flaky').map(t => `[${t.profile}] ${t.title}`), errors };
}
