// WCAG 2.2 contrast checks for the design tokens, in both themes. The tokens file is the single source of truth.
import tokensScss from '../../../styles/_tokens.scss' with { loader: 'text' };

function themeTokens(mixin: 'light' | 'dark'): Record<string, string> {
  const block = new RegExp(`@mixin ${mixin} \\{([\\s\\S]*?)\\n\\}`).exec(tokensScss)?.[1] ?? '';
  return Object.fromEntries([...block.matchAll(/--([\w-]+):\s*(#[0-9a-f]{6});/gi)].map((m) => [m[1], m[2]]));
}

function luminance(hex: string): number {
  const channel = (offset: number) => {
    const value = parseInt(hex.slice(offset, offset + 2), 16) / 255;
    return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(1) + 0.7152 * channel(3) + 0.0722 * channel(5);
}

function contrast(a: string, b: string): number {
  const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (light + 0.05) / (dark + 0.05);
}

const TEXT = 4.5; // Normal text.
const NON_TEXT = 3; // Focus indicators and meaningful control boundaries.

const pairs: [foreground: string, background: string, minimum: number][] = [
  ...['parent-a', 'parent-b', 'parenting', 'activity', 'family', 'task', 'reminder', 'unavailable'].map(
    key => [`color-calendar-${key}-fg`, `color-calendar-${key}-bg`, TEXT] as [string, string, number],
  ),
  ['color-text', 'color-canvas', TEXT],
  ['color-text', 'color-surface', TEXT],
  ['color-text', 'color-surface-soft', TEXT],
  ['color-text-secondary', 'color-canvas', TEXT],
  ['color-text-secondary', 'color-surface', TEXT],
  ['color-text-secondary', 'color-surface-soft', TEXT],
  ['color-action', 'color-canvas', TEXT],
  ['color-action', 'color-surface', TEXT],
  ['color-on-action', 'color-action', TEXT],
  ['color-on-action', 'color-action-hover', TEXT],
  ['color-on-action', 'color-action-pressed', TEXT],
  ['color-danger', 'color-canvas', TEXT],
  ['color-danger', 'color-surface', TEXT],
  ['color-disabled-text', 'color-surface', TEXT],
  ['color-on-accent', 'color-accent', TEXT],
  ['color-text', 'color-status-pending-bg', TEXT],
  ['color-text', 'color-status-confirmed-bg', TEXT],
  ['color-text', 'color-status-rejected-bg', TEXT],
  ['color-focus', 'color-canvas', NON_TEXT],
  ['color-focus', 'color-surface', NON_TEXT],
  ['color-outline', 'color-canvas', NON_TEXT],
  ['color-outline', 'color-surface', NON_TEXT],
  // The wordmark is bold display text (>= 20px), so the large-text minimum applies.
  ['brand-wordmark-parent', 'color-canvas', NON_TEXT],
  ['brand-wordmark-hesis', 'color-canvas', TEXT],
  ['brand-wordmark-parent', 'color-surface', NON_TEXT],
  ['brand-wordmark-hesis', 'color-surface', TEXT],
  // Activity categories: text sits on the fill, icons need 3:1 against it.
  ...['school', 'medical', 'music', 'sport', 'art', 'family', 'unavailable', 'other'].flatMap(
    (c) =>
      [
        ['color-text', `color-cat-${c}-bg`, TEXT],
        ['color-text-secondary', `color-cat-${c}-bg`, TEXT],
        [`color-cat-${c}-icon`, `color-cat-${c}-bg`, NON_TEXT],
      ] as [string, string, number][],
  ),
  ['color-text', 'color-parenting-bg', TEXT],
  ['color-text-secondary', 'color-parenting-bg', TEXT],
  ['color-text', 'color-avatar-parent', TEXT],
];

describe.each(['light', 'dark'] as const)('%s theme tokens', (mixin) => {
  const tokens = themeTokens(mixin);

  it('defines every token used in the contrast checks', () => {
    const missing = pairs.flatMap(([fg, bg]) => [fg, bg]).filter((name) => !tokens[name]);
    expect(missing).toEqual([]);
  });

  it.each(pairs)('%s on %s meets %s:1', (foreground, background, minimum) => {
    expect(contrast(tokens[foreground], tokens[background])).toBeGreaterThanOrEqual(minimum);
  });
});
