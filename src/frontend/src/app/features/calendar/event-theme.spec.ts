import { eventTheme } from './event-theme';
describe('eventTheme', () => {
  it('matches titles without substring false positives', () => {
    expect(eventTheme('Kai’s BIRTHDAY')).toBe('party');
    expect(eventTheme('Beach day')).toBe('beach');
    expect(eventTheme('Department meeting')).toBeNull();
    expect(eventTheme('Lunch')).toBe('meals');
  });
  it('keeps ambiguous titles plain', () => {
    expect(eventTheme('Beach birthday party')).toBeNull();
    expect(eventTheme('Appointment')).toBeNull();
  });
  it('rechecks edited titles', () => {
    expect(eventTheme('Family dinner')).toBe('meals');
    expect(eventTheme('Family meeting')).toBeNull();
    expect(eventTheme('Museum visit')).toBe('outings');
  });
});
