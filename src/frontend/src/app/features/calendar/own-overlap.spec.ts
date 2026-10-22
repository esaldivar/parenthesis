import { MEMBERS } from '../../../testing/calendar-fixtures';
import { caregiverUnavailableText, withOwnOverlap } from './own-overlap';

describe('own overlaps (#210)', () => {
  const [you, sam] = MEMBERS;

  it('names the caregiver who is unavailable, and shows it with the time', () => {
    expect(withOwnOverlap({ caregiverUnavailable: 'server text' }, sam)).toEqual({
      startsAt: 'Sam is unavailable then. Choose another time, or another parent.',
    });
    expect(withOwnOverlap({ caregiverUnavailable: 'server text' }, you)).toEqual({
      startsAt:
        'You marked yourself unavailable then. Choose another time, or change your unavailable time first.',
    });
  });

  it('says when your unavailable time overlaps your own parenting time', () => {
    expect(
      withOwnOverlap({ overlapsYourParentingTime: 'server text', notes: 'Too long' }, undefined),
    ).toEqual({
      notes: 'Too long',
      startsAt:
        'You have parenting time then. Choose another time, or change that parenting time first.',
    });
  });

  it('leaves other errors as they are', () => {
    const errors = { title: 'Enter a title.' };
    expect(withOwnOverlap(errors, sam)).toBe(errors);
  });

  it('asks a swap for different dates, since it keeps the same parent', () => {
    expect(caregiverUnavailableText(sam, true)).toBe(
      'Sam is unavailable then. Choose different dates.',
    );
  });
});
