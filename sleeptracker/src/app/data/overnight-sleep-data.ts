import { SleepData, SleepDataDTO } from './sleep-data';
import { DateKey, addDays, dateKey, fmtDuration } from '../utils/time';

/** How an overnight entry was created. */
export type OvernightSource = 'manual' | 'timer';

export interface OvernightSleepDTO extends SleepDataDTO {
  kind: 'overnight';
  sleepStart: number;
  sleepEnd: number;
  quality: number | null;
  source: OvernightSource;
}

export class OvernightSleepData extends SleepData {
  private sleepStart: Date;
  private sleepEnd: Date;
  /** How rested the person felt on waking, 1 (poor) to 5 (great); null if they skipped it. */
  quality: number | null = null;
  /** Typed in the morning, or recorded with the bedtime timer. */
  source: OvernightSource = 'manual';

  constructor(sleepStart: Date, sleepEnd: Date) {
    super();
    this.sleepStart = sleepStart;
    this.sleepEnd = sleepEnd;
  }

  get start(): Date {
    return this.sleepStart;
  }

  get end(): Date {
    return this.sleepEnd;
  }

  override get timestamp(): Date {
    return this.sleepEnd;
  }

  get durationMs(): number {
    return this.sleepEnd.getTime() - this.sleepStart.getTime();
  }

  get durationMin(): number {
    return Math.round(this.durationMs / (1000 * 60));
  }

  /** People log one overnight sleep per day: the local date they woke up identifies the night. */
  get morningKey(): DateKey {
    return dateKey(this.sleepEnd);
  }

  /** Moves the sleep window (used when an entry is edited). */
  setWindow(sleepStart: Date, sleepEnd: Date): void {
    this.sleepStart = sleepStart;
    this.sleepEnd = sleepEnd;
  }

  override summaryString(): string {
    const sleepStart_ms = this.sleepStart.getTime();
    const sleepEnd_ms = this.sleepEnd.getTime();

    // Calculate the difference in milliseconds
    const difference_ms = sleepEnd_ms - sleepStart_ms;

    // Convert to hours and minutes
    return Math.floor(difference_ms / (1000 * 60 * 60)) + ' hours, ' + Math.floor(difference_ms / (1000 * 60) % 60) + ' minutes.';
  }

  /** Compact duration for the UI, e.g. "7h 45m". */
  durationString(): string {
    return fmtDuration(this.durationMin);
  }

  override dateString(): string {
    // A night belongs to the evening before the wake-up date, so a 1 AM bedtime on Tuesday is
    // still "Monday night" (the starter used the bedtime's date, which mislabeled late nights).
    const evening = addDays(this.sleepEnd, -1);
    return 'Night of ' + evening.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
  }

  toJSON(): OvernightSleepDTO {
    return {
      kind: 'overnight',
      ...this.baseJSON(),
      sleepStart: this.sleepStart.getTime(),
      sleepEnd: this.sleepEnd.getTime(),
      quality: this.quality,
      source: this.source,
    };
  }

  /** A deep copy, so edit screens can change a draft without touching the saved entry. */
  clone(): OvernightSleepData {
    return OvernightSleepData.fromJSON(this.toJSON());
  }

  static fromJSON(dto: OvernightSleepDTO): OvernightSleepData {
    const entry = new OvernightSleepData(new Date(dto.sleepStart), new Date(dto.sleepEnd));
    entry.restoreBase(dto);
    entry.quality = typeof dto.quality === 'number' ? dto.quality : null;
    entry.source = dto.source === 'timer' ? 'timer' : 'manual';
    return entry;
  }

  /** Guards against corrupt or hand-edited storage. */
  static isValidDTO(dto: unknown): dto is OvernightSleepDTO {
    const d = dto as OvernightSleepDTO;
    return !!d && typeof d.id === 'string' && Number.isFinite(d.sleepStart) && Number.isFinite(d.sleepEnd) && d.sleepEnd > d.sleepStart;
  }
}
