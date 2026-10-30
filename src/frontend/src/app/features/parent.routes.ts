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
    path: 'calendar/new',
    title: 'Add to calendar',
    loadComponent: () => import('./calendar/add-event-page').then((m) => m.AddEventPage),
  },
  {
    path: 'calendar/reminders/:reminderId/edit',
    title: 'Edit reminder',
    loadComponent: () => import('./calendar/reminder-edit-page').then((m) => m.ReminderEditPage),
  },
  {
    path: 'calendar/tasks/:taskId/edit',
    title: 'Edit task',
    loadComponent: () => import('./calendar/task-edit-page').then((m) => m.TaskEditPage),
  },
  {
    path: 'calendar/:eventId/edit',
    title: 'Edit event',
    loadComponent: () => import('./calendar/event-edit-page').then((m) => m.EventEditPage),
  },
  {
    path: 'calendar/:eventId/swap',
    title: 'Request swap',
    loadComponent: () => import('./calendar/swap-request-page').then((m) => m.SwapRequestPage),
  },
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
    title: 'Approvals',
    loadComponent: () => import('./approvals/approvals-page').then((m) => m.ApprovalsPage),
  },
  { path: 'settings', title: 'Settings', loadComponent: () => import('./settings/settings-page').then((m) => m.SettingsPage) },
  // Google sends parents back here after connecting Google Calendar (#386); the server registers this exact address.
  {
    path: 'settings/google-calendar',
    title: 'Google Calendar',
    loadComponent: () => import('./settings/google-calendar-callback').then((m) => m.GoogleCalendarCallback),
  },
  { path: 'more', title: 'More', loadComponent: () => import('./more/more-page').then((m) => m.MorePage) },
];
