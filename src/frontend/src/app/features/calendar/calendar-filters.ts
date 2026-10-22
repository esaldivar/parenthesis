import { CalendarItem, ItemKind } from './calendar-items';

/**
 * Personal calendar filters (#190, design #162). They change only what this parent sees: shared records, approvals,
 * availability and conflict checks stay on the server and are never affected. Across dimensions an item must match
 * every one (AND); within a dimension it may match any ticked option (OR). Nothing ticked in a dimension matches
 * nothing (owner decision, October 22, 2026), and the page says so with Reset filters. The child filter lives in the
 * address and is separate.
 */
export type TypeOption = ItemKind;
export type ParentOption = 'created-by-me' | 'created-by-co-parent' | 'involves-me' | 'involves-co-parent';
export type ApprovalOption = 'confirmed' | 'pending' | 'change-pending';

export interface CalendarFilters {
  readonly types: readonly TypeOption[];
  readonly parents: readonly ParentOption[];
  readonly approval: readonly ApprovalOption[];
}

export type Dimension = keyof CalendarFilters;

export const TYPE_OPTIONS: readonly { id: TypeOption; label: string }[] = [
  { id: 'parenting', label: 'Parenting time' },
  { id: 'activity', label: 'Activity' },
  { id: 'family', label: 'Family event' },
  { id: 'unavailable', label: 'Unavailable' },
  { id: 'task', label: 'Task' },
  { id: 'reminder', label: 'Reminder' },
];

export const PARENT_OPTIONS: readonly { id: ParentOption; label: string }[] = [
  { id: 'created-by-me', label: 'Created by me' },
  { id: 'created-by-co-parent', label: 'Created by co-parent' },
  { id: 'involves-me', label: 'Involving me' },
  { id: 'involves-co-parent', label: 'Involving co-parent' },
];

export const APPROVAL_OPTIONS: readonly { id: ApprovalOption; label: string }[] = [
  { id: 'confirmed', label: 'Confirmed' },
  { id: 'pending', label: 'Pending approval' },
  { id: 'change-pending', label: 'Change pending' },
];

export const DIMENSIONS: readonly { id: Dimension; label: string; options: readonly { id: string; label: string }[] }[] = [
  { id: 'types', label: 'Type', options: TYPE_OPTIONS },
  { id: 'parents', label: 'Parents', options: PARENT_OPTIONS },
  { id: 'approval', label: 'Approval', options: APPROVAL_OPTIONS },
];

/** Everything shown: the default, and what Reset filters restores. */
export const ALL_FILTERS: CalendarFilters = {
  types: TYPE_OPTIONS.map((o) => o.id),
  parents: PARENT_OPTIONS.map((o) => o.id),
  approval: APPROVAL_OPTIONS.map((o) => o.id),
};

/** A dimension is active when anything in it is unticked. */
export const isActive = (filters: CalendarFilters, dimension: Dimension) =>
  filters[dimension].length < ALL_FILTERS[dimension].length;

export const activeDimensions = (filters: CalendarFilters): Dimension[] => DIMENSIONS.map((d) => d.id).filter((d) => isActive(filters, d));

/** Tasks and reminders have no approval lifecycle: they're never labelled with one (handoff, item 5). */
const approvalOf = (item: CalendarItem): ApprovalOption | null =>
  item.kind === 'task' || item.kind === 'reminder' ? null : item.status;

function matchesParents(item: CalendarItem, parents: readonly ParentOption[], me: string | undefined): boolean {
  // "Involving" uses the item's real participants: both parents for a family event, the caregiver for parenting time,
  // the owner for unavailable time. Activities, tasks and reminders name no participating parent. Never the creator.
  const involvesMe = item.parents.some((p) => p.id === me);
  const involvesOther = item.parents.some((p) => !!p.id && p.id !== me);
  return parents.some((option) => {
    switch (option) {
      case 'created-by-me':
        return item.isMine;
      case 'created-by-co-parent':
        return !item.isMine;
      case 'involves-me':
        return involvesMe;
      default:
        return involvesOther;
    }
  });
}

/** The items this parent's filters let through. `me` is the viewer's membership id. */
export function applyFilters(items: readonly CalendarItem[], filters: CalendarFilters, me: string | undefined): CalendarItem[] {
  const approvalActive = isActive(filters, 'approval');
  return items.filter((item) => {
    if (!filters.types.includes(item.kind)) {
      return false;
    }
    if (isActive(filters, 'parents') && !matchesParents(item, filters.parents, me)) {
      return false;
    }
    if (approvalActive) {
      // With only some approval states chosen, items without approval can't match any of them.
      const approval = approvalOf(item);
      return approval !== null && filters.approval.includes(approval);
    }
    return true;
  });
}

/** Read saved filters, keeping only known values. Anything unreadable falls back to showing everything. */
export function parseFilters(raw: string | null): CalendarFilters {
  if (!raw) {
    return ALL_FILTERS;
  }
  try {
    const value = JSON.parse(raw) as Partial<Record<Dimension, unknown>>;
    const pick = <T extends string>(saved: unknown, allowed: readonly T[]): readonly T[] =>
      Array.isArray(saved) ? allowed.filter((a) => saved.includes(a)) : allowed;
    return {
      types: pick(value.types, ALL_FILTERS.types),
      parents: pick(value.parents, ALL_FILTERS.parents),
      approval: pick(value.approval, ALL_FILTERS.approval),
    };
  } catch {
    return ALL_FILTERS;
  }
}

/** The browser key for one parent's filters in one family, so parents and families never share a choice. */
export const filtersKey = (userId: string, familyId: string) => `parenthesis.calendar-filters.${userId}.${familyId}`;

/**
 * A short summary for a chip: "Task, Reminder", or "hiding Unavailable" when most are still ticked, or "None" when
 * nothing is.
 */
export function selectionText(filters: CalendarFilters, dimension: Dimension): string {
  const options = DIMENSIONS.find((d) => d.id === dimension)!.options;
  const ticked = (id: string) => (filters[dimension] as readonly string[]).includes(id);
  const chosen = options.filter((o) => ticked(o.id)).map((o) => o.label);
  const hidden = options.filter((o) => !ticked(o.id)).map((o) => o.label);
  if (chosen.length === 0) {
    return 'None';
  }
  return hidden.length < chosen.length ? `hiding ${hidden.join(', ')}` : chosen.join(', ');
}

/**
 * Unavailable time hidden only by the Type filter: it still matches every other filter. The calendar shows it as a
 * subtle marker so a parent can still find it and open its details (owner decision, October 21, 2026).
 */
export function concealedUnavailable(items: readonly CalendarItem[], filters: CalendarFilters, me: string | undefined): CalendarItem[] {
  if (filters.types.includes('unavailable')) {
    return [];
  }
  return applyFilters(items, { ...filters, types: ['unavailable'] }, me).map((item) => ({ ...item, concealed: true }));
}
