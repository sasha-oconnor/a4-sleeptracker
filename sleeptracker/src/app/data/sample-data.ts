import { OvernightSleepData } from './overnight-sleep-data';
import { StanfordSleepinessData } from './stanford-sleepiness-data';
import { MINUTE_MS, addDays, atMinute, startOfDay } from '../utils/time';

export interface SampleData {
  overnight: OvernightSleepData[];
  sleepiness: StanfordSleepinessData[];
}

/** Small seeded PRNG (mulberry32), so the sample data comes out the same on every device. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));
const round5 = (min: number): number => Math.round(min / 5) * 5;

/**
 * Three weeks of believable college-student data, used to demo Trends without waiting three weeks.
 * MWF 8 AM lectures mean early alarms, weekends run late, and a midterm stretch cuts sleep short.
 * Sleepiness rises with lost sleep, dips after coffee, and bumps up in the post-lunch slump.
 * Last night and today are left empty so they can be logged for real.
 */
export function generateSample(now: Date, days = 21, seed = 133): SampleData {
  const rand = mulberry32(seed);
  // Roughly normal noise with a standard deviation of 1 (sum of six uniforms).
  const gauss = (): number => {
    let s = 0;
    for (let i = 0; i < 6; i++) {
      s += rand();
    }
    return (s - 3) / Math.sqrt(0.5);
  };
  const chance = (p: number): boolean => rand() < p;
  const pick = <T>(xs: T[]): T => xs[Math.floor(rand() * xs.length)];

  const today = startOfDay(now);
  const overnight: OvernightSleepData[] = [];
  const sleepiness: StanfordSleepinessData[] = [];

  for (let back = days; back >= 1; back--) {
    const morning = addDays(today, -back); // the date they woke up
    const dow = morning.getDay(); // 0 = Sunday
    const weekend = dow === 0 || dow === 6; // Sat/Sun mornings follow Fri/Sat nights
    const earlyClass = dow === 1 || dow === 3 || dow === 5;
    const midterms = back >= 8 && back <= 11;

    // Bedtime in minutes relative to the morning's midnight (negative = the evening before).
    const bedRel = round5((weekend ? 110 : earlyClass ? 45 : 60) + (midterms ? 55 : 0) + gauss() * 35);
    const wakeMin = round5(weekend ? 610 + gauss() * 40 : earlyClass ? 440 + gauss() * 10 : 510 + gauss() * 20);
    const start = new Date(morning.getTime() + bedRel * MINUTE_MS);
    const end = atMinute(morning, wakeMin);
    const durMin = (end.getTime() - start.getTime()) / MINUTE_MS;

    // People forget to log now and then (but keep the last couple of nights so the week looks full).
    const logged = back <= 2 || !chance(0.1);
    if (logged) {
      const night = new OvernightSleepData(start, end);
      night.quality = clamp(Math.round(1 + (durMin - 300) / 75 + gauss() * 0.6), 1, 5);
      night.tags = [
        ...(chance(midterms ? 0.55 : 0.2) ? ['caffeine'] : []),
        ...(chance(0.4) ? ['screens'] : []),
        ...(chance(midterms ? 0.75 : 0.08) ? ['stress'] : []),
        ...(weekend && chance(0.35) ? ['alcohol'] : []),
        ...(chance(0.25) ? ['exercise'] : []),
        ...(chance(0.07) ? ['noise'] : []),
      ];
      night.notes = midterms && chance(0.35) ? 'Up late studying for a midterm' : weekend && chance(0.25) ? 'Slept in' : '';
      night.source = chance(0.35) ? 'timer' : 'manual';
      night.loggedAt = new Date(end.getTime() + (10 + rand() * 30) * MINUTE_MS);
      night.sample = true;
      overnight.push(night);
    }

    // Two to four check-ins a day.
    const sleepLossH = Math.max(0, (480 - durMin) / 60);
    const lateNight = 21 * 60 + 30 + rand() * 90;
    const slots = [
      { at: wakeMin + 25 + rand() * 30, effect: 1.0, tags: ['pre-coffee'] },
      { at: wakeMin + 95 + rand() * 50, effect: -0.4, tags: ['post-coffee', pick(['class', 'studying'])] },
      { at: 13 * 60 + 30 + rand() * 120, effect: 0.9, tags: [pick(['meal', 'class', 'studying'])] },
      { at: 16 * 60 + rand() * 120, effect: 0.2, tags: [pick(['studying', 'exercise', 'class'])] },
      { at: lateNight, effect: 1.2, tags: [pick(['studying', 'commute'])] },
    ];
    const keep = 2 + Math.floor(rand() * 3);
    while (slots.length > keep) {
      slots.splice(Math.floor(rand() * slots.length), 1);
    }
    for (const slot of slots) {
      const value = clamp(Math.round(1.9 + sleepLossH * 0.95 + slot.effect + gauss() * 0.5), 1, 7);
      const checkin = new StanfordSleepinessData(value, atMinute(morning, round5(slot.at)));
      checkin.tags = slot.tags;
      checkin.sample = true;
      sleepiness.push(checkin);
    }
  }

  return { overnight, sleepiness };
}
