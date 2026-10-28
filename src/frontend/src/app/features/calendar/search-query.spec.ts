import { MEMBERS } from '../../../testing/calendar-fixtures';
import { parseDate, toSearch } from './search-query';

const TODAY = '2026-10-28';

describe('calendar search text (#253)', () => {
  it.each([
    ['2026-10-12', '2026-10-12'],
    ['10/12', '2026-10-12'],
    ['10/12/25', '2025-10-12'],
    ['10/12/2027', '2027-10-12'],
    ['Oct 12', '2026-10-12'],
    ['october 12, 2025', '2025-10-12'],
    ['Sept 3rd', '2026-09-03'],
    ['12 Oct', '2026-10-12'],
  ])('reads %s as a date', (text, date) => {
    expect(parseDate(text, TODAY)).toBe(date);
  });

  it.each(['2/30', 'octopus 12', 'soccer', '13/1', '12'])('does not read %s as a date', (text) => {
    expect(parseDate(text, TODAY)).toBeNull();
  });

  it('searches titles for ordinary text, ignoring extra spaces', () => {
    expect(toSearch('  soccer   practice ', MEMBERS, TODAY)).toEqual({ q: 'soccer practice', categories: [], caregiver: null, on: null });
  });

  it('needs at least two characters unless it is a date', () => {
    expect(toSearch('', MEMBERS, TODAY)).toBeNull();
    expect(toSearch(' s ', MEMBERS, TODAY)).toBeNull();
    expect(toSearch('5/3', MEMBERS, TODAY)?.on).toBe('2026-05-03');
  });

  it('finds event types by label, start of a label or a common word', () => {
    expect(toSearch('Family event', MEMBERS, TODAY)?.categories).toEqual(['Joint']);
    expect(toSearch('sch', MEMBERS, TODAY)?.categories).toEqual(['School']);
    expect(toSearch('dentist', MEMBERS, TODAY)?.categories).toEqual(['Dental']);
  });

  it('narrows parenting time to the parent named, and only parenting time', () => {
    const sams = toSearch('Sam parenting time', MEMBERS, TODAY);
    expect(sams?.categories).toEqual(['ParentingTime']);
    expect(sams?.caregiver).toBe('m-sam');
    expect(sams?.q).toBe('Sam parenting time');
    expect(toSearch('parenting time', MEMBERS, TODAY)?.caregiver).toBeNull();
    expect(toSearch('Sam school', MEMBERS, TODAY)?.caregiver).toBeNull();
  });

  it('searches a date by day only', () => {
    expect(toSearch('Oct 12', MEMBERS, TODAY)).toEqual({ q: null, categories: [], caregiver: null, on: '2026-10-12' });
  });
});
