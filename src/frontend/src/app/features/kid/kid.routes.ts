import { Routes } from '@angular/router';
import { ComingSoonPage } from '../../shared/coming-soon/coming-soon-page';
import { KidHomePage } from './kid-home-page';

const comingSoon = (title: string, data: Record<string, string>) => ({
  title,
  component: ComingSoonPage,
  data: { heading: title, emptyTitle: 'Coming soon', ...data },
});

/** Child destinations only. The server enforces the same boundary; hiding links here is not the protection. */
export const KID_ROUTES: Routes = [
  { path: '', title: 'My space', component: KidHomePage },
  {
    path: 'artwork',
    ...comingSoon('My Artwork', {
      icon: 'palette',
      intro: 'Show off your drawings and creative projects.',
      emptyBody: 'Uploading artwork isn’t ready yet. Nothing has been added.',
    }),
  },
  {
    path: 'diary',
    ...comingSoon('My Diary', {
      icon: 'book',
      intro: 'Write about your day. Your diary is private: only you can see an entry unless you choose to share it with both parents.',
      emptyBody: 'Your diary isn’t ready yet, so there are no entries and nothing has been shared.',
    }),
  },
  {
    path: 'photos',
    ...comingSoon('My Photos', {
      icon: 'image',
      intro: 'Photos you want to keep.',
      emptyBody: 'Sharing photos isn’t ready yet. Nothing has been added.',
    }),
  },
  {
    path: 'memories',
    ...comingSoon('My Memories', {
      icon: 'star',
      intro: 'Family moments and milestones you can look back on.',
      emptyBody: 'Memories aren’t ready yet.',
    }),
  },
  { path: 'settings', title: 'Settings', loadComponent: () => import('./kid-settings-page').then((m) => m.KidSettingsPage) },
];
