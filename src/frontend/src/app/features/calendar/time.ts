import { LocalDateTime, PlainDate } from '../dashboard/model';
import { addDays, nowIn } from '../dashboard/week';

// The calendar API stores instants (UTC). Parents see and enter wall-clock times in the family's time zone, so a
// 3 PM pickup reads 3 PM for both parents wherever they are.

/** An instant from the API as wall-clock time in the family's zone: "YYYY-MM-DDTHH:mm". */
export function toFamilyLocal(instant: string, timeZone: string): LocalDateTime {
  return nowIn(timeZone, new Date(instant));
}

/** The family zone's offset from UTC at `utcMs`, in minutes (positive east of UTC). */
function offsetMinutes(utcMs: number, timeZone: string): number {
  const local = nowIn(timeZone, new Date(utcMs));
  const [date, time] = local.split('T');
  const [y, m, d] = date.split('-').map(Number);
  const [h, min] = time.split(':').map(Number);
  return Math.round((Date.UTC(y, m - 1, d, h, min) - Math.floor(utcMs / 60_000) * 60_000) / 60_000);
}

/**
 * Wall-clock time in the family's zone as an ISO instant with its offset, for the API. Around a daylight-saving
 * change the offset is taken at the requested time (a 2:30 AM that doesn't exist moves forward by the gap).
 */
export function fromFamilyLocal(local: LocalDateTime, timeZone: string): string {
  const [date, time] = local.split('T');
  const [y, m, d] = date.split('-').map(Number);
  const [h, min] = time.split(':').map(Number);
  const wall = Date.UTC(y, m - 1, d, h, min);
  let offset = offsetMinutes(wall, timeZone);
  offset = offsetMinutes(wall - offset * 60_000, timeZone);
  return new Date(wall - offset * 60_000).toISOString();
}

/** The last calendar date an item covers, when `end` is exclusive (an all-day event ending at midnight). */
export function lastDate(start: LocalDateTime, end: LocalDateTime): PlainDate {
  const endDate = end.slice(0, 10);
  const startDate = start.slice(0, 10);
  if (endDate > startDate && end.slice(11) === '00:00') {
    return addDays(endDate, -1);
  }
  return endDate < startDate ? startDate : endDate;
}

/** Minutes after midnight for "YYYY-MM-DDTHH:mm". */
export const minutesOfDay = (value: LocalDateTime): number => {
  const [h, m] = value.slice(11, 16).split(':').map(Number);
  return h * 60 + m;
};
