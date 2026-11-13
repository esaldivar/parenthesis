/** The same limit the API enforces on an event's location. */
export const LOCATION_MAX_LENGTH = 200;

/**
 * A Google Maps directions link to an event's saved location (#113), or null when there's nothing usable to look up.
 *
 * Google's documented Maps URL needs no API key and no map in Parenthesis. Phones with Google Maps installed open it
 * in the app; anything else opens the website. The location is percent-encoded as one query value, so characters such
 * as `&`, `#`, `?` or `/` in an address stay part of the destination. Blank, over-long, or punctuation-only text gets
 * no link: the details still show the location as written.
 */
export function mapsDirectionsUrl(location: string | null | undefined): string | null {
  const destination = (location ?? '').replace(/\s+/g, ' ').trim();
  if (!destination || destination.length > LOCATION_MAX_LENGTH || !/[\p{L}\p{N}]/u.test(destination)) {
    return null;
  }
  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(destination)}`;
}
