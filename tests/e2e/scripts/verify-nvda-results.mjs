import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { relative, resolve, isAbsolute } from 'node:path';

/** Each real reader's scenarios and the attachment names that hold its captured speech. */
export const READER_POLICIES = {
  NVDA: {
    tests: { 'real-reader-smoke.spec.ts': 1, 'navigation-nvda.spec.ts': 1, 'forms-nvda.spec.ts': 1, 'calendar-nvda.spec.ts': 1, 'calendar-dialog-nvda.spec.ts': 1 },
    attachments: ['screen-reader-speech', 'nvda-app-speech', 'nvda-calendar-speech'],
  },
  VoiceOver: {
    tests: {
      'smoke-voiceover.spec.ts': 1, 'navigation-voiceover.spec.ts': 1, 'forms-voiceover.spec.ts': 1, 'calendar-voiceover.spec.ts': 1,
      'calendar-dialog-voiceover.spec.ts': 1, 'dates-voiceover.spec.ts': 2, 'reminder-details-voiceover.spec.ts': 1, 'task-progress-voiceover.spec.ts': 1,
    },
    attachments: ['screen-reader-speech', 'voiceover-app-speech'],
  },
};

/** A successful run must hold every current scenario of that reader, each run once, with actual speech. */
export function verifyReaderResults(report, expectedSha, reader = 'NVDA') {
  const policy = READER_POLICIES[reader];
  if (!policy) throw new Error(`Unknown screen reader: ${reader}.`);
  if (!/^[a-f0-9]{40}$/.test(expectedSha ?? '') || report.config?.metadata?.testedSha !== expectedSha) {
    throw new Error(`${reader} report revision does not match the candidate.`);
  }
  const specs = [];
  const visit = suite => {
    specs.push(...(suite.specs ?? []));
    for (const child of suite.suites ?? []) visit(child);
  };
  for (const suite of report.suites ?? []) visit(suite);
  const remaining = { ...policy.tests };
  const expected = Object.values(remaining).reduce((sum, count) => sum + count, 0);
  const tests = specs.flatMap(spec => (spec.tests ?? []).map(test => ({ spec, test })));
  if (tests.length !== expected) throw new Error(`${reader} report must contain all ${expected} scenarios.`);
  for (const { spec, test } of tests) {
    const file = spec.file?.replaceAll('\\', '/').split('/').at(-1);
    if (!remaining[file]) throw new Error(`Missing, duplicate or unexpected ${reader} scenario.`);
    remaining[file]--;
    if (test.status !== 'expected' || test.results?.length !== 1 || test.results[0].status !== 'passed') {
      throw new Error(`Failed, skipped, flaky or retried ${reader} scenarios cannot pass.`);
    }
    const attachment = test.results[0].attachments?.find(item => policy.attachments.includes(item.name));
    if (!attachment?.body) throw new Error(`Missing captured ${reader} speech.`);
    const log = JSON.parse(Buffer.from(attachment.body, 'base64').toString('utf8'));
    const phrases = Array.isArray(log) ? log.flatMap(entry => typeof entry === 'string' ? [entry] : entry.phrases ?? []) : [];
    if (!phrases.some(phrase => typeof phrase === 'string' && phrase.trim())) throw new Error(`Empty captured ${reader} speech.`);
  }
  if (report.errors?.length) throw new Error(`${reader} report contains infrastructure errors.`);
  return { testedSha: expectedSha, passed: tests.length };
}

/** The Windows gate's check: all five NVDA scenarios. */
export function verifyNvdaResults(report, expectedSha) {
  return verifyReaderResults(report, expectedSha, 'NVDA');
}

/** The report path must stay inside the working directory (SonarQube jssecurity:S8707). */
export function reportInWorkingDirectory(argument, cwd = process.cwd()) {
  if (!argument) throw new Error('Pass the screen-reader JSON report path.');
  const path = resolve(cwd, argument);
  const inside = relative(cwd, path);
  if (!inside || inside.startsWith('..') || isAbsolute(inside)) throw new Error('The screen-reader report must be inside the working directory.');
  return path;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  // Optional second argument: the reader (NVDA by default, or VoiceOver).
  console.log(JSON.stringify(verifyReaderResults(JSON.parse(readFileSync(reportInWorkingDirectory(process.argv[2]), 'utf8')), process.env.E2E_TESTED_SHA, process.argv[3] ?? 'NVDA')));
}
