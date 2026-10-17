import { Injectable } from '@angular/core';
import { ChildRef, DashboardWeek, PlainDate } from './model';
import { addDays } from './week';

/** Loads one week of dashboard data for a family. `null` means the feature isn't available yet. */
export abstract class DashboardDataSource {
  abstract load(familyId: string, weekStart: PlainDate): Promise<DashboardWeek | null>;
}

/**
 * The real source. The API has no calendar, approval, child-profile, message or memory endpoints yet, so it
 * reports "not available" rather than inventing data or calling endpoints that don't exist. Replace the body when
 * they land; model.ts describes the shapes the dashboard needs.
 */
@Injectable({ providedIn: 'root' })
export class LiveDashboardDataSource extends DashboardDataSource {
  override async load(): Promise<DashboardWeek | null> {
    return null;
  }
}

/**
 * SYNTHETIC SAMPLE DATA, for reviewing the layout in development builds only (`?sample=1`). It mirrors the
 * approved dashboard screenshot (docs/design/APPROVED_DASHBOARD_2026-10-16.md) on real dates: fictional Kai and
 * Aurora, a week of "Time with Dad", and the week's activities. It is never shown in production builds, never sent
 * anywhere, and the page labels it on screen as sample data.
 */
export class SampleDashboardDataSource extends DashboardDataSource {
  override async load(_familyId: string, weekStart: PlainDate): Promise<DashboardWeek> {
    // Offsets are days from Sunday: 0 = Sunday … 6 = Saturday, 7 = next Sunday.
    const date = (offset: number) => addDays(weekStart, offset);
    const at = (offset: number, time: string) => `${date(offset)}T${time}`;
    const kai: ChildRef = { id: 'sample-kai', name: 'Kai' };
    const aurora: ChildRef = { id: 'sample-aurora', name: 'Aurora' };
    const dad = { membershipId: 'sample-dad', displayName: 'Dad' };
    const mom = { membershipId: 'sample-mom', displayName: 'Mom' };

    return {
      source: 'sample',
      parentingTime: [
        // One continuous all-day arrangement for both children: shown as a single block across the week.
        ...[kai, aurora].map((child) => ({
          id: `week-${child.id}`,
          child,
          caregiver: dad,
          start: at(0, '00:00'),
          end: at(7, '00:00'),
          status: 'confirmed' as const,
        })),
        // A proposal: kept apart, labelled "Proposed", and not part of the schedule until both parents agree.
        { id: 'proposal-kai', child: kai, caregiver: mom, start: at(6, '10:00'), end: at(6, '18:00'), status: 'proposed' },
      ],
      events: [
        { id: 'e-dropoff', title: 'School Drop-off', date: date(1), time: '08:00', durationMinutes: 30, category: 'school', children: [kai], status: 'confirmed' },
        { id: 'e-piano', title: 'Piano Lesson', date: date(2), time: '16:00', category: 'music', children: [aurora], status: 'confirmed' },
        { id: 'e-soccer', title: 'Soccer Practice', date: date(3), time: '17:30', durationMinutes: 90, category: 'sport', children: [kai], status: 'confirmed' },
        { id: 'e-dentist', title: 'Dentist Appointment', date: date(4), time: '10:00', category: 'medical', children: [kai, aurora], status: 'confirmed' },
        // Mock family event (both parents attend) for the calendar key's Family event style.
        { id: 'e-play', title: 'School Play', date: date(4), time: '18:00', durationMinutes: 90, category: 'family', children: [kai, aurora], parents: [dad, mom], status: 'confirmed' },
        // Mock "unavailable" block so the calendar key's Unavailable style appears on the sample week.
        { id: 'e-unavailable', title: 'Dad unavailable', date: date(3), time: '09:00', durationMinutes: 180, category: 'unavailable', children: [], status: 'confirmed' },
        { id: 'e-art', title: 'Art Class', date: date(5), time: '16:00', category: 'art', children: [aurora], status: 'confirmed' },
      ],
      pendingReviews: [{ id: 'r1', summary: 'Time with Mom for Kai, Saturday 10:00 AM – 6:00 PM', proposedBy: 'Dad' }],
      kidShares: [
        { id: 'k1', child: aurora, kind: 'drawing', sharedAt: '2 hours ago' },
        { id: 'k2', child: kai, kind: 'photo', sharedAt: '5 hours ago' },
      ],
      // Messaging is parent-to-parent in the architecture, so the sample messages come from the co-parent.
      recentMessages: [
        { id: 'msg1', from: 'Dad', preview: 'Can you pick Aurora up after art class?', sentAt: '3:24 PM' },
        { id: 'msg2', from: 'Dad', preview: 'Soccer practice moved to 5:30!', sentAt: '11:02 AM' },
        { id: 'msg3', from: 'Dad', preview: 'Dentist confirmed Thursday at 10.', sentAt: 'Yesterday' },
      ],
      recentMemories: [
        { id: 'm1', title: 'Sunset at the Lake', sharedBy: 'Dad', date: date(3) },
        { id: 'm2', title: 'Pumpkin Patch', sharedBy: 'Mom', date: date(-4) },
        { id: 'm3', title: 'First Day of School', sharedBy: 'Mom', date: date(-40) },
      ],
    };
  }
}
