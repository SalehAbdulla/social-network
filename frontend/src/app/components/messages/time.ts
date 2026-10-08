const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const WEEK = 7 * DAY;

function parse(value: string): Date | null {
  if (!value) return null;
  const date = new Date(value.includes('T') ? value : value.replace(' ', 'T') + 'Z');
  return Number.isNaN(date.getTime()) ? null : date;
}

function clock(date: Date): string {
  return date.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

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

export function sameDay(a: string, b: string): boolean {
  const first = parse(a);
  const second = parse(b);
  return !!first && !!second && first.toDateString() === second.toDateString();
}

export function needsSeparator(previous: string | null, current: string): boolean {
  if (!previous) return true;
  const before = parse(previous);
  const after = parse(current);
  if (!before || !after) return true;
  return before.toDateString() !== after.toDateString() || Math.abs(after.getTime() - before.getTime()) > HOUR;
}

export function separatorLabel(value: string, now = Date.now()): string {
  const date = parse(value);
  if (!date) return '';
  const day = date.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
  const time = clock(date);
  const year = date.getFullYear() === new Date(now).getFullYear() ? '' : `, ${date.getFullYear()}`;
  return `${day}${year} · ${time}`;
}

export function exactTime(value: string): string {
  return parse(value)?.toLocaleString() ?? '';
}
