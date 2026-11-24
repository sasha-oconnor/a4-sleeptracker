import { Injectable, Injector, NgZone, computed, inject, signal } from '@angular/core';
import { AlertController } from '@ionic/angular/standalone';
import { App } from '@capacitor/app';
import { ActionPerformed, LocalNotificationSchema, LocalNotifications } from '@capacitor/local-notifications';
import { debounceTime, merge } from 'rxjs';
import { OvernightSleepData } from '../data/overnight-sleep-data';
import { StanfordSleepinessData } from '../data/stanford-sleepiness-data';
import { DriftSettings, SleepSession } from '../data/settings.model';
import { MINUTE_MS, addDays, atMinute, dateKey, fmtClock, fmtDuration, inSleepWindow, startOfDay, wrapMinutes } from '../utils/time';
import { ClockService } from './clock.service';
import { FeedbackService } from './feedback.service';
import { LogFlowService } from './log-flow.service';
import { SettingsService } from './settings.service';
import { SleepService } from './sleep.service';

export type NotificationPermission = 'granted' | 'denied' | 'prompt' | 'unsupported';
export type ReminderKind = 'checkin' | 'morning' | 'winddown' | 'test';
/** What tapping a reminder should open. */
export type ReminderAction = 'log-sleepiness' | 'log-overnight' | 'finish-session' | 'open-today';

export interface PlannedReminder {
  id: number;
  kind: ReminderKind;
  at: Date;
  title: string;
  body: string;
  action: ReminderAction;
}

/** How far ahead reminders are scheduled. They're re-planned on every launch and every change. */
const DAYS_AHEAD = 7;
/** Ids at or above this are one-off test reminders that a re-sync must not cancel. */
const TEST_ID_BASE = 9000;

/** Rotating wording, so check-in prompts don't all read the same. */
const CHECKIN_PROMPTS = [
  'How sleepy do you feel right now? Logging takes 5 seconds.',
  'Quick check: how alert are you on the 1–7 scale?',
  'Rate your sleepiness right now. Tap to log it.',
];

/**
 * Reminders built on Capacitor Local Notifications. Daytime check-ins are experience sampling:
 * prompting someone during the day is far more reliable than asking them to remember later.
 *
 * On the web the plugin can only fire one-off reminders at an exact time (`schedule.at`) while the
 * tab is open, so instead of repeating schedules we plan the next week of reminders and re-plan
 * whenever the app starts, resumes, or the data changes.
 */
@Injectable({ providedIn: 'root' })
export class ReminderService {
  private readonly sleep = inject(SleepService);
  private readonly settingsService = inject(SettingsService);
  private readonly clock = inject(ClockService);
  private readonly feedback = inject(FeedbackService);
  private readonly zone = inject(NgZone);
  private readonly injector = inject(Injector);
  private readonly alerts = inject(AlertController);

  readonly permission = signal<NotificationPermission>('prompt');
  /** Everything currently planned, soonest first. */
  readonly planned = signal<PlannedReminder[]>([]);
  /** Planned reminders that haven't fired yet. */
  readonly upcoming = computed(() => {
    const now = this.clock.now().getTime();
    return this.planned().filter(r => r.at.getTime() > now);
  });
  readonly next = computed(() => this.upcoming()[0] ?? null);
  readonly anyEnabled = computed(() => {
    const s = this.settingsService.settings();
    return s.checkins.enabled || s.morning.enabled || s.windDown.enabled;
  });

  private syncQueue: Promise<void> = Promise.resolve();
  private testCount = 0;

  /** Called once at startup. Never throws: reminders are a bonus, not a reason to fail to boot. */
  async init(): Promise<void> {
    try {
      // Native callbacks arrive outside Angular's zone; run them inside so the UI updates.
      await LocalNotifications.addListener('localNotificationActionPerformed', (event: ActionPerformed) =>
        this.zone.run(() => this.onTapped(event.notification)));
      await LocalNotifications.addListener('localNotificationReceived', (notification: LocalNotificationSchema) =>
        this.zone.run(() => this.onReceived(notification)));
      await App.addListener('resume', () => this.zone.run(() => void this.refreshPermission().then(() => this.sync())));
    } catch (err) {
      console.warn('Drift: reminder listeners unavailable', err);
    }
    merge(this.sleep.changed$, this.settingsService.changed$)
      .pipe(debounceTime(400))
      .subscribe(() => void this.sync());
    await this.refreshPermission();
    await this.sync();
  }

