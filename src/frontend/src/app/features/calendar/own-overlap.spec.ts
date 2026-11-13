import { MEMBERS } from '../../../testing/calendar-fixtures';
import { caregiverUnavailableText, withOwnOverlap } from './own-overlap';

describe('own overlaps (#210, #259)', () => {
  it('retains the server occurrence date and family time zone in the date error', () => {
    const message = 'The parent with the children is unavailable for the occurrence starting Wed, Nov 4, 2026 at 09:00 (America/Chicago). Choose another time.';
    expect(withOwnOverlap({ caregiverUnavailable: message })).toEqual({ when: message });
  });

  it('retains the conflicting occurrence for unavailable time without losing other field errors', () => {
    const message = 'You have parenting time during the occurrence starting Wed, Nov 4, 2026 at 09:00 (America/Chicago). Choose another time.';
    expect(withOwnOverlap({ overlapsYourParentingTime: message, notes: 'Too long' })).toEqual({
      notes: 'Too long', when: message,
    });
  });

  it('leaves other errors as they are', () => {
    const errors = { title: 'Enter a title.' };
    expect(withOwnOverlap(errors)).toBe(errors);
  });

  it('asks a swap for different dates, since it keeps the same parent', () => {
    expect(caregiverUnavailableText(MEMBERS[1], true)).toBe(
      'Sam is unavailable then. Choose different dates.',
    );
  });

  it('speaks Spanish when the parent chose it (#534)', () => {
    expect(caregiverUnavailableText(MEMBERS[1], true, 'es-419')).toBe('Sam no está disponible en ese horario. Elige otras fechas.');
    expect(caregiverUnavailableText(undefined, false, 'es-419')).toBe(
      'El padre o la madre que tiene a los niños no está disponible en ese horario. Elige otro horario u otro padre o madre.',
    );
  });
});
