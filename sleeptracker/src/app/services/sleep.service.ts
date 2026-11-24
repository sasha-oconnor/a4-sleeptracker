import { Injectable, computed, inject, signal } from '@angular/core';
import { Subject } from 'rxjs';
import { SleepData } from '../data/sleep-data';
import { OvernightSleepData } from '../data/overnight-sleep-data';
import { StanfordSleepinessData } from '../data/stanford-sleepiness-data';
import { STORAGE_KEYS, SleepSession } from '../data/settings.model';
import { generateSample } from '../data/sample-data';
import { DateKey } from '../utils/time';
import { StorageService } from './storage.service';

type StoreName = 'overnight' | 'sleepiness' | 'session';

/**
 * Owns every logged entry. All changes go through here and are written to storage immediately,
 * so nothing is lost when the app is closed or reloaded. State lives in Angular signals, so every
 * screen that reads it updates automatically.
 */
@Injectable({ providedIn: 'root' })
export class SleepService {
  private readonly storage = inject(StorageService);

  private readonly overnightState = signal<OvernightSleepData[]>([]);
  private readonly sleepinessState = signal<StanfordSleepinessData[]>([]);
  private readonly sessionState = signal<SleepSession | null>(null);
  /** Writes run one after another, in the order the changes were made. */
  private writeQueue: Promise<void> = Promise.resolve();

