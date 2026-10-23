import { SlotPick, addFromColumn, addQuery, clearsPick, dayInRow, pickLabel, pickRows, slotAt } from './slot';

describe('adding from a tap on the calendar (#212)', () => {
  it('maps a height in a day column to the start of its half-hour', () => {
    // A whole-day column, 480px tall: 10px per half-hour.
    expect(slotAt(0, 480, 0, 24)).toBe('00:00');
    expect(slotAt(9, 480, 0, 24)).toBe('00:00');
    expect(slotAt(10, 480, 0, 24)).toBe('00:30');
    expect(slotAt(345, 480, 0, 24)).toBe('17:00');
    expect(slotAt(479, 480, 0, 24)).toBe('23:30');
    // Past either end stays within the day.
    expect(slotAt(-5, 480, 0, 24)).toBe('00:00');
    expect(slotAt(999, 480, 0, 24)).toBe('23:30');
    // The home grid shows only some hours: 7 AM to 9 PM.
    expect(slotAt(0, 280, 7, 21)).toBe('07:00');
    expect(slotAt(140, 280, 7, 21)).toBe('14:00');
  });

  it('is wall-clock time, so a daylight-saving day maps the same way', () => {
    // Sunday, November 1, 2026 (clocks go back in Chicago) and Sunday, March 8 (forward): the Add page converts it.
    const column = Object.assign(document.createElement('div'), {
      getBoundingClientRect: () => ({ top: 100, height: 480, left: 0, width: 100 }) as DOMRect,
    });
    for (const date of ['2026-11-01', '2027-03-08']) {
      const click = new MouseEvent('click', { clientY: 100 + 45, detail: 1 });
      Object.defineProperty(click, 'currentTarget', { value: column });
      expect(addFromColumn(click, date, 0, 24)).toEqual({ date, time: '02:00' });
    }
  });

  it('gives the date only from the keyboard', () => {
    const column = document.createElement('button');
    const press = new MouseEvent('click', { detail: 0 });
    Object.defineProperty(press, 'currentTarget', { value: column });
    expect(addFromColumn(press, '2026-10-20', 0, 24)).toEqual({ date: '2026-10-20' });
  });

  it('finds the day under the pointer in an all-day row', () => {
    const row = Object.assign(document.createElement('ul'), {
      getBoundingClientRect: () => ({ top: 0, height: 40, left: 0, width: 700 }) as DOMRect,
    });
    const days = [
      '2026-10-18',
      '2026-10-19',
      '2026-10-20',
      '2026-10-21',
      '2026-10-22',
      '2026-10-23',
      '2026-10-24',
    ];
    const click = (target: Element, x: number) => {
      const e = new MouseEvent('click', { clientX: x });
      Object.defineProperty(e, 'currentTarget', { value: row });
      Object.defineProperty(e, 'target', { value: target });
      return e;
    };
    expect(dayInRow(click(row, 250), days)).toBe('2026-10-20');
    expect(dayInRow(click(row, 699), days)).toBe('2026-10-24');
  });

  it('builds the Add page’s address', () => {
    expect(addQuery({ date: '2026-10-20', time: '17:00' })).toEqual({
      date: '2026-10-20',
      time: '17:00',
    });
    expect(addQuery({ date: '2026-10-20' })).toEqual({ date: '2026-10-20' });
  });

  it('highlights first and adds on a second tap in the same place; a keyboard press adds at once (#237)', () => {
    const added: unknown[] = [];
    const pick = new SlotPick((at) => added.push(at));
    pick.tap({ date: '2026-10-20', time: '17:00' }, true);
    expect(added).toEqual([]);
    pick.tap({ date: '2026-10-20', time: '17:30' }, true); // Another half-hour moves it.
    expect(pick.at()).toEqual({ date: '2026-10-20', time: '17:30' });
    pick.tap({ date: '2026-10-20', time: '17:30' }, true);
    expect(added).toEqual([{ date: '2026-10-20', time: '17:30' }]);
    expect(pick.at()).toBeNull();
    pick.tap({ date: '2026-10-21' }, false);
    expect(added).toHaveLength(2);
  });

  it('places and names the highlight, and keeps it on taps on empty space or itself (#237)', () => {
    expect(pickRows('00:00')).toBe('1 / span 2');
    expect(pickRows('17:00')).toBe('35 / span 2');
    expect(pickRows('23:30')).toBe('47 / span 2'); // Stays inside the day.
    expect(pickLabel({ date: '2026-10-20', time: '18:00' })).toBe('Add on Tuesday, October 20 at 6:00 PM');
    expect(pickLabel({ date: '2026-10-20' })).toBe('Add on Tuesday, October 20');
    const layer = document.createElement('button');
    layer.className = 'tap-add__button';
    expect(clearsPick(layer)).toBe(false);
    expect(clearsPick(document.createElement('button'))).toBe(true);
  });
});
