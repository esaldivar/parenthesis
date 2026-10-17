import { Routes } from '@angular/router';
import { ComingSoonPage } from '../shared/coming-soon/coming-soon-page';

const comingSoon = (title: string, data: Record<string, string>) => ({
  title,
  component: ComingSoonPage,
  data: { heading: title, ...data },
});

// Order follows the approved navigation (docs/design/APPROVED_DASHBOARD_2026-10-16.md).
export const PARENT_ROUTES: Routes = [
  { path: '', title: 'Home', loadComponent: () => import('./dashboard/dashboard-page').then((m) => m.DashboardPage) },
  {
    path: 'calendar',
    title: 'Calendar',
    loadComponent: () => import('./calendar/calendar-page').then((m) => m.CalendarPage),
  },
  {
    path: 'messages',
    ...comingSoon('Messages', {
      icon: 'messages',
      intro: 'Private messages between parents.',
      emptyTitle: 'Planned for a later release',
      emptyBody: 'Messaging isn’t part of this version of Parenthesis.',
    }),
  },
  {
    path: 'from-your-kids',
    ...comingSoon('From Your Kids', {
      icon: 'pencil',
      intro: 'Drawings, photos and notes your children choose to share with you.',
      emptyBody: 'Sharing from your children’s space isn’t available yet, so nothing has been shared.',
    }),
  },
  {
    path: 'memories',
    ...comingSoon('Family Memories', {
      icon: 'album',
      intro: 'A private library of your family’s photos and children’s artwork.',
      emptyBody: 'Family memories aren’t available yet, so nothing has been uploaded or shared.',
    }),
  },
  {
    path: 'child-essentials',
    ...comingSoon('Child Essentials', {
      icon: 'children',
      intro: 'Each child’s profile and the details both parents need to know.',
      emptyBody: 'Child profiles aren’t available yet.',
    }),
  },
  // Older links to /children land on its replacement.
  { path: 'children', redirectTo: 'child-essentials' },
  {
    path: 'approvals',
    ...comingSoon('Approvals', {
      icon: 'approvals',
      intro: 'Changes to agreed schedules and deletions of shared memories need both parents to agree.',
      emptyTitle: 'No requests',
      emptyBody: 'Approvals aren’t available yet, so there’s nothing waiting for either parent.',
    }),
  },
  { path: 'settings', title: 'Settings', loadComponent: () => import('./settings/settings-page').then((m) => m.SettingsPage) },
  { path: 'more', title: 'More', loadComponent: () => import('./more/more-page').then((m) => m.MorePage) },
];
