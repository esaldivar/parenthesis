import { createRequire } from 'node:module';
import type { AxeResults, Result, RunOptions } from 'axe-core';
import { expect, Page, TestInfo } from '@playwright/test';

const require = createRequire(import.meta.url);
const options: RunOptions = {
  runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice'] },
};

/** Whole rendered document, including open overlays. No exclusions or disabled contrast rules. */
export async function analyze(page: Page): Promise<AxeResults> {
  await page.addScriptTag({ path: require.resolve('axe-core/axe.min.js') });
  return page.evaluate(async options => {
    const axe = (window as unknown as { axe: { run(options: unknown): Promise<AxeResults> } }).axe;
    return axe.run(options);
  }, options);
}

/** Only selectors and rule metadata are exported; never HTML, input values or failure-summary text. */
function finding(result: Result) {
  return { id: result.id, impact: result.impact, helpUrl: result.helpUrl, targets: result.nodes.map(n => n.target) };
}

export async function scan(page: Page, info: TestInfo, state: string) {
  await expect(page.locator('main')).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
  const result = await analyze(page);
  const report = {
    schemaVersion: 1, state, testedSha: info.config.metadata['testedSha'],
    profile: info.project.name, capturedAt: new Date().toISOString(),
    browser: info.project.use.browserName, viewport: page.viewportSize(), axeVersion: result.testEngine.version,
    rules: [...result.passes, ...result.violations, ...result.incomplete, ...result.inapplicable].map(r => r.id),
    violations: result.violations.map(finding), incomplete: result.incomplete.map(finding),
  };
  await info.attach(`axe-${state}`, { body: JSON.stringify(report, null, 2), contentType: 'application/json' });
  expect(report.rules.length, 'the scanner must execute rules').toBeGreaterThan(0);
  // Keep collecting later states after a violation; soft assertions still fail the test and release gate.
  expect.soft(report.violations, `Accessibility violations in ${state}; see axe attachment`).toEqual([]);
}

export async function describedReason(page: Page, selector: string, expected: RegExp) {
  const input = page.locator(selector);
  await expect(input).toHaveAttribute('aria-invalid', 'true');
  const description = await input.evaluate(el => (el.getAttribute('aria-describedby') ?? '').split(/\s+/)
    .map(id => document.getElementById(id)?.textContent ?? '').join(' '));
  expect(description, 'invalid field has an associated reason').toMatch(expected);
}
