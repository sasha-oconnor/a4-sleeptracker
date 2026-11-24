import { Injectable, signal } from '@angular/core';
import { App } from '@capacitor/app';

/**
 * The current time as a signal, so time-based UI (greeting, "sleeping for 7h 12m", which hero card
 * to show) stays current without a reload. Refreshes twice a minute and whenever the app resumes.
 */
@Injectable({ providedIn: 'root' })
export class ClockService {
  readonly now = signal(new Date());

  constructor() {
    setInterval(() => this.tick(), 30 * 1000);
    App.addListener('resume', () => this.tick()).catch(() => undefined);
  }

  tick(): void {
    this.now.set(new Date());
  }
}
