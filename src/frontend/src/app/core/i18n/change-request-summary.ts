import { AppLocale } from './locale.service';
import { translate } from './translations';

/** The parts of a change request its summary is read from: the server stores the summary in English. */
export interface SummarizedRequest {
  readonly type: string;
  readonly targetType: string;
  readonly summary: string;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/** "Oct 27" in the viewer's language ("27 oct"); null if it isn't one. */
function monthDay(text: string, locale: AppLocale): string | null {
  const match = /^([A-Z][a-z]{2}) (\d{1,2})$/.exec(text.trim());
  const month = match ? MONTHS.indexOf(match[1]) : -1;
  if (!match || month < 0) return null;
  return new Intl.DateTimeFormat(locale, { month: 'short', day: 'numeric', timeZone: 'UTC' })
    .format(Date.UTC(2000, month, Number(match[2])));
}

/** "Fri, Sat and Sun" in the viewer's language ("vie, sáb y dom"); null if it isn't a weekday list. */
function dayList(text: string, locale: AppLocale): string | null {
  const names = text.split(/, | and /);
  const days = names.map((name) => WEEKDAYS.indexOf(name));
  if (days.some((day) => day < 0)) return null;
  // 2000-01-02 was a Sunday.
  const format = new Intl.DateTimeFormat(locale, { weekday: 'short', timeZone: 'UTC' });
  const local = days.map((day) => format.format(Date.UTC(2000, 0, 2 + day)));
  return local.length > 1
    ? translate('approvals.summary.list', locale, { items: local.slice(0, -1).join(', '), last: local[local.length - 1] })
    : local[0];
}

/** "every 2 weeks on Tue and Thu", "every month on the 3rd", "every day"; null if it isn't one. */
function repeat(text: string, locale: AppLocale): string | null {
  let match = /^every (?:(\d+) )?days?$/.exec(text);
  if (match) return match[1] ? translate('approvals.summary.everyDays', locale, { n: match[1] }) : translate('approvals.summary.everyDay', locale);
  match = /^every (?:(\d+) )?months? on the (\d{1,2})(?:st|nd|rd|th)$/.exec(text);
  if (match) {
    return match[1]
      ? translate('approvals.summary.everyMonths', locale, { n: match[1], day: match[2] })
      : translate('approvals.summary.everyMonth', locale, { day: match[2] });
  }
  match = /^every (?:(\d+) )?weeks? on (.+)$/.exec(text);
  const days = match ? dayList(match[2], locale) : null;
  if (!match || !days) return null;
  return match[1]
    ? translate('approvals.summary.everyWeeks', locale, { n: match[1], days })
    : translate('approvals.summary.everyWeek', locale, { days });
}

/** "Oct 27, Oct 29, Nov 10 … Dec 10" with each date in the viewer's language. */
function dateList(text: string, locale: AppLocale): string | null {
  const [shown, last] = text.split(' … ');
  const dates = shown.split(', ').map((date) => monthDay(date, locale));
  const end = last === undefined ? '' : monthDay(last, locale);
  if (dates.some((date) => date === null) || end === null) return null;
  return dates.join(', ') + (end ? ` … ${end}` : '');
}

/**
 * A change request's summary in the viewer's language (#534). The server stores one English sentence per request
 * ("Add: Soccer, Nov 12", "Change Soccer", "Add Sam to the family"); this rebuilds the known ones around the
 * family's own titles and names, which stay as entered. Anything else, such as a summary cut short at its length
 * limit, is shown as stored.
 */
export function localizeSummary(request: SummarizedRequest, locale: AppLocale): string {
  const summary = request.summary;
  if (locale === 'en') return summary;
  let match: RegExpExecArray | null;
  switch (request.type) {
    case 'ChildCreate':
      match = /^Add (.+) to the family$/.exec(summary);
      return match ? translate('approvals.summary.childCreate', locale, { name: match[1] }) : summary;
    case 'CalendarModify':
      match = /^Change (.+)$/s.exec(summary);
      return match ? translate('approvals.summary.change', locale, { title: match[1] }) : summary;
    case 'CalendarCancel':
      match = /^Cancel (.+)$/s.exec(summary);
      return match ? translate('approvals.summary.cancel', locale, { title: match[1] }) : summary;
    case 'SharedFundProposal':
      return summary === 'Shared Fund proposal' ? translate('approvals.summary.sharedFund', locale) : summary;
    case 'CalendarCreate':
    case 'JointEventCreate': {
      match = /^Add: (.+), (every .+?), (\d+) dates: (.+)$/s.exec(summary);
      if (match) {
        const every = repeat(match[2], locale);
        const dates = dateList(match[4], locale);
        return every && dates
          ? translate('approvals.summary.series', locale, { title: match[1], every, count: match[3], dates })
          : summary;
      }
      match = /^(Family event|Add): (.+), ([A-Z][a-z]{2} \d{1,2})$/s.exec(summary);
      const date = match ? monthDay(match[3], locale) : null;
      if (!match || !date) return summary;
      return translate(match[1] === 'Family event' ? 'approvals.summary.familyEvent' : 'approvals.summary.add', locale,
        { title: match[2], date });
    }
    default:
      return summary;
  }
}
