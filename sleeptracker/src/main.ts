import { importProvidersFrom, inject, provideAppInitializer } from '@angular/core';
import { bootstrapApplication } from '@angular/platform-browser';
import { RouteReuseStrategy, provideRouter, withPreloading, PreloadAllModules } from '@angular/router';
import { IonicRouteStrategy, provideIonicAngular } from '@ionic/angular/standalone';
import { IonicStorageModule } from '@ionic/storage-angular';
import { Capacitor } from '@capacitor/core';

import { routes } from './app/app.routes';
import { AppComponent } from './app/app.component';
import { registerIcons } from './app/icons';
import { StorageService } from './app/services/storage.service';
import { SleepService } from './app/services/sleep.service';
import { SettingsService } from './app/services/settings.service';
import { ReminderService } from './app/services/reminder.service';
import { ShareService } from './app/services/share.service';
import { FeedbackService } from './app/services/feedback.service';

registerIcons();

/** Resolves after `ms`, so a stuck storage engine can never keep the app from opening. */
const timeout = (ms: number) => new Promise<'timeout'>(resolve => setTimeout(() => resolve('timeout'), ms));

bootstrapApplication(AppComponent, {
  providers: [
    { provide: RouteReuseStrategy, useClass: IonicRouteStrategy },
    provideIonicAngular({
      // Drift is designed to Apple's guidelines. In a browser Ionic can't tell what phone it's
      // imitating, so pin iOS styling there; on a real device Ionic uses that device's own style.
      ...(Capacitor.getPlatform() === 'web' ? { mode: 'ios' as const } : {}),
      // Pass modal props through Angular's setInput(), so signal inputs work in modals.
      useSetInputAPI: true,
    }),
    provideRouter(routes, withPreloading(PreloadAllModules)),
    // Ionic Storage: IndexedDB in the browser, so logs survive reloads and restarts.
    importProvidersFrom(IonicStorageModule.forRoot({ name: 'drift' })),
    // Load saved data before the first screen renders (no flash of an empty app).
    provideAppInitializer(() => {
      // inject() only works before the first await.
      const storage = inject(StorageService);
      const sleep = inject(SleepService);
      const settings = inject(SettingsService);
      const reminders = inject(ReminderService);
      const share = inject(ShareService);
      const feedback = inject(FeedbackService);
      return (async () => {
        const loaded = await Promise.race([
          storage.init().then(() => Promise.all([sleep.load(), settings.load()])).then(() => 'ok' as const),
          timeout(3000),
        ]).catch(() => 'error' as const);
        if (loaded !== 'ok') {
          console.error('Drift: storage did not load', loaded);
          setTimeout(() => void feedback.toast('Couldn’t open saved data. New logs may not be saved.', { icon: 'warning' }), 800);
        }
        // Reminders and sharing finish setting up in the background.
        void reminders.init();
        void share.prewarm();
      })();
    }),
  ],
});
