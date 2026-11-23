import { AppLocale } from '../../../../core/i18n/locale.service';
import { translate } from '../../../../core/i18n/translations';
import { monthDay, timeLabel } from '../../../../core/dates/dates';
import { CalendarItem } from '../../calendar-items';

// How a calendar item reads in words: when, its status and the one sentence a screen reader hears. The Quiet Planner
// views (#729) show items with ItemCard (components/item-card) and the Month bars; both use these.

/** "All day", "8:00 AM – 3:00 PM", or "Oct 20 – Oct 22" for an item over several dates. */
export function whenText(item: CalendarItem, locale: AppLocale = 'en'): string {
  const formatLocale = locale === 'en' ? 'en-US' : locale;
  if (item.lastDate > item.firstDate) {
    const range = `${monthDay(item.firstDate, formatLocale)} – ${monthDay(item.lastDate, formatLocale)}`;
    return item.allDay ? range : `${monthDay(item.firstDate, formatLocale)}, ${timeLabel(item.start.slice(11), formatLocale)} – ${monthDay(item.lastDate, formatLocale)}, ${timeLabel(item.end.slice(11), formatLocale)}`;
  }
  if (item.kind === 'task') {
    return translate('feature.due', locale);
  }
  if (item.allDay) {
    return translate('feature.all.day', locale);
  }
  // A reminder is for a moment, not a span.
  return item.kind === 'reminder'
    ? timeLabel(item.start.slice(11), formatLocale)
    : `${timeLabel(item.start.slice(11), formatLocale)} – ${timeLabel(item.end.slice(11), formatLocale)}`;
}

/**
 * The status in words. Pending and declined items are not on the schedule; a pending change leaves the event as it is
 * for now.
 */
export function statusText(item: CalendarItem, locale: AppLocale = 'en'): string | null {
  if (item.kind === 'task') {
    return item.done ? translate('feature.done', locale) : null;
  }
  switch (item.status) {
    case 'pending':
      return translate('calendar.filter.pending', locale);
    case 'change-pending':
      return item.pendingChange === 'Cancel' ? translate('calendar.cancel.pending', locale) : translate('calendar.filter.change-pending', locale);
    case 'declined':
      return translate('calendar.filter.declined', locale);
    default:
      return null;
  }
}

/** The short status word shown before a title where space is tight: "Proposed", "Declined"…; null when confirmed. */
export function statusWord(item: CalendarItem, locale: AppLocale = 'en'): string | null {
  if (item.kind === 'task') {
    return null;
  }
  switch (item.status) {
    case 'pending':
      return translate('calendar.month.proposed', locale);
    case 'declined':
      return translate('feature.declined', locale);
    case 'change-pending':
      return statusText(item, locale);
    default:
      return null;
  }
}

/** Everything a screen reader needs from one item, in one sentence. */
export function itemSummary(item: CalendarItem, locale: AppLocale = 'en'): string {
  if (item.concealed) {
    // Who and when only: a private note never appears here.
    if (locale === 'es-419') return `Horario no disponible oculto, ${item.parents[0]?.name ?? item.ownerName}, ${whenText(item, locale)}. Abre sus detalles.`;
    return `Hidden unavailable time, ${item.parents[0]?.name ?? item.ownerName}, ${whenText(item)}. Opens its details.`;
  }
  const people = [...item.parents.map((p) => p.name), ...item.children.map((c) => c.name)].join(', ');
  return [
    item.title,
    item.kind === 'unavailable' ? null : item.categoryLabel,
    whenText(item, locale),
    people || null,
    statusText(item, locale) ?? (item.kind === 'task' ? null : translate('calendar.filter.confirmed', locale)),
    item.beforeCoParentJoined ? (locale === 'es-419' ? 'Confirmado antes de que se uniera el otro padre o madre' : 'Confirmed before your co-parent joined') : null,
  ]
    .filter(Boolean)
    .join(', ');
}
