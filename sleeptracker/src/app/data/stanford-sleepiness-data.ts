/* from the Stanford Sleepiness Scale */
/* https://web.stanford.edu/~dement/sss.html */

import { SleepData, SleepDataDTO } from './sleep-data';
import { DateKey, dateKey } from '../utils/time';

export interface SleepinessDTO extends SleepDataDTO {
  kind: 'sleepiness';
  value: number;
}

export class StanfordSleepinessData extends SleepData {
  public static ScaleValues = [undefined, // Sleepiness scale starts at 1
    'Feeling active, vital, alert, or wide awake', // 1
    'Functioning at high levels, but not at peak; able to concentrate', // 2
    'Awake, but relaxed; responsive but not fully alert', // 3
    'Somewhat foggy, let down', // 4
    'Foggy; losing interest in remaining awake; slowed down', // 5
    'Sleepy, woozy, fighting sleep; prefer to lie down', // 6
    'No longer fighting sleep, sleep onset soon; having dream-like thoughts']; // 7

  /** Short, scannable labels taken from the official wording above (used on small buttons). */
  public static ShortLabels = [undefined,
    'Wide awake', // 1
    'Focused', // 2
    'Relaxed', // 3
    'A bit foggy', // 4
    'Slowed down', // 5
    'Fighting sleep', // 6
    'Dozing off']; // 7

  /** All valid scale values, 1 through 7. */
  public static Levels = [1, 2, 3, 4, 5, 6, 7];

  private loggedValue: number;

  constructor(loggedValue: number, loggedAt: Date = new Date()) {
    super();
    this.loggedValue = loggedValue;
    this.loggedAt = loggedAt;
  }

  get value(): number {
    return this.loggedValue;
  }

  set value(v: number) {
    this.loggedValue = Math.min(7, Math.max(1, Math.round(v)));
  }

  /** The local day this check-in belongs to. */
  get dayKey(): DateKey {
    return dateKey(this.loggedAt);
  }

  get shortLabel(): string {
    return StanfordSleepinessData.ShortLabels[this.loggedValue] ?? '';
  }

  get description(): string {
    return StanfordSleepinessData.ScaleValues[this.loggedValue] ?? '';
  }

  override summaryString(): string {
    return this.loggedValue + ': ' + StanfordSleepinessData.ScaleValues[this.loggedValue];
  }

  toJSON(): SleepinessDTO {
    return { kind: 'sleepiness', ...this.baseJSON(), value: this.loggedValue };
  }

  clone(): StanfordSleepinessData {
    return StanfordSleepinessData.fromJSON(this.toJSON());
  }

  static fromJSON(dto: SleepinessDTO): StanfordSleepinessData {
    const entry = new StanfordSleepinessData(dto.value, new Date(dto.loggedAt));
    entry.restoreBase(dto);
    return entry;
  }

  static isValidDTO(dto: unknown): dto is SleepinessDTO {
    const d = dto as SleepinessDTO;
    return !!d && typeof d.id === 'string' && Number.isFinite(d.loggedAt) && Number.isInteger(d.value) && d.value >= 1 && d.value <= 7;
  }
}