  /** Overnight entries, newest first. */
  readonly overnight = computed(() => [...this.overnightState()].sort((a, b) => b.end.getTime() - a.end.getTime()));
  /** Sleepiness check-ins, newest first. */
  readonly sleepiness = computed(() =>
    [...this.sleepinessState()].sort((a, b) => b.loggedAt.getTime() - a.loggedAt.getTime()));
  /** Both kinds on one timeline, newest first (a night sorts by its wake-up time). */
  readonly all = computed<SleepData[]>(() =>
    [...this.overnight(), ...this.sleepiness()].sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime()));
  /** The running bedtime timer, if any. */
  readonly session = this.sessionState.asReadonly();
  readonly count = computed(() => this.overnightState().length + this.sleepinessState().length);
  readonly sampleCount = computed(() =>
    this.overnightState().filter(e => e.sample).length + this.sleepinessState().filter(e => e.sample).length);

  /** Fires after every change (reminders re-plan around new logs). */
  readonly changed$ = new Subject<void>();

  /** Reads everything back from storage. Called once at startup, before the first screen renders. */
  async load(): Promise<void> {
    const [overnight, sleepiness, session] = await Promise.all([
      this.storage.get<unknown[]>(STORAGE_KEYS.overnight),
      this.storage.get<unknown[]>(STORAGE_KEYS.sleepiness),
      this.storage.get<SleepSession>(STORAGE_KEYS.session),
    ]);
    this.overnightState.set((overnight ?? []).filter(OvernightSleepData.isValidDTO).map(d => OvernightSleepData.fromJSON(d)));
    this.sleepinessState.set(
      (sleepiness ?? []).filter(StanfordSleepinessData.isValidDTO).map(d => StanfordSleepinessData.fromJSON(d)));
    this.sessionState.set(session && Number.isFinite(session.start) ? { start: session.start } : null);
  }

  /** Adds an overnight entry, or replaces the entry with the same id (edits and undo). */
  logOvernightData(sleepData: OvernightSleepData): Promise<void> {
    this.overnightState.update(list => [...list.filter(e => e.id !== sleepData.id), sleepData]);
    return this.persist('overnight');
  }

  /** Adds a sleepiness check-in, or replaces the check-in with the same id. */
  logSleepinessData(sleepData: StanfordSleepinessData): Promise<void> {
    this.sleepinessState.update(list => [...list.filter(e => e.id !== sleepData.id), sleepData]);
    return this.persist('sleepiness');
  }

  /** Saves either kind of entry. */
  save(entry: SleepData): Promise<void> {
    if (entry instanceof OvernightSleepData) {
      return this.logOvernightData(entry);
    }
    return this.logSleepinessData(entry as StanfordSleepinessData);
  }

  remove(entry: SleepData): Promise<void> {
    if (entry instanceof OvernightSleepData) {
      this.overnightState.update(list => list.filter(e => e.id !== entry.id));
      return this.persist('overnight');
    }
    this.sleepinessState.update(list => list.filter(e => e.id !== entry.id));
    return this.persist('sleepiness');
  }

  /** The night someone woke up from on a given date, ignoring `exceptId` (the entry being edited). */
  nightFor(morning: DateKey, exceptId?: string): OvernightSleepData | undefined {
    return this.overnightState().find(e => e.morningKey === morning && e.id !== exceptId);
  }

  /** A day's check-ins, oldest first. */
  checkinsOn(day: DateKey): StanfordSleepinessData[] {
    return this.sleepiness().filter(e => e.dayKey === day).reverse();
  }

  /** Starts the bedtime timer. */
  startSession(start = new Date()): Promise<void> {
    this.sessionState.set({ start: start.getTime() });
    return this.persist('session');
  }

  /** Stops the bedtime timer without logging anything. */
  clearSession(): Promise<void> {
    this.sessionState.set(null);
    return this.persist('session');
  }

  /** Brings back a timer (undo after cancelling it). */
  restoreSession(session: SleepSession): Promise<void> {
    this.sessionState.set({ ...session });
    return this.persist('session');
  }

  /** Adds three weeks of sample data, skipping mornings that already have a real log. Returns what was added. */
  async loadSample(now = new Date()): Promise<SleepData[]> {
    const sample = generateSample(now);
    const taken = new Set(this.overnightState().map(e => e.morningKey));
    const nights = sample.overnight.filter(n => !taken.has(n.morningKey));
    this.overnightState.update(list => [...list, ...nights]);
    this.sleepinessState.update(list => [...list, ...sample.sleepiness]);
    await this.persist('overnight', 'sleepiness');
    return [...nights, ...sample.sleepiness];
  }

  /** Removes several entries at once (e.g. undoing "Load sample data"). */
  async removeMany(entries: SleepData[]): Promise<void> {
    const ids = new Set(entries.map(e => e.id));
    this.overnightState.update(list => list.filter(e => !ids.has(e.id)));
    this.sleepinessState.update(list => list.filter(e => !ids.has(e.id)));
    await this.persist('overnight', 'sleepiness');
  }

  /** Puts back entries that were removed together (undo for "Remove sample data"). */
  async restoreMany(entries: SleepData[]): Promise<void> {
    const ids = new Set(entries.map(e => e.id));
    const nights = entries.filter((e): e is OvernightSleepData => e instanceof OvernightSleepData);
    const checkins = entries.filter((e): e is StanfordSleepinessData => e instanceof StanfordSleepinessData);
    this.overnightState.update(list => [...list.filter(e => !ids.has(e.id)), ...nights]);
    this.sleepinessState.update(list => [...list.filter(e => !ids.has(e.id)), ...checkins]);
    await this.persist('overnight', 'sleepiness');
  }

  /** Deletes everything and returns a function that puts it all back (for the Undo button). */
  async clearAll(): Promise<() => Promise<void>> {
    const overnight = this.overnightState();
    const sleepiness = this.sleepinessState();
    const session = this.sessionState();
    this.overnightState.set([]);
    this.sleepinessState.set([]);
    this.sessionState.set(null);
    await this.persist('overnight', 'sleepiness', 'session');
    return async () => {
      this.overnightState.set(overnight);
      this.sleepinessState.set(sleepiness);
      this.sessionState.set(session);
      await this.persist('overnight', 'sleepiness', 'session');
    };
  }

  /** Every entry as readable JSON, for "Export backup". */
  exportJSON(now = new Date()): string {
    return JSON.stringify({
      app: 'Drift',
      version: 1,
      exportedAt: now.toISOString(),
      overnight: this.overnight().map(e => ({
        ...e.toJSON(),
        bedtime: e.start.toString(),
        wokeUp: e.end.toString(),
      })),
      sleepiness: this.sleepiness().map(e => ({
        ...e.toJSON(),
        time: e.loggedAt.toString(),
        description: e.description,
      })),
    }, null, 2);
  }

  /** Snapshots the given stores now, then queues the writes behind any earlier ones. */
  private persist(...stores: StoreName[]): Promise<void> {
    const writes: [string, unknown][] = stores.map(store => {
      switch (store) {
        case 'overnight':
          return [STORAGE_KEYS.overnight, this.overnightState().map(e => e.toJSON())];
        case 'sleepiness':
          return [STORAGE_KEYS.sleepiness, this.sleepinessState().map(e => e.toJSON())];
        case 'session':
          return [STORAGE_KEYS.session, this.sessionState()];
      }
    });
    this.writeQueue = this.writeQueue
      .then(async () => {
        for (const [key, value] of writes) {
          if (value === null) {
            await this.storage.remove(key);
          } else {
            await this.storage.set(key, value);
          }
        }
      })
      .catch(err => console.error('Drift could not save to storage', err));
    this.changed$.next();
    return this.writeQueue;
  }
}
