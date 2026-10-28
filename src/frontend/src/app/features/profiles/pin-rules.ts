/** A child's PIN is 4 to 6 digits; the parent chose its length when setting it (owner decision, October 18, 2026). */
export const CHILD_PIN_PATTERN = /^\d{4,6}$/;

/** A parent's PIN is exactly six digits (#153). */
export const PARENT_PIN_PATTERN = /^\d{6}$/;

/** Not all the same digit and not a straight run like 1234 or 987654: the server applies the same rule. */
export function isTrivialPin(pin: string): boolean {
  const steps = new Set<number>();
  for (let i = 1; i < pin.length; i++) {
    steps.add(pin.charCodeAt(i) - pin.charCodeAt(i - 1));
  }
  if (steps.size !== 1) {
    return false;
  }
  const [step] = [...steps];
  return step === 0 || step === 1 || step === -1;
}
