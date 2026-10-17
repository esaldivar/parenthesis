import { Caregiver, ChildRef, LocalDateTime, ParentingTime, PlainDate, ScheduleStatus } from './model';
import { datePart, daysBetween } from './week';

/**
 * Parenting time as displayed: children who share a caregiver, start, end and status appear in one block
 * (docs/design/DASHBOARD.md). This is presentation only. It never edits, merges or reassigns the underlying
 * parenting-time records, and splitting or regrouping can't change custody or approvals.
 */
export interface ScheduleBlock {
  readonly key: string;
  readonly children: readonly ChildRef[];
  readonly caregiver: Caregiver;
  readonly start: LocalDateTime;
  readonly end: LocalDateTime;
  readonly status: ScheduleStatus;
  readonly changePending: boolean;
  /** The records this block represents, unchanged. */
  readonly items: readonly ParentingTime[];
}

const keyOf = (p: ParentingTime) =>
  [p.caregiver.membershipId, p.start, p.end, p.status, p.changePending ? 'pending' : ''].join('|');

/**
 * Groups parenting time for display. With `split`, every child gets their own block (the optional "split this
 * week" view). Order: by start time, then caregiver, then the children's names.
 */
export function groupParentingTime(entries: readonly ParentingTime[], options: { split: boolean }): ScheduleBlock[] {
  const groups = new Map<string, ParentingTime[]>();
  for (const entry of entries) {
    const key = options.split ? `${keyOf(entry)}|${entry.child.id}` : keyOf(entry);
    groups.set(key, [...(groups.get(key) ?? []), entry]);
  }

  return [...groups.entries()]
    .map(([key, items]) => {
      const first = items[0];
      const children = [...items.map((i) => i.child)].sort((a, b) => a.name.localeCompare(b.name));
      return {
        key,
        children,
        caregiver: first.caregiver,
        start: first.start,
        end: first.end,
        status: first.status,
        changePending: first.changePending ?? false,
        items,
      };
    })
    .sort(
      (a, b) =>
        a.start.localeCompare(b.start) ||
        a.caregiver.displayName.localeCompare(b.caregiver.displayName) ||
        a.children[0].name.localeCompare(b.children[0].name),
    );
}

/** "Kai", "Kai & Aurora", "Aurora, Kai & Mia", "Aurora, Kai & 2 more" */
export function childNames(children: readonly ChildRef[], maxNamed = 3): string {
  const names = children.map((c) => c.name);
  if (names.length <= 1) return names[0] ?? '';
  if (names.length <= maxNamed) return `${names.slice(0, -1).join(', ')} & ${names.at(-1)}`;
  const shown = names.slice(0, maxNamed - 1);
  return `${shown.join(', ')} & ${names.length - shown.length} more`;
}

export interface WeekPlacement {
  /** 1-based grid columns within the week, end exclusive. */
  readonly startColumn: number;
  readonly endColumn: number;
  readonly continuesBefore: boolean;
  readonly continuesAfter: boolean;
  /** Row within the week so overlapping blocks never sit on top of each other. */
  readonly lane: number;
}

/** Where each block sits in a Monday-to-Sunday week, clipped to the week, with lanes for overlaps. */
export function placeInWeek(blocks: readonly ScheduleBlock[], weekStart: PlainDate): Map<string, WeekPlacement> {
  const laneEnds: number[] = [];
  const placements = new Map<string, WeekPlacement>();
  for (const block of blocks) {
    const startDay = daysBetween(weekStart, datePart(block.start));
    // An arrangement ending at midnight belongs to the previous day.
    const endDay = daysBetween(weekStart, datePart(block.end)) - (block.end.endsWith('T00:00') ? 1 : 0);
    if (endDay < 0 || startDay > 6) {
      continue;
    }
    const startColumn = Math.max(startDay, 0) + 1;
    const endColumn = Math.min(endDay, 6) + 2;
    let lane = laneEnds.findIndex((end) => end <= startColumn);
    if (lane === -1) {
      lane = laneEnds.length;
    }
    laneEnds[lane] = endColumn;
    placements.set(block.key, {
      startColumn,
      endColumn,
      continuesBefore: startDay < 0,
      continuesAfter: endDay > 6,
      lane,
    });
  }
  return placements;
}
