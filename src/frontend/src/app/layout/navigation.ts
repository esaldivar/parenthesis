import { IconName } from '../shared/icon/icon';

export interface NavItem {
  readonly label: string;
  readonly path: string;
  readonly icon: IconName;
  /** Shown next to features that aren't available yet, so nothing pretends to work. */
  readonly note?: string;
}

/**
 * Parent navigation, in the exact order of the approved dashboard (docs/design/APPROVED_DASHBOARD_2026-10-16.md):
 * Calendar is one standalone item; Child Essentials sits directly below Family Memories and above Settings.
 * Approvals stays reachable from the dashboard and the calendar, not from the main navigation.
 */
export const PARENT_NAV: readonly NavItem[] = [
  { label: 'Home', path: '/', icon: 'home' },
  { label: 'Calendar', path: '/calendar', icon: 'calendar' },
  { label: 'Messages', path: '/messages', icon: 'messages' },
  { label: 'From Your Kids', path: '/from-your-kids', icon: 'pencil' },
  { label: 'Family Memories', path: '/memories', icon: 'album' },
  { label: 'Child Essentials', path: '/child-essentials', icon: 'children' },
  { label: 'Settings', path: '/settings', icon: 'settings' },
];

/** Compact bottom navigation on phones; the rest is under More, in the same order as the sidebar. */
export const PARENT_MOBILE_NAV: readonly NavItem[] = [
  { label: 'Home', path: '/', icon: 'home' },
  { label: 'Calendar', path: '/calendar', icon: 'calendar' },
  { label: 'Messages', path: '/messages', icon: 'messages' },
  { label: 'Memories', path: '/memories', icon: 'album' },
  { label: 'More', path: '/more', icon: 'more' },
];

/** Only child-appropriate destinations. No approvals, messages, calendar negotiation or parent data. */
export const KID_NAV: readonly NavItem[] = [
  { label: 'Home', path: '/kid', icon: 'leaf' },
  { label: 'My Artwork', path: '/kid/artwork', icon: 'palette' },
  { label: 'My Diary', path: '/kid/diary', icon: 'book' },
  { label: 'My Photos', path: '/kid/photos', icon: 'image' },
  { label: 'My Memories', path: '/kid/memories', icon: 'star' },
];
