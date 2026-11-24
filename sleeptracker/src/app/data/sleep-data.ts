import { nanoid } from 'nanoid';

/** Tells the two kinds of entries apart once they've been saved as plain objects. */
export type SleepDataKind = 'overnight' | 'sleepiness';

/** Fields every saved entry shares. Dates are stored as epoch milliseconds. */
export interface SleepDataDTO {
  kind: SleepDataKind;
  id: string;
  loggedAt: number;
  notes?: string;
  tags?: string[];
  sample?: boolean;
}

export class SleepData {
  id: string;
  loggedAt: Date;
  /** Optional free-text note. */
  notes = '';
  /** Ids from the tag catalog (see catalog.ts), e.g. "caffeine" or "class". */
  tags: string[] = [];
  /** True for entries made by "Load sample data", so they can be removed separately. */
  sample = false;

  constructor() {
    // Assign a random (unique) ID. This may be useful for comparison (e.g., are two logged entries the same).
    this.id = nanoid();
    this.loggedAt = new Date();
  }

  /** The moment an entry is "about"; used to sort overnight and sleepiness logs on one timeline. */
  get timestamp(): Date {
    return this.loggedAt;
  }

  summaryString(): string {
    return 'Unknown sleep data';
  }

  dateString(): string {
    return this.loggedAt.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
  }

  /** The shared part of the plain object that gets written to storage. */
  protected baseJSON(): Omit<SleepDataDTO, 'kind'> {
    return {
      id: this.id,
      loggedAt: this.loggedAt.getTime(),
      notes: this.notes,
      tags: [...this.tags],
      ...(this.sample ? { sample: true } : {}),
    };
  }

  /** Copies the shared fields back from a stored object (the constructor made a fresh id/time). */
  protected restoreBase(dto: SleepDataDTO): void {
    this.id = dto.id;
    this.loggedAt = new Date(dto.loggedAt);
    this.notes = dto.notes ?? '';
    this.tags = Array.isArray(dto.tags) ? [...dto.tags] : [];
    this.sample = !!dto.sample;
  }
}
