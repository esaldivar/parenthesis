import axe from 'axe-core';

/**
 * Runs axe-core against rendered DOM. Colour contrast is off here because jsdom has no layout or computed colours;
 * contrast is checked against the design tokens in tokens.spec.ts and by manual review in both themes.
 */
export async function axeViolations(element: Element, options: { ignoreOverlay?: boolean } = {}): Promise<string[]> {
  // In jsdom a Material select panel never finishes its closing animation, so after a test picks an option the panel
  // (and the CDK's hidden live announcer) linger outside any landmark. A real browser closes them; tests that use a
  // select leave the CDK's overlay container out.
  const context = options.ignoreOverlay
    ? { include: [element], exclude: [['.cdk-overlay-container'], ['.cdk-live-announcer-element']] }
    : element;
  const results = await axe.run(context as axe.ElementContext, {
    rules: { 'color-contrast': { enabled: false } },
  });
  return results.violations.map((v) => `${v.id}: ${v.help} (${v.nodes.length})`);
}
