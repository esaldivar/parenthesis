import { FamilyMember } from '../../core/api/api';

/**
 * A parent can't have the children and be unavailable at the same time (owner decisions, October 22, 2026; #210).
 * The API refuses both with these error keys. Its messages identify an authorized occurrence without disclosing
 * private unavailable-time details. The warning-only swap preview can still name the caregiver locally.
 */
export const CAREGIVER_UNAVAILABLE = 'caregiverUnavailable';
export const OVERLAPS_YOUR_PARENTING_TIME = 'overlapsYourParentingTime';

export function caregiverUnavailableText(
  caregiver: FamilyMember | undefined,
  sameParent = false,
): string {
  if (caregiver?.isYou) {
    return sameParent
      ? 'You marked yourself unavailable then. Choose different dates, or change your unavailable time first.'
      : 'You marked yourself unavailable then. Choose another time, or change your unavailable time first.';
  }
  const name = caregiver?.displayName ?? 'The parent with the children';
  return sameParent
    ? `${name} is unavailable then. Choose different dates.`
    : `${name} is unavailable then. Choose another time, or another parent.`;
}

/**
 * Keep the server's authorized conflicting occurrence date/time when placing its refusal under the dates.
 * It stays visible text, unlike an invalid date, which is only red (#248).
 */
export function withOwnOverlap(errors: Record<string, string>): Record<string, string> {
  const {
    [CAREGIVER_UNAVAILABLE]: unavailable,
    [OVERLAPS_YOUR_PARENTING_TIME]: parenting,
    ...rest
  } = errors;
  if (unavailable) {
    return { ...rest, when: unavailable };
  }
  if (parenting) {
    return { ...rest, when: parenting };
  }
  return errors;
}
