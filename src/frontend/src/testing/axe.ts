import axe from 'axe-core';

/**
 * Runs axe-core against rendered DOM. Colour contrast is off here because jsdom has no layout or computed colours;
 * contrast is checked against the design tokens in tokens.spec.ts and by manual review in both themes.
 */
export async function axeViolations(element: Element): Promise<string[]> {
  const results = await axe.run(element, {
    rules: { 'color-contrast': { enabled: false } },
  });
  return results.violations.map((v) => `${v.id}: ${v.help} (${v.nodes.length})`);
}
