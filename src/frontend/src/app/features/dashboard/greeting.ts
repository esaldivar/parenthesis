/** Home's greeting for the hour in the family's time zone (see `hourIn` in core/dates). */
export function greetingFor(hour: number): string {
  if (hour < 5) return 'Hello';
  if (hour < 12) return 'Good morning';
  if (hour < 18) return 'Good afternoon';
  return 'Good evening';
}
