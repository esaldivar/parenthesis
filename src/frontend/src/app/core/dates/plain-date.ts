// The app's date contracts (ADR-0009): Calendar, Dashboard, Messages and Memories all use them.

/** A calendar date in the family's time zone, "YYYY-MM-DD". */
export type PlainDate = string;

/** A wall-clock time in the family's time zone, "YYYY-MM-DDTHH:mm". */
export type LocalDateTime = string;
