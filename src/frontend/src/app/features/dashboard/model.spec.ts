import { eventPalette } from './model';

describe('Dashboard event categories', () => {
  it('keeps activity subcategory icons while mapping them to the approved blue identity', () => {
    for (const category of ['school', 'medical', 'music', 'sport', 'art', 'other'] as const) {
      expect(eventPalette(category)).toBe('activity');
    }
    expect(eventPalette('family')).toBe('family');
    expect(eventPalette('unavailable')).toBe('unavailable');
  });
});