  async refreshPermission(): Promise<NotificationPermission> {
    try {
      const { display } = await LocalNotifications.checkPermissions();
      this.permission.set(display === 'granted' ? 'granted' : display === 'denied' ? 'denied' : 'prompt');
    } catch {
      // e.g. a mobile browser tab, where web pages can't create notifications.
      this.permission.set('unsupported');
    }
    return this.permission();
  }

  /** Shows the OS/browser permission prompt. Only ever called right after the person taps a toggle. */
  async requestPermission(): Promise<boolean> {
    try {
      const { display } = await LocalNotifications.requestPermissions();
      this.permission.set(display === 'granted' ? 'granted' : display === 'denied' ? 'denied' : 'prompt');
    } catch {
      this.permission.set('unsupported');
    }
    void this.sync();
    return this.permission() === 'granted';
  }

  /**
   * Turns on one kind of reminder. Permission is requested here, right after the person asked for
   * reminders, never at launch; if it's refused, the setting stays off and we explain why.
   */
  async turnOn(kind: 'checkins' | 'morning' | 'windDown'): Promise<boolean> {
    const granted = this.permission() === 'granted' || (await this.requestPermission());
    if (!granted) {
      await this.explainBlocked();
      return false;
    }
    const settings = this.settingsService.settings();
    await this.settingsService.patch({ [kind]: { ...settings[kind], enabled: true } } as Partial<DriftSettings>);
    return true;
  }

  async turnOff(kind: 'checkins' | 'morning' | 'windDown'): Promise<void> {
    const settings = this.settingsService.settings();
    await this.settingsService.patch({ [kind]: { ...settings[kind], enabled: false } } as Partial<DriftSettings>);
  }

  /** Says why reminders can't be shown and how to fix it. */
  async explainBlocked(): Promise<void> {
    const unsupported = this.permission() === 'unsupported';
    const alert = await this.alerts.create({
      header: unsupported ? 'Notifications aren’t available here' : 'Notifications are turned off',
      message: unsupported
        ? 'This browser can’t show notifications from a web page. Try Chrome or Edge on a computer, or use the Drift app on your phone.'
        : 'Drift can’t remind you until notifications are allowed. Allow them for this site in your browser’s settings (or for Drift in your phone’s Settings), then try again.',
      buttons: ['OK'],
    });
    await alert.present();
  }

  /** Re-plans and reschedules everything. Runs one sync at a time so reminders are never doubled up. */
  sync(): Promise<void> {
    this.syncQueue = this.syncQueue
      .then(() => this.doSync())
      .catch(err => console.warn('Drift: could not schedule reminders', err));
    return this.syncQueue;
  }

  /** Sends a sample check-in reminder a few seconds from now (handy for trying it out). */
  async sendTest(seconds = 5): Promise<NotificationPermission> {
    if (this.permission() !== 'granted' && !(await this.requestPermission())) {
      return this.permission();
    }
    const id = TEST_ID_BASE + (this.testCount++ % 900);
    await LocalNotifications.schedule({
      notifications: [{
        id,
        title: 'Quick check-in',
        body: CHECKIN_PROMPTS[0],
        schedule: { at: new Date(Date.now() + seconds * 1000), allowWhileIdle: true },
        extra: { action: 'log-sleepiness', kind: 'test' },
      }],
    });
    return 'granted';
  }

  private async doSync(): Promise<void> {
    const plan = ReminderService.plan(
      new Date(),
      this.settingsService.settings(),
      this.sleep.overnight(),
      this.sleep.sleepiness(),
      this.sleep.session(),
    );
    this.planned.set(plan);

    // Chrome reports success even without permission and then shows nothing, so check first.
    if (this.permission() !== 'granted') {
      return;
    }
    const pending = await LocalNotifications.getPending();
    const stale = pending.notifications.filter(n => n.id < TEST_ID_BASE);
    if (stale.length) {
      await LocalNotifications.cancel({ notifications: stale.map(n => ({ id: n.id })) });
    }
    if (plan.length) {
      await LocalNotifications.schedule({
        notifications: plan.map(r => ({
          id: r.id,
          title: r.title,
          body: r.body,
          schedule: { at: r.at, allowWhileIdle: true },
          extra: { action: r.action, kind: r.kind },
        })),
      });
    }
  }

