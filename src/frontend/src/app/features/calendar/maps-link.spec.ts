import { LOCATION_MAX_LENGTH, mapsDirectionsUrl } from './maps-link';

// Synthetic addresses only.
describe('mapsDirectionsUrl (#113)', () => {
  const destination = (url: string | null) => new URL(url!).searchParams.get('destination');

  it('builds a Google Maps directions link with no API key', () => {
    const url = mapsDirectionsUrl('100 Example Ave, Springfield');

    expect(url).toBe('https://www.google.com/maps/dir/?api=1&destination=100%20Example%20Ave%2C%20Springfield');
    expect(url).not.toContain('key=');
  });

  it('keeps characters that mean something in a URL inside the destination', () => {
    const url = mapsDirectionsUrl('Field #3 & Gym / Room 2? a=b');
    const parsed = new URL(url!);

    expect(parsed.origin + parsed.pathname).toBe('https://www.google.com/maps/dir/');
    expect([...parsed.searchParams.keys()]).toEqual(['api', 'destination']);
    expect(destination(url)).toBe('Field #3 & Gym / Room 2? a=b');
    expect(parsed.hash).toBe('');
  });

  it('encodes accents and other scripts', () => {
    expect(destination(mapsDirectionsUrl('Café Señora, Bogotá'))).toBe('Café Señora, Bogotá');
    expect(destination(mapsDirectionsUrl('東京駅'))).toBe('東京駅');
  });

  it('tidies spacing and line breaks', () => {
    expect(destination(mapsDirectionsUrl('  12 Sample St\n\tApt 4  '))).toBe('12 Sample St Apt 4');
  });

  it('gives no link for a missing, blank or punctuation-only location', () => {
    expect(mapsDirectionsUrl(null)).toBeNull();
    expect(mapsDirectionsUrl(undefined)).toBeNull();
    expect(mapsDirectionsUrl('')).toBeNull();
    expect(mapsDirectionsUrl('   \n ')).toBeNull();
    expect(mapsDirectionsUrl('-- / ?')).toBeNull();
  });

  it('gives no link past the length the API allows', () => {
    expect(mapsDirectionsUrl('a'.repeat(LOCATION_MAX_LENGTH))).not.toBeNull();
    expect(mapsDirectionsUrl('a'.repeat(LOCATION_MAX_LENGTH + 1))).toBeNull();
  });

  it('can never point anywhere but Google Maps', () => {
    for (const sneaky of ['javascript:alert(1)', 'https://evil.example/', '//evil.example', '%2F%2Fevil.example']) {
      expect(new URL(mapsDirectionsUrl(sneaky)!).host).toBe('www.google.com');
    }
  });
});
