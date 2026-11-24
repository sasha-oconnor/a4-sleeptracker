/**
 * Small, dependency-free date/time helpers. Everything works in the device's local time zone.
 *
 * ion-datetime only understands local ISO strings ("YYYY-MM-DDTHH:mm:ss") and silently drops any
 * "Z"/offset, so we never hand it Date.toISOString().
 */

export const MINUTE_MS = 60 * 1000;
export const HOUR_MS = 60 * MINUTE_MS;
export const DAY_MS = 24 * HOUR_MS;
export const MINUTES_PER_DAY = 24 * 60;

/** A calendar day in local time, formatted "YYYY-MM-DD" (sorts correctly as a string). */
export type DateKey = string;

const pad = (n: number): string => String(n).padStart(2, '0');

/** Wraps any minute count onto the 24-hour clock (0–1439). */
export const wrapMinutes = (min: number): number => ((Math.round(min) % MINUTES_PER_DAY) + MINUTES_PER_DAY) % MINUTES_PER_DAY;

export function dateKey(d: Date): DateKey {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Local midnight for a "YYYY-MM-DD" key. (new Date('YYYY-MM-DD') would be UTC midnight.) */
export function fromDateKey(key: DateKey): Date {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

export function addDays(d: Date, n: number): Date {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}

/** Minutes since local midnight (0–1439). */
export function minuteOfDay(d: Date): number {
  return d.getHours() * 60 + d.getMinutes();
}

/** The given day at `minutes` past local midnight. */
export function atMinute(day: Date, minutes: number): Date {
  const m = wrapMinutes(minutes);
  return new Date(day.getFullYear(), day.getMonth(), day.getDate(), Math.floor(m / 60), m % 60);
}

/** "YYYY-MM-DDTHH:mm:ss" in local time — the only format ion-datetime handles correctly. */
export function toLocalIso(d: Date): string {
  return `${dateKey(d)}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

/** Parses the local ISO strings ion-datetime emits. Like Ionic, it ignores any "Z"/offset. */
export function fromLocalIso(iso: string): Date {
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2})(?::(\d{2}))?)?/.exec(iso);
  if (!m) {
    return new Date(NaN);
  }
  const [, y, mo, d, h = '0', mi = '0', s = '0'] = m;
  return new Date(+y, +mo - 1, +d, +h, +mi, +s);
}

/** Minutes past midnight from an ion-datetime value such as "2026-11-23T07:15:00". */
export function minutesFromIso(iso: string): number {
  return minuteOfDay(fromLocalIso(iso));
}

/** A local ISO string for `minutes` past midnight on the given day. */
export function isoAt(key: DateKey, minutes: number): string {
  return toLocalIso(atMinute(fromDateKey(key), minutes));
}

/**
 * Turns a "morning of" date plus bedtime/wake clock times into real Dates.
 * If bedtime is at or after the wake time (e.g. 23:30 → 07:15), bed was the evening before;
 * otherwise (e.g. 01:30 → 09:00) both happened on the morning's date.
 */
export function inferNight(morning: DateKey, bedMin: number, wakeMin: number): { start: Date; end: Date } {
  const day = fromDateKey(morning);
  const end = atMinute(day, wakeMin);
  const start = atMinute(bedMin >= wakeMin ? addDays(day, -1) : day, bedMin);
  return { start, end };
}

/** Rounds a minute count down to a multiple of `step` (used for friendly default times). */
export function floorTo(min: number, step: number): number {
  return Math.floor(min / step) * step;
}

/** 465 → "7h 45m", 480 → "8h", 45 → "45m". */
export function fmtDuration(totalMin: number): string {
  const m = Math.max(0, Math.round(totalMin));
  const h = Math.floor(m / 60);
  const r = m % 60;
  if (h === 0) {
    return `${r}m`;
  }
  return r === 0 ? `${h}h` : `${h}h ${r}m`;
}

/** Screen-reader friendly version of fmtDuration: "7 hours 45 minutes". */
export function fmtDurationLong(totalMin: number): string {
  const m = Math.max(0, Math.round(totalMin));
  const h = Math.floor(m / 60);
  const r = m % 60;
  const parts: string[] = [];
  if (h) {
    parts.push(`${h} hour${h === 1 ? '' : 's'}`);
  }
  if (r || !h) {
    parts.push(`${r} minute${r === 1 ? '' : 's'}`);
  }
  return parts.join(' ');
}

/** A Date or minutes-past-midnight as a clock time, e.g. "11:30 PM". */
export function fmtClock(value: Date | number): string {
  const d = typeof value === 'number' ? atMinute(new Date(2000, 0, 1), value) : value;
  // Some ICU versions put a narrow no-break space before AM/PM; normalize to a regular space.
  return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }).replace(/ /g, ' ');
}

/** "Today", "Yesterday", or e.g. "Saturday, Nov 21" for list headings. */
export function fmtDay(key: DateKey, today: Date): string {
  if (key === dateKey(today)) {
    return 'Today';
  }
  if (key === dateKey(addDays(today, -1))) {
    return 'Yesterday';
  }
  const d = fromDateKey(key);
  return d.toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    ...(d.getFullYear() === today.getFullYear() ? {} : { year: 'numeric' }),
  });
}

/** e.g. "Sun, Nov 22". */
export function fmtShortDate(d: Date): string {
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}

/** e.g. "Sun". */
export function fmtWeekday(d: Date): string {
  return d.toLocaleDateString('en-US', { weekday: 'short' });
}

/** A friendly greeting for the hour. */
export function greeting(now: Date): string {
  const h = now.getHours();
  if (h >= 5 && h < 12) {
    return 'Good morning';
  }
  if (h >= 12 && h < 17) {
    return 'Good afternoon';
  }
  if (h >= 17 && h < 22) {
    return 'Good evening';
  }
  return 'Up late?';
}

/**
 * Average of clock times as a circular mean, so 11:30 PM and 12:30 AM average to midnight
 * (not noon). Returns minutes past midnight, or null when there's nothing meaningful to average.
 */
export function meanClock(minutes: number[]): number | null {
  if (!minutes.length) {
    return null;
  }
  let x = 0;
  let y = 0;
  for (const m of minutes) {
    const angle = (m / MINUTES_PER_DAY) * 2 * Math.PI;
    x += Math.cos(angle);
    y += Math.sin(angle);
  }
  if (Math.hypot(x, y) < 1e-9) {
    return null;
  }
  const angle = Math.atan2(y, x);
  return wrapMinutes((angle / (2 * Math.PI)) * MINUTES_PER_DAY);
}

/** True when a clock time falls inside the usual sleep window (handles windows that cross midnight). */
export function inSleepWindow(min: number, bedMin: number, wakeMin: number): boolean {
  return bedMin > wakeMin ? min >= bedMin || min < wakeMin : min >= bedMin && min < wakeMin;
}
