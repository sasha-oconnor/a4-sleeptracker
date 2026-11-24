import { Injectable, inject } from '@angular/core';
import { Router } from '@angular/router';
import { ActionSheetController, AlertController, ModalController } from '@ionic/angular/standalone';
import { SleepData } from '../data/sleep-data';
import { OvernightSleepData } from '../data/overnight-sleep-data';
import { StanfordSleepinessData } from '../data/stanford-sleepiness-data';
import { NightPrefill, OvernightLogPage } from '../modals/overnight-log/overnight-log.page';
import { SleepinessLogPage } from '../modals/sleepiness-log/sleepiness-log.page';
import { SssInfoComponent } from '../modals/sss-info/sss-info.component';
import { MINUTE_MS, dateKey, fmtClock, fmtDuration, fmtWeekday } from '../utils/time';
import { FeedbackService } from './feedback.service';
import { SleepService } from './sleep.service';

/**
 * Every way into logging — Today's buttons, the Journal's "+", toast buttons, and notification taps —
 * goes through here, so saving, undo, and feedback behave the same no matter where you start.
 */
@Injectable({ providedIn: 'root' })
export class LogFlowService {
  private readonly modals = inject(ModalController);
  private readonly sheets = inject(ActionSheetController);
  private readonly alerts = inject(AlertController);
  private readonly router = inject(Router);
  private readonly sleep = inject(SleepService);
  private readonly feedback = inject(FeedbackService);
  /** Stops a double tap (or a notification tap) from stacking two logging screens. */
  private busy = false;

  /** Opens the overnight log: blank, prefilled from the sleep timer, or editing an existing night. */
  async openOvernight(opts: { entry?: OvernightSleepData; prefill?: NightPrefill } = {}): Promise<void> {
    if (this.busy) {
      return;
    }
    this.busy = true;
    try {
      const modal = await this.modals.create({
        component: OvernightLogPage,
        componentProps: { entry: opts.entry ?? null, prefill: opts.prefill ?? null },
        presentingElement: await this.presentingElement(),
      });
      await modal.present();
      const { data, role } = await modal.onWillDismiss<OvernightSleepData>();
      if (role === 'save' && data) {
        await this.commitOvernight(data, opts.entry, !!opts.prefill?.fromTimer);
      } else if (role === 'delete' && opts.entry) {
        await this.remove(opts.entry);
      }
    } finally {
      this.busy = false;
    }
  }

  /** Opens the full sleepiness check-in (with context and notes), new or editing. */
  async openSleepiness(opts: { entry?: StanfordSleepinessData; value?: number } = {}): Promise<void> {
    if (this.busy) {
      return;
    }
    this.busy = true;
    try {
      const modal = await this.modals.create({
        component: SleepinessLogPage,
        componentProps: { entry: opts.entry ?? null, value: opts.value ?? null },
        presentingElement: await this.presentingElement(),
      });
      await modal.present();
      const { data, role } = await modal.onWillDismiss<StanfordSleepinessData>();
      if (role === 'save' && data) {
        await this.commitSleepiness(data, opts.entry);
      } else if (role === 'delete' && opts.entry) {
        await this.remove(opts.entry);
      }
    } finally {
      this.busy = false;
    }
  }

  /** One-tap check-in from the Today screen: logs right away, with Undo and a way to add details. */
  async quickCheckin(value: number): Promise<void> {
    const entry = new StanfordSleepinessData(value, new Date());
    await this.sleep.logSleepinessData(entry);
    this.feedback.haptic('success');
    await this.feedback.toast(`Logged ${value}: “${StanfordSleepinessData.ScaleValues[value]}”`, {
      icon: 'checkmark-circle',
      undo: () => this.sleep.remove(entry),
      action: { text: 'Add details', handler: () => this.openSleepiness({ entry }) },
    });
  }

  /** The Journal's "+" button. */
  async chooseLog(): Promise<void> {
    const timerRunning = !!this.sleep.session();
    const sheet = await this.sheets.create({
      header: 'What would you like to log?',
      buttons: [
        timerRunning
          ? { text: 'Stop sleep timer & log the night', icon: 'sunny', role: 'finish' }
          : { text: 'Last night’s sleep', icon: 'moon', role: 'overnight' },
        { text: 'Sleepiness check-in', icon: 'pulse', role: 'sleepiness' },
        ...(timerRunning ? [] : [{ text: 'Start sleep timer', icon: 'timer-outline', role: 'timer' }]),
        { text: 'Cancel', role: 'cancel' },
      ],
    });
    await sheet.present();
    const { role } = await sheet.onDidDismiss();
    switch (role) {
      case 'overnight':
        return this.openOvernight();
      case 'finish':
        return this.finishTimer();
      case 'sleepiness':
        return this.openSleepiness();
      case 'timer':
        return this.startTimer();
    }
  }

  /** Bedtime: start counting. The session is saved, so closing the app overnight is fine. */
  async startTimer(): Promise<void> {
    if (this.sleep.session()) {
      return;
    }
    await this.sleep.startSession();
    this.feedback.haptic('success');
    await this.feedback.toast('Sleep timer started. Sleep well 🌙', {
      icon: 'moon',
      undo: () => this.sleep.clearSession(),
    });
  }

