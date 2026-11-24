/** Everything the person can configure. Clock times are minutes past local midnight. */
export interface DriftSettings {
  /** Nightly sleep goal in minutes. */
  goalMin: number;
  usualBedMin: number;
  usualWakeMin: number;
  /** Daytime sleepiness reminders (experience sampling) at fixed clock times. */
  checkins: { enabled: boolean; times: number[] };
  /** "How did you sleep?" reminder, `offsetMin` after the usual wake time. */
  morning: { enabled: boolean; offsetMin: number };
  /** Bedtime nudge, `leadMin` before the usual bedtime. */
  windDown: { enabled: boolean; leadMin: number };
  haptics: boolean;
}

export const DEFAULT_SETTINGS: DriftSettings = {
  goalMin: 8 * 60,
  usualBedMin: 23 * 60 + 30,
  usualWakeMin: 7 * 60 + 30,
  // Reminders start off: we only ask for notification permission once someone turns one on.
  checkins: { enabled: false, times: [10 * 60, 14 * 60, 19 * 60] },
  morning: { enabled: false, offsetMin: 15 },
  windDown: { enabled: false, leadMin: 30 },
  haptics: true,
};

/** Fills in anything missing from older saved settings. */
export function withDefaults(saved: Partial<DriftSettings> | null | undefined): DriftSettings {
  const s = saved ?? {};
  return {
    ...DEFAULT_SETTINGS,
    ...s,
    checkins: { ...DEFAULT_SETTINGS.checkins, ...s.checkins },
    morning: { ...DEFAULT_SETTINGS.morning, ...s.morning },
    windDown: { ...DEFAULT_SETTINGS.windDown, ...s.windDown },
  };
}

/** A bedtime timer that is currently running (persisted, so it survives closing the app). */
export interface SleepSession {
  /** Epoch milliseconds when the person tapped "Start sleep timer". */
  start: number;
}

/** Storage keys. The version suffix leaves room for future migrations. */
export const STORAGE_KEYS = {
  overnight: 'overnight-v1',
  sleepiness: 'sleepiness-v1',
  settings: 'settings-v1',
  session: 'session-v1',
} as const;
