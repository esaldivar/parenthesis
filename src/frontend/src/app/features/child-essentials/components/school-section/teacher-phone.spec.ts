import { teacherPhoneDisplay } from './teacher-phone';

describe('teacherPhoneDisplay', () => {
  it.each([
    ['5125550100', '(512) 555-0100'],
    ['512-555-0100', '(512) 555-0100'],
    ['(512) 555.0100', '(512) 555-0100'],
    ['+1 512 555 0100', '(512) 555-0100'],
    ['1-512-555-0100 ext. 12', '(512) 555-0100 ext. 12'],
    ['512.555.0100 x7', '(512) 555-0100 x7'],
  ])('formats the U.S. number %s', (typed, shown) => {
    expect(teacherPhoneDisplay(typed)).toBe(shown);
  });

  it.each(['+44 20 7946 0000', '+52 55 1234 5678', '555-0100', 'Call the front office'])(
    'shows %s exactly as typed', (typed) => {
      expect(teacherPhoneDisplay(typed)).toBe(typed);
    });
});
