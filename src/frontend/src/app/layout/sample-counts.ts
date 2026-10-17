/**
 * PLACEHOLDER — fictional unread counts for the development-only sample preview (`?sample=1`).
 *
 * There is no notifications or unread-count API yet, so real parents never see these numbers: the bell shows no
 * badge and says notifications aren't available, and the navigation shows no counts. Replace with real data when the
 * notifications/messages/kid-shares endpoints exist; delete this file then.
 */
export const SAMPLE_UNREAD: Readonly<Record<string, number>> = {
  '/messages': 3,
  '/from-your-kids': 2,
};

/** PLACEHOLDER — fictional notification count for the sample preview only. */
export const SAMPLE_NOTIFICATIONS = 3;
