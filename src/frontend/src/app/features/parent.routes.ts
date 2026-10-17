import { Routes } from '@angular/router';
import { ComingSoonPage } from '../shared/coming-soon/coming-soon-page';

const comingSoon = (title: string, data: Record<string, string>) => ({
  title,
  component: ComingSoonPage,
  data: { heading: title, ...data },
});

export const PARENT_ROUTES: Routes = [
  { path: '', title: 'Home', loadComponent: () => import('./dashboard/dashboard-page').then((m) => m.DashboardPage) },
  {
    path: 'calendar',
    ...comingSoon('Calendar', {
      icon: 'calendar',
      intro: 'Parenting time, school, appointments and activities in one shared view.',
      emptyBody: 'The shared calendar isn’t available yet. Nothing you see elsewhere is scheduled until it is.',
    }),
  },
  {
    path: 'children',
    ...comingSoon('Children', {
      icon: 'children',
      intro: 'Profiles for each child, and whether they have their own sign-in.',
      emptyBody: 'Child profiles aren’t available yet.',
    }),
  },
  {
    path: 'memories',
    ...comingSoon('Memories', {
      icon: 'image',
      intro: 'A private library of your family’s photos and children’s artwork.',
      emptyBody: 'Memories aren’t available yet, so nothing has been uploaded or shared.',
    }),
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
