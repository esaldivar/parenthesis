/** Parse text as minor units without floating-point rounding. All supported currencies have two decimal places. */
export function parseMinor(text: string): number | null {
  const match = /^([0-9]{1,12})(?:[.,]([0-9]{1,2}))?$/.exec(text.trim().replace(/^\$/, ''));
  if (!match) return null;

  return Number(match[1]) * 100 + Number((match[2] ?? '').padEnd(2, '0'));
}

/** Today's date on this device, as `YYYY-MM-DD`. */
export function localToday(now = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}