  /** The person tapped a notification: bring the app forward and open the matching screen. */
  private onTapped(notification: LocalNotificationSchema): void {
    window.focus();
    const action = (notification.extra as { action?: ReminderAction } | undefined)?.action;
    void this.injector.get(LogFlowService).route(action);
  }

  /** A reminder fired while the app is open: also show it in-app (OS banners can be easy to miss). */
  private onReceived(notification: LocalNotificationSchema): void {
    if (document.visibilityState !== 'visible') {
      return;
    }
    const action = (notification.extra as { action?: ReminderAction } | undefined)?.action;
    const label = action === 'log-sleepiness' ? 'Log now' : action === 'open-today' ? 'OK' : 'Open';
    void this.feedback.toast(notification.body, {
      header: notification.title,
      position: 'top',
      icon: 'notifications',
      duration: 8000,
      action: { text: label, handler: () => this.injector.get(LogFlowService).route(action) },
    });
    this.feedback.haptic('tap');
  }

  /**
   * Works out every reminder for the next few days. Pure (no side effects), so it's easy to test.
   * - Check-ins at the chosen times, skipped inside the sleep window and when the person
   *   already checked in during the previous hour (no nagging right after logging).
   * - A morning "how did you sleep?" reminder, skipped once that morning has been logged.
   * - A wind-down reminder before the usual bedtime.
   */
  static plan(
    now: Date,
    settings: DriftSettings,
    nights: OvernightSleepData[],
    checkins: StanfordSleepinessData[],
    session: SleepSession | null,
    days = DAYS_AHEAD,
  ): PlannedReminder[] {
    const out: PlannedReminder[] = [];
    const today = startOfDay(now);
    const loggedMornings = new Set(nights.map(n => n.morningKey));
    const checkinTimes = checkins.map(c => c.loggedAt.getTime());

    for (let d = 0; d < days; d++) {
      const day = addDays(today, d);

      if (settings.morning.enabled && !loggedMornings.has(dateKey(day))) {
        const at = atMinute(day, settings.usualWakeMin + settings.morning.offsetMin);
        const timerRunning = !!session && session.start < at.getTime();
        out.push({
          id: 1000 + d,
          kind: 'morning',
          at,
          title: 'Good morning ☀️',
          body: timerRunning
            ? 'Your sleep timer is still running. Tap to stop it and rate your night.'
            : 'How did you sleep? Log last night while you still remember it.',
          action: timerRunning ? 'finish-session' : 'log-overnight',
        });
      }

      if (settings.windDown.enabled) {
        const at = atMinute(day, wrapMinutes(settings.usualBedMin - settings.windDown.leadMin));
        out.push({
          id: 2000 + d,
          kind: 'winddown',
          at,
          title: 'Time to wind down 🌙',
          body: `Bedtime is ${fmtClock(settings.usualBedMin)}. Putting your phone away soon helps you get ${fmtDuration(settings.goalMin)}.`,
          action: 'open-today',
        });
      }

      if (settings.checkins.enabled) {
        [...settings.checkins.times].sort((a, b) => a - b).forEach((minutes, i) => {
          if (inSleepWindow(minutes, settings.usualBedMin, settings.usualWakeMin)) {
            return;
          }
          const at = atMinute(day, minutes);
          const recentlyLogged = checkinTimes.some(t => t <= at.getTime() && t > at.getTime() - 60 * MINUTE_MS);
          if (recentlyLogged) {
            return;
          }
          out.push({
            id: 3000 + d * 10 + i,
            kind: 'checkin',
            at,
            title: 'Quick check-in',
            body: CHECKIN_PROMPTS[(d + i) % CHECKIN_PROMPTS.length],
            action: 'log-sleepiness',
          });
        });
      }
    }

    return out.filter(r => r.at.getTime() > now.getTime()).sort((a, b) => a.at.getTime() - b.at.getTime());
  }
}
