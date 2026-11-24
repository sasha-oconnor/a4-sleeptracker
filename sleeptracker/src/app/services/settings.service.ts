import { Injectable, inject, signal } from '@angular/core';
import { Subject } from 'rxjs';
import { DEFAULT_SETTINGS, DriftSettings, STORAGE_KEYS, withDefaults } from '../data/settings.model';
import { StorageService } from './storage.service';

/** Holds the person's settings and saves every change immediately. */
@Injectable({ providedIn: 'root' })
export class SettingsService {
  private readonly storage = inject(StorageService);
  private readonly state = signal<DriftSettings>(DEFAULT_SETTINGS);

  readonly settings = this.state.asReadonly();
  /** Emits after each change, so reminders can re-sync. */
  readonly changed$ = new Subject<void>();

  async load(): Promise<void> {
    const saved = await this.storage.get<Partial<DriftSettings>>(STORAGE_KEYS.settings);
    this.state.set(withDefaults(saved));
  }

  /** Merges a partial change (nested reminder objects are replaced as a whole). */
  async patch(change: Partial<DriftSettings>): Promise<void> {
    this.state.update(s => ({ ...s, ...change }));
    this.changed$.next();
    await this.storage.set(STORAGE_KEYS.settings, this.state());
  }
}
