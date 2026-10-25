import { expect } from 'vitest';

/** Check the actual association Material supplies to assistive technology, not just hidden text in the DOM. */
export function expectDateFormat(input: Element): void {
  const descriptions = (input.getAttribute('aria-describedby') ?? '').split(/\s+/).filter(Boolean)
    .map((id) => input.ownerDocument.getElementById(id));
  const hint = descriptions.find((el) => el?.textContent?.includes('MM/DD/YYYY'));
  expect(hint).toBeDefined();
  expect(hint?.classList.contains('visually-hidden')).toBe(true);
  expect(hint?.textContent).toContain('YYYY-MM-DD');
}
