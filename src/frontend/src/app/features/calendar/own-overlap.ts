import { FamilyMember } from '../../core/api/api';
import { AppLocale } from '../../core/i18n/locale.service';
import { translate } from '../../core/i18n/translations';

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
  locale: AppLocale = 'en',
): string {
  if (caregiver?.isYou) {
    return translate(sameParent ? 'calendar.unavailable.youDates' : 'calendar.unavailable.youTime', locale);
  }
  const name = caregiver?.displayName ?? translate('calendar.unavailable.caregiver', locale);
  return translate(sameParent ? 'calendar.unavailable.otherDates' : 'calendar.unavailable.otherTime', locale, { name });
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
