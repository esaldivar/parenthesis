import { Routes } from '@angular/router';

// Order follows the approved navigation (docs/design/APPROVED_DASHBOARD_2026-10-16.md).
export const PARENT_ROUTES: Routes = [
  { path: '', title: 'Home', loadComponent: () => import('./dashboard/pages/dashboard-page/dashboard-page.component').then((m) => m.DashboardPage) },
  {
    path: 'calendar/new',
    title: 'Add to calendar',
    loadComponent: () => import('./calendar/pages/add-event-page/add-event-page.component').then((m) => m.AddEventPage),
  },
  {
    path: 'calendar/reminders/:reminderId/edit',
    title: 'Edit reminder',
    loadComponent: () => import('./calendar/pages/reminder-edit-page/reminder-edit-page.component').then((m) => m.ReminderEditPage),
  },
  {
    path: 'calendar/tasks/:taskId/edit',
    title: 'Edit task',
    loadComponent: () => import('./calendar/pages/task-edit-page/task-edit-page.component').then((m) => m.TaskEditPage),
  },
  {
    path: 'calendar/:eventId/edit',
    title: 'Edit event',
    loadComponent: () => import('./calendar/pages/event-edit-page/event-edit-page.component').then((m) => m.EventEditPage),
  },
  {
    path: 'calendar/:eventId/swap',
    title: 'Request swap',
    loadComponent: () => import('./calendar/pages/swap-request-page/swap-request-page.component').then((m) => m.SwapRequestPage),
  },
  {
    path: 'calendar',
    title: 'Calendar',
    loadComponent: () => import('./calendar/pages/calendar-page/calendar-page.component').then((m) => m.CalendarPage),
  },
  {
    path: 'notifications',
    title: 'Notifications',
    loadComponent: () => import('./notifications/pages/notifications-page/notifications-page.component').then((m) => m.NotificationsPage),
  },
  // The parents' conversation (#125, ADR-0008). Children never reach it.
  {
    path: 'messages',
    title: 'Messages',
    loadComponent: () => import('./messages/pages/messages-page/messages-page.component').then((m) => m.MessagesPage),
  },
  // Transcripts (slice 3): the phone's screen for Save transcript and Saved transcripts.
  {
    path: 'messages/transcripts',
    title: 'Transcripts',
    loadComponent: () => import('./messages/pages/transcripts-page/transcripts-page.component').then((m) => m.TranscriptsPage),
  },
  {
    path: 'from-your-kids',
    title: 'From Your Kids',
    loadComponent: () => import('./from-your-kids/pages/from-your-kids-page/from-your-kids-page.component').then((m) => m.FromYourKidsPage),
  },
  // Event photos (#403): temporary, private by default, parents only.
  {
    path: 'memories',
    title: 'Family Memories',
    loadComponent: () => import('./memories/pages/memories-page/memories-page.component').then((m) => m.MemoriesPage),
  },
  {
    path: 'memories/:eventId',
    title: 'Family Memory',
    loadComponent: () => import('./memories/pages/memory-page/memory-page.component').then((m) => m.MemoryPage),
  },
  {
    path: 'child-essentials',
    title: 'Child Essentials',
    loadComponent: () => import('./child-essentials/pages/child-essentials-page/child-essentials-page.component').then((m) => m.ChildEssentialsPage),
  },
  // Older links to /children land on its replacement.
  { path: 'children', redirectTo: 'child-essentials' },
  {
    path: 'approvals',
    title: 'Approvals',
    loadComponent: () => import('./approvals/pages/approvals-page/approvals-page.component').then((m) => m.ApprovalsPage),
  },
  {
    path: 'shared-records',
    title: 'Shared records',
    loadComponent: () => import('./shared-records/pages/shared-records-page/shared-records-page.component').then((m) => m.SharedRecordsPage),
  },
  { path: 'settings', title: 'Settings', loadComponent: () => import('./settings/pages/settings-page/settings-page.component').then((m) => m.SettingsPage) },
  // Google sends parents back here after connecting Google Calendar (#386); the server registers this exact address.
  {
    path: 'settings/google-calendar',
    title: 'Google Calendar',
    loadComponent: () => import('./settings/pages/google-calendar-callback/google-calendar-callback.component').then((m) => m.GoogleCalendarCallback),
  },
  // Google sends parents back here after connecting Google Photos (#404); the server registers this exact address.
  {
    path: 'settings/google-photos',
    title: 'Google Photos',
    loadComponent: () => import('./settings/pages/google-photos-callback/google-photos-callback.component').then((m) => m.GooglePhotosCallback),
  },
  { path: 'more', title: 'More', loadComponent: () => import('./more/pages/more-page/more-page.component').then((m) => m.MorePage) },
];
