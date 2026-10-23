import { FamilyMember } from '../../core/api/api';

/**
 * A parent can't have the children and be unavailable at the same time (owner decisions, October 22, 2026; #210).
 * The API refuses both with these error keys; this says it with the caregiver's name, never the unavailable time's
 * private details, and shows it with the event's time.
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

export const OVERLAPS_YOUR_PARENTING_TIME_TEXT =
  'You have parenting time then. Choose another time, or change that parenting time first.';

/**
 * The server's field errors, with an own-overlap refusal as `when`: a sentence under the dates naming the caregiver.
 * It stays visible text, unlike an invalid date, which is only red (#248).
 */
export function withOwnOverlap(
  errors: Record<string, string>,
  caregiver: FamilyMember | undefined,
): Record<string, string> {
  const {
    [CAREGIVER_UNAVAILABLE]: unavailable,
    [OVERLAPS_YOUR_PARENTING_TIME]: parenting,
    ...rest
  } = errors;
  if (unavailable) {
    return { ...rest, when: caregiverUnavailableText(caregiver) };
  }
  if (parenting) {
    return { ...rest, when: OVERLAPS_YOUR_PARENTING_TIME_TEXT };
  }
  return errors;
}
