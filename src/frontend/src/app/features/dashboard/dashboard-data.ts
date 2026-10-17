import { Injectable } from '@angular/core';
import { DashboardWeek, ParentingTime, PlainDate } from './model';
import { addDays } from './week';

/** Loads one week of dashboard data for a family. `null` means the feature isn't available yet. */
export abstract class DashboardDataSource {
  abstract load(familyId: string, weekStart: PlainDate): Promise<DashboardWeek | null>;
}

/**
 * The real source. The API has no calendar, approval, child-profile or memory endpoints yet, so it reports
 * "not available" rather than inventing data or calling endpoints that don't exist. Replace the body when they land.
 */
@Injectable({ providedIn: 'root' })
export class LiveDashboardDataSource extends DashboardDataSource {
  override async load(): Promise<DashboardWeek | null> {
    return null;
  }
}

/**
 * SYNTHETIC SAMPLE DATA, for reviewing the layout in development builds only (`?sample=1`). Fictional people
 * (Kai and Aurora, cared for by Jordan and Alex, as in docs/design/DASHBOARD.md). It is never shown in production
 * builds, never sent anywhere, and the page labels it on screen as sample data.
 */
export class SampleDashboardDataSource extends DashboardDataSource {
  override async load(_familyId: string, weekStart: PlainDate): Promise<DashboardWeek> {
    // Offsets are days from Sunday: 1 = Monday … 6 = Saturday, 8 = next Monday.
    const day = (offset: number, time: string) => `${addDays(weekStart, offset)}T${time}`;
    const kai = { id: 'sample-kai', name: 'Kai' };
    const aurora = { id: 'sample-aurora', name: 'Aurora' };
    const jordan = { membershipId: 'sample-jordan', displayName: 'Jordan' };
    const alex = { membershipId: 'sample-alex', displayName: 'Alex' };
    const both = (id: string, caregiver: typeof jordan, start: string, end: string, extra: Partial<ParentingTime> = {}) =>
      [kai, aurora].map((child) => ({ id: `${id}-${child.id}`, child, caregiver, start, end, status: 'confirmed' as const, ...extra }));

    return {
      source: 'sample',
      parentingTime: [
        // Same schedule for both children → one block each time.
        ...both('mon', jordan, day(1, '08:00'), day(3, '18:00')),
        ...both('wed', alex, day(3, '18:00'), day(5, '15:00'), { changePending: true }),
        // Different schedules over the weekend → separate blocks.
        { id: 'fri-kai', child: kai, caregiver: jordan, start: day(5, '15:00'), end: day(8, '08:00'), status: 'confirmed' },
        { id: 'fri-aurora', child: aurora, caregiver: alex, start: day(5, '15:00'), end: day(8, '08:00'), status: 'confirmed' },
        // A proposal: shown separately and never as confirmed.
        { id: 'sat-kai', child: kai, caregiver: alex, start: day(6, '10:00'), end: day(7, '12:00'), status: 'proposed' },
      ],
      events: [
        { id: 'e1', title: 'Dentist check-up', date: addDays(weekStart, 2), time: '09:30', children: [aurora], status: 'confirmed' },
        { id: 'e2', title: 'School concert', date: addDays(weekStart, 4), time: '18:00', children: [kai, aurora], status: 'confirmed' },
        { id: 'e3', title: 'Soccer tournament', date: addDays(weekStart, 6), time: '10:00', children: [kai], status: 'proposed' },
      ],
      pendingReviews: [{ id: 'r1', summary: 'Kai with Alex, Saturday 10:00 AM to Sunday 12:00 PM', proposedBy: 'Alex' }],
      recentMemories: [
        { id: 'm1', title: 'Aurora’s autumn painting', sharedBy: 'Aurora', date: addDays(weekStart, -2) },
        { id: 'm2', title: 'Pumpkin patch', sharedBy: 'Jordan', date: addDays(weekStart, -5) },
      ],
    };
  }
}
