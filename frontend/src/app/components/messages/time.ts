/**
 * The direct-message clock.
 *
 * The thread and the list both need the same three readings of a timestamp — the short
 * stamp a row trails with (`22h`, `6d`, `1w`), the label above a run of messages (`Tue
 * 4:39 PM`, `Yesterday`) and the rule that decides where a separator goes — and they
 * must agree, so they live together here rather than in each component.
 *
 * SQLite stores UTC without a zone suffix, which is why a bare timestamp is read as UTC
 * before it is compared; without that, a reader west of UTC would see today's messages
 * labelled with tomorrow's date.
 */
const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const WEEK = 7 * DAY;

function parse(value: string): Date | null {
  if (!value) return null;
  const date = new Date(value.includes('T') ? value : value.replace(' ', 'T') + 'Z');
  return Number.isNaN(date.getTime()) ? null : date;
}

/** The clock time on its own, e.g. `4:39 PM`, in the reader's locale. */
function clock(date: Date): string {
  return date.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

/** The list's trailing stamp: `now`, `4m`, `22h`, `6d`, `1w`, then a short date. */
export function previewTime(value: string, now = Date.now()): string {
  const date = parse(value);
  if (!date) return '';
  const gap = now - date.getTime();
  if (gap < MINUTE) return 'now';
  if (gap < HOUR) return `${Math.floor(gap / MINUTE)}m`;
  if (gap < DAY) return `${Math.floor(gap / HOUR)}h`;
  if (gap < WEEK) return `${Math.floor(gap / DAY)}d`;
  if (gap < 52 * WEEK) return `${Math.floor(gap / WEEK)}w`;
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

/** Whether two instants fall on the same calendar day. */
export function sameDay(a: string, b: string): boolean {
  const first = parse(a);
  const second = parse(b);
  return !!first && !!second && first.toDateString() === second.toDateString();
}

/**
 * Whether a separator belongs between two consecutive messages: a new day, or a gap
 * longer than an hour. An unparseable timestamp is treated as a break, so a bad row
 * cannot silently merge two days.
 */
export function needsSeparator(previous: string | null, current: string): boolean {
  if (!previous) return true;
  const before = parse(previous);
  const after = parse(current);
  if (!before || !after) return true;
  return before.toDateString() !== after.toDateString() || Math.abs(after.getTime() - before.getTime()) > HOUR;
}

/**
 * The label above a run of messages: `Wed, Sep 23 · 7:39 PM`, always in the same shape so a
 * separator reads as a stamp rather than as three different kinds of text. The day and the
 * clock are both there because the rule that places a separator is about the gap, not about
 * the date alone — an hour-long pause in the middle of an afternoon deserves its own line.
 */
export function separatorLabel(value: string, now = Date.now()): string {
  const date = parse(value);
  if (!date) return '';
  const day = date.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
  const time = clock(date);
  // The year is only worth a word when it is not the current one.
  const year = date.getFullYear() === new Date(now).getFullYear() ? '' : `, ${date.getFullYear()}`;
  return `${day}${year} · ${time}`;
}

/** The exact instant, for a bubble's tooltip. */
export function exactTime(value: string): string {
  return parse(value)?.toLocaleString() ?? '';
}