  /** "I'm awake": hand the timer's times to the overnight log so only quality/notes are left to fill in. */
  async finishTimer(): Promise<void> {
    const session = this.sleep.session();
    if (!session) {
      return this.openOvernight();
    }
    const start = new Date(session.start);
    const end = new Date();
    const minutes = (end.getTime() - start.getTime()) / MINUTE_MS;
    if (minutes < 15) {
      // Probably a mis-tap; don't make them log a 3-minute "night".
      const alert = await this.alerts.create({
        header: 'That was quick',
        message: `The sleep timer has only been running for ${fmtDuration(minutes)}.`,
        buttons: [
          { text: 'Keep it running', role: 'cancel' },
          { text: 'Log it anyway', role: 'log' },
          { text: 'Discard timer', role: 'destructive' },
        ],
      });
      await alert.present();
      const { role } = await alert.onDidDismiss();
      if (role === 'destructive') {
        await this.sleep.clearSession();
        await this.feedback.toast('Sleep timer discarded', { undo: () => this.sleep.restoreSession(session) });
        return;
      }
      if (role !== 'log') {
        return;
      }
    }
    await this.openOvernight({ prefill: { start, end, fromTimer: true } });
  }

  /** Stops the timer without logging, after confirming. */
  async cancelTimer(): Promise<void> {
    const session = this.sleep.session();
    if (!session) {
      return;
    }
    const alert = await this.alerts.create({
      header: 'Stop the sleep timer?',
      message: 'Nothing will be logged for tonight.',
      buttons: [
        { text: 'Keep running', role: 'cancel' },
        { text: 'Stop timer', role: 'destructive' },
      ],
    });
    await alert.present();
    const { role } = await alert.onDidDismiss();
    if (role === 'destructive') {
      await this.sleep.clearSession();
      await this.feedback.toast('Sleep timer stopped', { undo: () => this.sleep.restoreSession(session) });
    }
  }

  /** Deletes an entry, with an Undo toast instead of an "are you sure?" dialog. */
  async remove(entry: SleepData): Promise<void> {
    await this.sleep.remove(entry);
    this.feedback.haptic('warning');
    const what = entry instanceof OvernightSleepData
      ? `${fmtWeekday(new Date(entry.end.getTime() - 24 * 60 * MINUTE_MS))} night’s sleep`
      : `${fmtClock(entry.loggedAt)} check-in`;
    await this.feedback.toast(`Deleted ${what}`, { icon: 'trash', undo: () => this.sleep.save(entry) });
  }

  /** A half-height sheet explaining what each number on the scale means. */
  async showScaleInfo(): Promise<void> {
    const sheet = await this.modals.create({
      component: SssInfoComponent,
      breakpoints: [0, 0.7, 1],
      initialBreakpoint: 0.7,
    });
    await sheet.present();
  }

  /** Where a tapped reminder should take the person. */
  async route(action: string | undefined): Promise<void> {
    await this.router.navigateByUrl('/tabs/today');
    switch (action) {
      case 'log-sleepiness':
        return this.openSleepiness();
      case 'finish-session':
        return this.finishTimer();
      case 'log-overnight':
        if (this.sleep.session()) {
          return this.finishTimer();
        }
        // Already logged this morning (e.g. on another path)? Then Today is the right place.
        return this.sleep.nightFor(dateKey(new Date())) ? undefined : this.openOvernight();
    }
  }

  private async commitOvernight(entry: OvernightSleepData, original: OvernightSleepData | undefined, fromTimer: boolean): Promise<void> {
    // One log per morning: saving over an existing night replaces it (and Undo brings it back).
    const replaced = this.sleep.nightFor(entry.morningKey, entry.id);
    const session = this.sleep.session();
    if (replaced) {
      await this.sleep.remove(replaced);
    }
    await this.sleep.logOvernightData(entry);
    if (fromTimer) {
      await this.sleep.clearSession();
    }
    this.feedback.haptic('success');
    const message = original ? 'Sleep log updated' : `Logged ${entry.durationString()} of sleep`;
    await this.feedback.toast(replaced ? `${message} (replaced the earlier log)` : message, {
      icon: 'moon',
      undo: async () => {
        if (original) {
          await this.sleep.logOvernightData(original);
        } else {
          await this.sleep.remove(entry);
        }
        if (replaced) {
          await this.sleep.logOvernightData(replaced);
        }
        if (fromTimer && session) {
          await this.sleep.restoreSession(session);
        }
      },
    });
  }

  private async commitSleepiness(entry: StanfordSleepinessData, original: StanfordSleepinessData | undefined): Promise<void> {
    await this.sleep.logSleepinessData(entry);
    this.feedback.haptic('success');
    const message = original ? 'Check-in updated' : `Logged ${entry.value}: “${entry.description}”`;
    await this.feedback.toast(message, {
      icon: 'checkmark-circle',
      undo: () => (original ? this.sleep.logSleepinessData(original) : this.sleep.remove(entry)),
    });
  }

  /** iOS "card" modals slide over (and slightly shrink) whatever is underneath. */
  private async presentingElement(): Promise<HTMLElement | undefined> {
    return (await this.modals.getTop()) ?? document.querySelector<HTMLElement>('ion-router-outlet') ?? undefined;
  }
}
