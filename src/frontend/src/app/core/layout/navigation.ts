import type { TranslationKey } from '../i18n/translations';
import { IconName } from '../../shared/components/icon/icon';

export interface NavItem {
  readonly label: string;
  readonly path: string;
  readonly icon: IconName;
  /** Shown next to features that aren't available yet, so nothing pretends to work. */
  readonly note?: string;
}

type ParentNavItem = Omit<NavItem, 'label'> & { readonly labelKey: TranslationKey };

const MOBILE_PRIMARY_COUNT = 3;

/** The parent destination order (#549), shared by the sidebar, bottom bar and More. */
export const PARENT_NAV: readonly ParentNavItem[] = [
  { labelKey: 'nav.home', path: '/', icon: 'home' },
  { labelKey: 'nav.calendar', path: '/calendar', icon: 'calendar' },
  { labelKey: 'nav.messages', path: '/messages', icon: 'messages' },
  { labelKey: 'nav.records', path: '/shared-records', icon: 'receipt' },
  { labelKey: 'nav.essentials', path: '/child-essentials', icon: 'children' },
  { labelKey: 'nav.fromKids', path: '/from-your-kids', icon: 'pencil' },
  { labelKey: 'nav.memories', path: '/memories', icon: 'album' },
  { labelKey: 'settings.title', path: '/settings', icon: 'settings' },
];

export const PARENT_MOBILE_NAV: readonly ParentNavItem[] = [
  ...PARENT_NAV.slice(0, MOBILE_PRIMARY_COUNT),
  { labelKey: 'nav.more', path: '/more', icon: 'more' },
];

export const PARENT_MORE_NAV = PARENT_NAV.slice(MOBILE_PRIMARY_COUNT);

/** Only child-appropriate destinations. No approvals, messages, calendar negotiation or parent data. */
export const KID_NAV: readonly NavItem[] = [
  { label: 'Home', path: '/kid', icon: 'leaf' },
  { label: 'My Artwork', path: '/kid/artwork', icon: 'palette' },
  { label: 'My Diary', path: '/kid/diary', icon: 'book' },
  { label: 'My Photos', path: '/kid/photos', icon: 'image' },
  { label: 'My Memories', path: '/kid/memories', icon: 'star' },
];
