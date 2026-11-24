import { OvernightSleepData } from '../data/overnight-sleep-data';
import { StanfordSleepinessData } from '../data/stanford-sleepiness-data';
import { DateKey, addDays, dateKey, fmtClock, fmtDuration, fmtWeekday, meanClock, minuteOfDay, startOfDay } from './time';

const mean = (xs: number[]): number | null => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);

/** Overnight entries whose wake-up date falls within the last `days` days (today included). */
export function nightsInRange(nights: OvernightSleepData[], days: number, today: Date): OvernightSleepData[] {
  const from = dateKey(addDays(today, -(days - 1)));
  const to = dateKey(today);
  return nights.filter(n => n.morningKey >= from && n.morningKey <= to);
}

/** Sleepiness check-ins logged within the last `days` days (today included). */
export function checkinsInRange(entries: StanfordSleepinessData[], days: number, today: Date): StanfordSleepinessData[] {
  const from = dateKey(addDays(today, -(days - 1)));
  const to = dateKey(today);
  return entries.filter(e => e.dayKey >= from && e.dayKey <= to);
}

export interface RangeStats {
  nights: number;
  /** Average minutes asleep per logged night. */
  avgMin: number | null;
  /** Average bedtime / wake time, in minutes past midnight. */
  avgBed: number | null;
  avgWake: number | null;
  /** Nights that reached the goal. */
  goalMet: number;
  /** Total minutes short of the goal across logged nights. */
  debtMin: number;
  avgQuality: number | null;
  checkins: number;
  avgSleepiness: number | null;
}

export function rangeStats(nights: OvernightSleepData[], checkins: StanfordSleepinessData[], goalMin: number): RangeStats {
  const durations = nights.map(n => n.durationMin);
  const qualities = nights.map(n => n.quality).filter((q): q is number => q !== null);
  return {
    nights: nights.length,
    avgMin: mean(durations),
    avgBed: meanClock(nights.map(n => minuteOfDay(n.start))),
    avgWake: meanClock(nights.map(n => minuteOfDay(n.end))),
    goalMet: durations.filter(d => d >= goalMin).length,
    debtMin: durations.reduce((sum, d) => sum + Math.max(0, goalMin - d), 0),
    avgQuality: mean(qualities),
    checkins: checkins.length,
    avgSleepiness: mean(checkins.map(c => c.value)),
  };
}

export interface NightPoint {
  key: DateKey;
  date: Date;
  /** Axis label: weekday for a week, day-of-month for a month. */
  label: string;
  minutes: number | null;
  isToday: boolean;
}

/** One point per morning, oldest first, with null where nothing was logged. */
export function durationSeries(nights: OvernightSleepData[], days: number, today: Date): NightPoint[] {
  const byMorning = new Map(nights.map(n => [n.morningKey, n.durationMin]));
  const first = startOfDay(today);
  const points: NightPoint[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const date = addDays(first, -i);
    const key = dateKey(date);
    points.push({
      key,
      date,
      label: days <= 7 ? fmtWeekday(date) : String(date.getDate()),
      minutes: byMorning.get(key) ?? null,
      isToday: i === 0,
    });
  }
  return points;
}

export interface TimeBucket {
  label: string;
  /** Accessible name, e.g. "9 AM to noon". */
  longLabel: string;
  mean: number | null;
  n: number;
}

/** Three-hour windows across a student's waking day; the last one wraps past midnight. */
const BUCKETS: { label: string; longLabel: string; from: number; to: number }[] = [
  { label: '6–9a', longLabel: '6 to 9 AM', from: 6 * 60, to: 9 * 60 },
  { label: '9–12', longLabel: '9 AM to noon', from: 9 * 60, to: 12 * 60 },
  { label: '12–3p', longLabel: 'noon to 3 PM', from: 12 * 60, to: 15 * 60 },
  { label: '3–6p', longLabel: '3 to 6 PM', from: 15 * 60, to: 18 * 60 },
  { label: '6–9p', longLabel: '6 to 9 PM', from: 18 * 60, to: 21 * 60 },
  { label: '9p+', longLabel: 'after 9 PM', from: 21 * 60, to: 6 * 60 },
];

/** Average sleepiness by time of day. */
export function sleepinessByTime(entries: StanfordSleepinessData[]): TimeBucket[] {
  return BUCKETS.map(b => {
    const values = entries
      .filter(e => {
        const m = minuteOfDay(e.loggedAt);
        return b.from < b.to ? m >= b.from && m < b.to : m >= b.from || m < b.to;
      })
      .map(e => e.value);
    return { label: b.label, longLabel: b.longLabel, mean: mean(values), n: values.length };
  });
}

export interface SleepInsight {
  /** The duration that splits "long" from "short" nights (the goal, or the median as a fallback). */
  thresholdMin: number;
  usedGoal: boolean;
  longMean: number;
  shortMean: number;
  longDays: number;
  shortDays: number;
}

/**
 * Connects the two kinds of data: how sleepy were you on days after longer vs shorter nights?
 * Needs at least two days on each side to say anything.
 */
export function sleepInsight(nights: OvernightSleepData[], checkins: StanfordSleepinessData[], goalMin: number): SleepInsight | null {
  const byMorning = new Map(nights.map(n => [n.morningKey, n.durationMin]));
  const paired = checkins
    .map(c => ({ day: c.dayKey, value: c.value, slept: byMorning.get(c.dayKey) }))
    .filter((p): p is { day: string; value: number; slept: number } => p.slept !== undefined);

  const split = (threshold: number): SleepInsight | null => {
    const long = paired.filter(p => p.slept >= threshold);
    const short = paired.filter(p => p.slept < threshold);
    const longDays = new Set(long.map(p => p.day)).size;
    const shortDays = new Set(short.map(p => p.day)).size;
    if (longDays < 2 || shortDays < 2) {
      return null;
    }
    return {
      thresholdMin: threshold,
      usedGoal: threshold === goalMin,
      longMean: mean(long.map(p => p.value)) ?? 0,
      shortMean: mean(short.map(p => p.value)) ?? 0,
      longDays,
      shortDays,
    };
  };

  const byGoal = split(goalMin);
  if (byGoal) {
    return byGoal;
  }
  // Not enough nights on one side of the goal: compare their own longer vs shorter nights instead.
  const sorted = [...new Set(paired.map(p => p.slept))].sort((a, b) => a - b);
  return sorted.length >= 4 ? split(sorted[Math.floor(sorted.length / 2)]) : null;
}

/** Plain-text weekly summary for the share sheet. */
export function shareText(stats: RangeStats, days: number, goalMin: number): string {
  if (!stats.nights || stats.avgMin === null) {
    return 'I just started tracking my sleep with Drift 😴';
  }
  const lines = [
    `😴 My sleep over the last ${days} days`,
    `• ${fmtDuration(stats.avgMin)} a night on average (goal: ${fmtDuration(goalMin)})`,
    `• Hit my goal ${stats.goalMet} of ${stats.nights} nights`,
  ];
  if (stats.avgBed !== null && stats.avgWake !== null) {
    lines.push(`• Usually asleep by ${fmtClock(stats.avgBed)}, up at ${fmtClock(stats.avgWake)}`);
  }
  if (stats.avgSleepiness !== null) {
    lines.push(`• Daytime sleepiness: ${stats.avgSleepiness.toFixed(1)} / 7 (Stanford Sleepiness Scale)`);
  }
  lines.push('Tracked with Drift');
  return lines.join('\n');
}
