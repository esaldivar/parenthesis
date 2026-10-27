import { Injectable, inject } from '@angular/core';
import { Api, CalendarCategory, CalendarEvent, Child, FamilyMember } from '../../core/api/api';
import { AuthStore } from '../../core/auth/auth.store';
import { parentPalette } from '../calendar/calendar-palette';
import { FORMER_PARENT } from '../calendar/calendar-items';
import { fromFamilyLocal, lastDate, toFamilyLocal } from '../calendar/time';
import { Caregiver, ChildRef, DashboardWeek, EventCategory, FamilyEvent, ParentingTime, PlainDate } from './model';
import { addDays } from './week';

/** Loads one week of dashboard data for a family. `null` means the feature isn't available yet. */
export abstract class DashboardDataSource {
  abstract load(familyId: string, weekStart: PlainDate): Promise<DashboardWeek | null>;
}

/** How each calendar category reads on the dashboard (its icon and colour accent, always with text). */
const CATEGORIES: Record<CalendarCategory, EventCategory> = {
  ParentingTime: 'other',
  Joint: 'family',
  School: 'school',
  Medical: 'medical',
  Dental: 'medical',
  Activity: 'sport',
  Birthday: 'art',
  Holiday: 'other',
  Unavailable: 'unavailable',
  Other: 'other',
};

/**
 * The real source (#196): the shown week's parenting time and events, approvals waiting on this parent, and the
 * week's reminders and tasks, all in the family's time zone. Messages, memories and children's shares aren't built
 * yet, so they stay empty and the page says so. Unavailable time never carries another parent's private note.
 */
@Injectable({ providedIn: 'root' })
export class LiveDashboardDataSource extends DashboardDataSource {
  private readonly api = inject(Api);
  private readonly auth = inject(AuthStore);

  override async load(familyId: string, weekStart: PlainDate): Promise<DashboardWeek> {
    const zone = this.auth.currentFamily()?.timeZone ?? 'UTC';
    const weekEnd = addDays(weekStart, 7);
    const [from, to] = [fromFamilyLocal(`${weekStart}T00:00`, zone), fromFamilyLocal(`${weekEnd}T00:00`, zone)];
    const [family, children, listed, approvals, reminders, tasks] = await Promise.all([
      this.api.family(familyId),
      this.api.children(familyId),
      this.api.calendarEvents(familyId, from, to),
      this.api.approvals(familyId),
      this.api.reminders(familyId, from, to),
      this.api.tasks(familyId, weekStart, weekEnd),
    ]);
    // Declined requests (#199) stay on the Calendar page, labelled; the home page shows only what's planned or asked.
    const events = listed.filter((e) => e.status === 'Confirmed' || e.status === 'PendingApproval');
    const members = family.members;
    const parent = (membershipId: string | null): Caregiver => ({
      membershipId: membershipId ?? '',
      palette: parentPalette(membershipId, members, family.createdAt),
      displayName: members.find((m) => m.membershipId === membershipId)?.displayName ?? FORMER_PARENT,
    });
    const kids = (ids: readonly (string | null)[]): ChildRef[] =>
      ids
        .map((id) => children.find((c) => c.id === id && c.status === 'Active'))
        .filter((c): c is Child => !!c)
        .map((c) => ({ id: c.id, name: c.firstName }));

    return {
      source: 'live',
      children: children.filter((c) => c.status === 'Active').map((c) => ({ id: c.id, name: c.firstName })),
      parentingTime: events.filter((e) => e.category === 'ParentingTime').flatMap((e) => parentingTime(e, zone, kids, parent)),
      events: events.filter((e) => e.category !== 'ParentingTime').map((e) => familyEvent(e, zone, kids, members)),
      pendingReviews: approvals
        .filter((r) => r.canDecide && r.status === 'Pending')
        .map((r) => ({ id: r.id, summary: r.summary, proposedBy: parent(r.proposerMembershipId).displayName })),
      kidShares: [],
      recentMessages: [],
      recentMemories: [],
      notes: [
        ...reminders.map((r) => {
          const local = toFamilyLocal(r.startsAt, zone);
          return {
            id: `reminder-${r.id}-${r.startsAt}`,
            kind: 'reminder' as const,
            title: r.title,
            date: local.slice(0, 10),
            time: r.allDay ? undefined : local.slice(11),
            children: kids([r.childId]),
          };
        }),
        ...tasks
          .filter((t) => t.completedAt === null)
          .map((t) => ({ id: `task-${t.id}`, kind: 'task' as const, title: t.title, date: t.dueDate, children: kids([t.childId]) })),
      ],
    };
  }
}

/** One entry per child, as the dashboard groups parenting time itself. Pending time reads as proposed. */
function parentingTime(
  e: CalendarEvent,
  zone: string,
  kids: (ids: readonly string[]) => ChildRef[],
  parent: (membershipId: string | null) => Caregiver,
): ParentingTime[] {
  return kids(e.childIds).map((child) => ({
    id: `${e.id}-${child.id}`,
    child,
    caregiver: parent(e.caregiverMembershipId),
    start: toFamilyLocal(e.startsAt, zone),
    end: toFamilyLocal(e.endsAt, zone),
    status: e.status === 'PendingApproval' ? 'proposed' : 'confirmed',
    changePending: e.pendingChange !== 'None' || undefined,
    title: e.title,
    eventId: e.id,
  }));
}

function familyEvent(
  e: CalendarEvent,
  zone: string,
  kids: (ids: readonly string[]) => ChildRef[],
  members: readonly FamilyMember[],
): FamilyEvent {
  const start = toFamilyLocal(e.startsAt, zone);
  const last = lastDate(start, toFamilyLocal(e.endsAt, zone));
  const unavailable = e.category === 'Unavailable';
  const owner = members.find((m) => m.membershipId === e.ownerMembershipId);
  return {
    id: e.id,
    // Only "Unavailable" and whose it is: a private note never comes this way.
    title: unavailable ? `${owner?.isYou ? 'You’re' : `${owner?.displayName ?? FORMER_PARENT} is`} unavailable` : e.title,
    date: start.slice(0, 10),
    endDate: last > start.slice(0, 10) ? last : undefined,
    time: e.allDay ? undefined : start.slice(11),
    durationMinutes: e.allDay ? undefined : Math.round((Date.parse(e.endsAt) - Date.parse(e.startsAt)) / 60_000),
    category: CATEGORIES[e.category],
    children: kids(e.childIds),
    parents:
      e.category === 'Joint'
        ? members.filter((m) => m.role === 'Parent').map((m) => ({ membershipId: m.membershipId, displayName: m.displayName }))
        : undefined,
    status: e.status === 'PendingApproval' ? 'proposed' : 'confirmed',
  };
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
    const dad = { membershipId: 'sample-dad', displayName: 'Dad', palette: 'parent-a' as const };
    const mom = { membershipId: 'sample-mom', displayName: 'Mom', palette: 'parent-b' as const };

    return {
      source: 'sample',
      children: [kai, aurora],
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
      notes: [
        { id: 'n1', kind: 'reminder', title: 'Spirit Day: wear blue', date: date(5), children: [kai] },
        { id: 'n2', kind: 'task', title: 'Sign field trip form', date: date(4), children: [aurora] },
      ],
    };
  }
}
