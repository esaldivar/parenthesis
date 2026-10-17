import { EventCategory, FamilyEvent } from './model';
import { IconName } from '../../shared/icon/icon';

// Placement of timed activities in the week grid ("below the all-day parenting-time span" in the approved design).
// Pure functions: they read events and never change them, and activities never affect parenting time.

export const SLOT_MINUTES = 30;
/**
 * A card needs room for its icon, title, time and child avatars (in the approved design cards are taller than short
 * activities), so it is at least this many slots tall. Overlap lanes use this visual height.
 */
export const MIN_SLOTS = 9;
const DEFAULT_START_HOUR = 8;
const DEFAULT_END_HOUR = 21; // So the last label is 8 PM, as in the approved design.
const DEFAULT_DURATION = 60;

export const minutesOf = (time: string): number => {
  const [h, m] = time.split(':').map(Number);
  return h * 60 + m;
};

/** 8 AM–8 PM by default, widened to include any activity outside it. */
export function visibleHours(events: readonly FamilyEvent[]): { startHour: number; endHour: number } {
  const timed = events.filter((e) => e.time);
  const starts = timed.map((e) => minutesOf(e.time!));
  const ends = timed.map((e) => minutesOf(e.time!) + (e.durationMinutes ?? DEFAULT_DURATION));
  return {
    startHour: Math.min(DEFAULT_START_HOUR, ...starts.map((m) => Math.floor(m / 60))),
    endHour: Math.min(24, Math.max(DEFAULT_END_HOUR, ...ends.map((m) => Math.ceil(m / 60)))),
  };
}

export interface TimedPlacement {
  /** 1-based grid row within the day column. */
  readonly row: number;
  readonly span: number;
  /** 1-based lane; activities that overlap sit side by side. */
  readonly lane: number;
}

/** Rows and lanes for one day's timed activities. `lanes` is how many columns that day needs. */
export function placeDay(
  events: readonly FamilyEvent[],
  startHour: number,
): { placements: Map<string, TimedPlacement>; lanes: number } {
  const laneEnds: number[] = [];
  const placements = new Map<string, TimedPlacement>();
  const timed = events
    .filter((e) => e.time)
    .sort((a, b) => a.time!.localeCompare(b.time!) || a.title.localeCompare(b.title));

  for (const event of timed) {
    const row = Math.floor((minutesOf(event.time!) - startHour * 60) / SLOT_MINUTES) + 1;
    const span = Math.max(MIN_SLOTS, Math.ceil((event.durationMinutes ?? DEFAULT_DURATION) / SLOT_MINUTES));
    let lane = laneEnds.findIndex((end) => end <= row);
    if (lane === -1) {
      lane = laneEnds.length;
    }
    laneEnds[lane] = row + span;
    placements.set(event.id, { row, span, lane: lane + 1 });
  }
  return { placements, lanes: Math.max(1, laneEnds.length) };
}

/** Default icon per category; the category is always also named in text. */
export const CATEGORY_ICONS: Record<EventCategory, IconName> = {
  school: 'car',
  medical: 'tooth',
  music: 'music',
  sport: 'soccer',
  art: 'palette',
  family: 'children',
  unavailable: 'block',
  other: 'calendar',
};
