import { IconName } from '../shared/icon/icon';

export interface NavItem {
  readonly label: string;
  readonly path: string;
  readonly icon: IconName;
  /** Shown next to features that aren't available yet, so nothing pretends to work. */
  readonly note?: string;
}

/** Full parent navigation (wider screens), in the order agreed in the product brief. */
export const PARENT_NAV: readonly NavItem[] = [
  { label: 'Dashboard', path: '/', icon: 'home' },
  { label: 'Calendar', path: '/calendar', icon: 'calendar' },
  { label: 'Children', path: '/children', icon: 'children' },
  { label: 'Memories', path: '/memories', icon: 'image' },
  { label: 'Messages', path: '/messages', icon: 'messages', note: 'Later' },
  { label: 'Approvals', path: '/approvals', icon: 'approvals' },
  { label: 'Settings', path: '/settings', icon: 'settings' },
];

/** Compact bottom navigation on phones; the rest is under More. */
export const PARENT_MOBILE_NAV: readonly NavItem[] = [
  { label: 'Home', path: '/', icon: 'home' },
  { label: 'Calendar', path: '/calendar', icon: 'calendar' },
  { label: 'Memories', path: '/memories', icon: 'image' },
  { label: 'Approvals', path: '/approvals', icon: 'approvals' },
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
