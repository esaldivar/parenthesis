import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { relative, resolve, isAbsolute } from 'node:path';

/** A successful optional check must represent every current scenario and actual speech. */
export function verifyNvdaResults(report, expectedSha) {
  if (!/^[a-f0-9]{40}$/.test(expectedSha ?? '') || report.config?.metadata?.testedSha !== expectedSha) {
    throw new Error('NVDA report revision does not match the candidate.');
  }
  const specs = [];
  const visit = suite => {
    specs.push(...(suite.specs ?? []));
    for (const child of suite.suites ?? []) visit(child);
  };
  for (const suite of report.suites ?? []) visit(suite);
  const expectedFiles = new Set(['real-reader-smoke.spec.ts', 'navigation-nvda.spec.ts', 'forms-nvda.spec.ts', 'calendar-nvda.spec.ts', 'calendar-dialog-nvda.spec.ts']);
  if (specs.length !== expectedFiles.size) throw new Error('NVDA report must contain all five scenarios.');
  for (const spec of specs) {
    const file = spec.file?.replaceAll('\\', '/').split('/').at(-1);
    if (!expectedFiles.delete(file)) throw new Error('Missing, duplicate or unexpected NVDA scenario.');
    if (spec.tests?.length !== 1) throw new Error('Each NVDA scenario must run once.');
    const test = spec.tests[0];
    if (test.status !== 'expected' || test.results?.length !== 1 || test.results[0].status !== 'passed') {
      throw new Error('Failed, skipped, flaky or retried NVDA scenarios cannot pass.');
    }
    const attachment = test.results[0].attachments?.find(item => ['screen-reader-speech', 'nvda-app-speech', 'nvda-calendar-speech'].includes(item.name));
    if (!attachment?.body) throw new Error('Missing captured NVDA speech.');
    const log = JSON.parse(Buffer.from(attachment.body, 'base64').toString('utf8'));
    const phrases = Array.isArray(log) ? log.flatMap(entry => typeof entry === 'string' ? [entry] : entry.phrases ?? []) : [];
    if (!phrases.some(phrase => typeof phrase === 'string' && phrase.trim())) throw new Error('Empty captured NVDA speech.');
  }
  if (report.errors?.length) throw new Error('NVDA report contains infrastructure errors.');
  return { testedSha: expectedSha, passed: specs.length };
}

/** The report path must stay inside the working directory (SonarQube jssecurity:S8707). */
export function reportInWorkingDirectory(argument, cwd = process.cwd()) {
  if (!argument) throw new Error('Pass the NVDA JSON report path.');
  const path = resolve(cwd, argument);
  const inside = relative(cwd, path);
  if (!inside || inside.startsWith('..') || isAbsolute(inside)) throw new Error('The NVDA report must be inside the working directory.');
  return path;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  console.log(JSON.stringify(verifyNvdaResults(JSON.parse(readFileSync(reportInWorkingDirectory(process.argv[2]), 'utf8')), process.env.E2E_TESTED_SHA)));
}
