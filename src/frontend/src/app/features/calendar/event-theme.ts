export type EventTheme = 'party' | 'sports' | 'holiday' | 'travel' | 'beach' | 'camping' | 'school' | 'arts' | 'outings' | 'nature' | 'meals';

const MATCHERS: readonly [EventTheme, RegExp][] = [
  ['party', /\b(birthday|party|parties)\b/u],
  ['sports', /\b(soccer|basketball|baseball|football|tennis|volleyball|sports)\b/u],
  ['holiday', /\b(holiday|halloween|christmas|hanukkah|eid|diwali|easter)\b/u],
  ['travel', /\b(vacation|travel|flight)\b/u],
  ['beach', /\b(beach|seaside)\b/u],
  ['camping', /\b(camping|campground)\b/u],
  ['school', /\b(school|classroom|homework)\b/u],
  ['arts', /\b(art|arts|music|concert|painting)\b/u],
  ['outings', /\b(museum|cinema|movie|zoo|aquarium)\b/u],
  ['nature', /\b(garden|gardening|hike|hiking|nature)\b/u],
  ['meals', /\b(dinner|lunch|breakfast|brunch|potluck|picnic|barbecue|bbq)\b/u],
];

/** Title only: no notes, location, external service or stored inference. Ambiguity stays plain. */
export function eventTheme(title: string): EventTheme | null {
  const normalized = title.normalize('NFKC').toLocaleLowerCase('en-US');
  const matches = MATCHERS.filter(([, pattern]) => pattern.test(normalized));
  return matches.length === 1 ? matches[0][0] : null;
}
