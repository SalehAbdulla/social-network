/**
 * The two time readings a group event needs.
 *
 * `startsAt` is stored as RFC3339 and `createdAt` as a bare SQLite timestamp, so both are
 * normalised the way the rest of the app normalises them — a bare value read as UTC — and
 * then formatted in the reader's own locale. Posts and comments reuse `relativeLabel` from
 * the API module; only the event card has a wording of its own.
 */
function parse(value: string): Date | null {
  if (!value) return null;
  const date = new Date(value.includes('T') ? value : value.replace(' ', 'T') + 'Z');
  return Number.isNaN(date.getTime()) ? null : date;
}

/** `Thu, Sep 24 · 7:39 PM` — when an event starts. */
export function eventWhen(value: string): string {
  const date = parse(value);
  if (!date) return 'Date to be announced';
  const day = date.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
  const time = date.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  return `${day} · ${time}`;
}

/** The date tile's month, e.g. `SEP`. */
export function eventMonth(value: string): string {
  return parse(value)?.toLocaleDateString(undefined, { month: 'short' }).toUpperCase() ?? '';
}

/** The date tile's day number, e.g. `24`. */
export function eventDay(value: string): string {
  return parse(value)?.getDate().toString() ?? '';
}

/** The exact instant, for a `title`. */
export function groupExactTime(value: string): string {
  return parse(value)?.toLocaleString() ?? '';
}
