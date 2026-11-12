import { STORED_ITEMS } from './privacy-page';

describe('privacy notice storage list in both languages (#534)', () => {
  it('has English and Spanish text for every item', () => {
    for (const item of STORED_ITEMS) {
      for (const [english, spanish] of [item.purpose, item.lasts]) {
        expect(english.trim()).not.toBe('');
        expect(spanish.trim()).not.toBe('');
        expect(spanish).not.toBe(english);
      }
    }
  });
});
