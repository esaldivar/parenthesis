import { CalendarCategory, CalendarSearch, FamilyMember } from '../../core/api/api';
import { PlainDate } from '../dashboard/model';
import { CATEGORY_LABELS } from './calendar-items';

/** The shortest text worth searching for. A date can be shorter ("5/3"). */
export const MIN_SEARCH_LENGTH = 2;

/** Other words parents use for an event type, besides the labels the calendar shows. */
const SYNONYMS: readonly (readonly [string, CalendarCategory])[] = [
  ['parenting', 'ParentingTime'],
  ['custody', 'ParentingTime'],
  ['family', 'Joint'],
  ['joint', 'Joint'],
  ['doctor', 'Medical'],
  ['dentist', 'Dental'],
  ['sport', 'Activity'],
];

const MONTHS = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];

const pad = (n: number) => String(n).padStart(2, '0');

/** A real calendar date, or null ("2/30" isn't one). */
function plainDate(year: number, month: number, day: number): PlainDate | null {
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
    ? `${year}-${pad(month)}-${pad(day)}`
    : null;
}

const fullYear = (year: string | undefined, today: PlainDate) =>
  year === undefined ? Number(today.slice(0, 4)) : year.length === 2 ? 2000 + Number(year) : Number(year);

/** 1 to 12 for a month's name or its first three or more letters ("oct", "sept"); otherwise 0. */
const monthNumber = (name: string) => MONTHS.findIndex((month) => name.length >= 3 && month.startsWith(name)) + 1;

/**
 * A date the text names, in the family's calendar: "2026-10-12", "10/12", "10/12/26", "Oct 12", "October 12, 2026" or
 * "12 Oct". Without a year it's this year. Anything else is null.
 */
export function parseDate(text: string, today: PlainDate): PlainDate | null {
  const t = text.trim().toLowerCase().replace(/,/g, ' ').replace(/\s+/g, ' ');
  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(t);
  if (m) return plainDate(Number(m[1]), Number(m[2]), Number(m[3]));
  m = /^(\d{1,2})\/(\d{1,2})(?:\/(\d{2}|\d{4}))?$/.exec(t);
  if (m) return plainDate(fullYear(m[3], today), Number(m[1]), Number(m[2]));
  m = /^([a-z]{3,9})\.? (\d{1,2})(?:st|nd|rd|th)?(?: (\d{4}))?$/.exec(t);
  if (m && monthNumber(m[1])) return plainDate(fullYear(m[3], today), monthNumber(m[1]), Number(m[2]));
  m = /^(\d{1,2})(?:st|nd|rd|th)? ([a-z]{3,9})\.?(?: (\d{4}))?$/.exec(t);
  if (m && monthNumber(m[2])) return plainDate(fullYear(m[3], today), monthNumber(m[2]), Number(m[1]));
  return null;
}

/** Event types the text names: a label it contains or that contains it ("school", "dad parenting time", "medi"). */
function categoriesIn(text: string): CalendarCategory[] {
  const found = new Set<CalendarCategory>();
  for (const [category, label] of Object.entries(CATEGORY_LABELS) as [CalendarCategory, string][]) {
    const name = label.toLowerCase();
    if (text.includes(name) || (text.length >= 3 && name.startsWith(text))) found.add(category);
  }
  for (const [word, category] of SYNONYMS) {
    if (text.includes(word) || (text.length >= 3 && word.startsWith(text))) found.add(category);
  }
  return [...found];
}

const words = (text: string) => text.split(/[^\p{L}\p{N}']+/u).filter(Boolean);

/**
 * What a parent's search text asks for (#253): titles containing it, the event types it names, and the date it names.
 * Parenting time can be narrowed to one parent by name ("Sam parenting time"). Null when there's nothing to search.
 * Plain matching only: no AI or guessing beyond these rules.
 */
export function toSearch(text: string, members: readonly FamilyMember[], today: PlainDate): CalendarSearch | null {
  const trimmed = text.trim().replace(/\s+/g, ' ');
  const on = parseDate(trimmed, today);
  if (!on && trimmed.length < MIN_SEARCH_LENGTH) return null;
  const lower = trimmed.toLowerCase();
  const categories = on ? [] : categoriesIn(lower);
  const said = words(lower);
  const named = (m: FamilyMember) => {
    const name = m.displayName.toLowerCase();
    return lower.includes(name) || said.includes(words(name)[0] ?? '');
  };
  const caregiver = categories.includes('ParentingTime')
    ? (members.find((m) => m.role === 'Parent' && named(m))?.membershipId ?? null)
    : null;
  return { q: on ? null : trimmed.slice(0, 120), categories, caregiver, on };
}
