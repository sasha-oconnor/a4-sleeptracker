import { Injectable, inject } from '@angular/core';
// Aliased so it can't be confused with the browser's built-in `Storage` (localStorage) type.
import { Storage as IonicStorage } from '@ionic/storage-angular';

/**
 * Thin wrapper around Ionic Storage. In the browser it saves to IndexedDB; on a device it uses the
 * best available engine. Values must be plain objects (class instances lose their methods), so the
 * data classes convert themselves with toJSON()/fromJSON().
 */
@Injectable({ providedIn: 'root' })
export class StorageService {
  private readonly storage = inject(IonicStorage);
  private ready?: Promise<IonicStorage>;

  /** Opens the database once; every other call waits for it. */
  init(): Promise<IonicStorage> {
    return (this.ready ??= this.storage.create());
  }

  async get<T>(key: string): Promise<T | null> {
    const db = await this.init();
    return ((await db.get(key)) as T | undefined) ?? null;
  }

  async set(key: string, value: unknown): Promise<void> {
    const db = await this.init();
    await db.set(key, value);
  }

  async remove(key: string): Promise<void> {
    const db = await this.init();
    await db.remove(key);
  }
}
