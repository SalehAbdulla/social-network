function parse(value: string): Date | null {
  if (!value) return null;
  const date = new Date(value.includes('T') ? value : value.replace(' ', 'T') + 'Z');
  return Number.isNaN(date.getTime()) ? null : date;
}

export function eventWhen(value: string): string {
  const date = parse(value);
  if (!date) return 'Date to be announced';
  const day = date.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
  const time = date.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  return `${day} · ${time}`;
}

export function eventMonth(value: string): string {
  return parse(value)?.toLocaleDateString(undefined, { month: 'short' }).toUpperCase() ?? '';
}

export function eventDay(value: string): string {
  return parse(value)?.getDate().toString() ?? '';
}

export function groupExactTime(value: string): string {
  return parse(value)?.toLocaleString() ?? '';
}
