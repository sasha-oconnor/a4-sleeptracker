import { Component, computed, inject, signal } from '@angular/core';
import {
  AlertController,
  IonButton,
  IonContent,
  IonDatetime,
  IonDatetimeButton,
  IonHeader,
  IonIcon,
  IonItem,
  IonLabel,
  IonList,
  IonListHeader,
  IonModal,
  IonNote,
  IonRange,
  IonTitle,
  IonToggle,
  IonToolbar,
} from '@ionic/angular/standalone';
import { DriftSettings } from '../../data/settings.model';
import { SleepData } from '../../data/sleep-data';
import { ClockService } from '../../services/clock.service';
import { FeedbackService } from '../../services/feedback.service';
import { LogFlowService } from '../../services/log-flow.service';
import { ReminderKind, ReminderService } from '../../services/reminder.service';
import { SettingsService } from '../../services/settings.service';
import { ShareService } from '../../services/share.service';
import { SleepService } from '../../services/sleep.service';
import { dateKey, fmtClock, fmtDuration, inSleepWindow, isoAt, minutesFromIso } from '../../utils/time';

type ReminderSetting = 'checkins' | 'morning' | 'windDown';

@Component({
  selector: 'app-settings',
  templateUrl: './settings.page.html',
  styleUrls: ['./settings.page.scss'],
  imports: [
    IonHeader, IonToolbar, IonTitle, IonContent, IonList, IonListHeader, IonItem, IonLabel, IonNote, IonIcon,
    IonButton, IonToggle, IonRange, IonDatetime, IonDatetimeButton, IonModal,
  ],
})
export class SettingsPage {
  private readonly settingsService = inject(SettingsService);
  private readonly sleep = inject(SleepService);
  private readonly clock = inject(ClockService);
  private readonly alerts = inject(AlertController);
  private readonly feedback = inject(FeedbackService);
  private readonly shareService = inject(ShareService);
  protected readonly reminders = inject(ReminderService);
  protected readonly flow = inject(LogFlowService);

  protected readonly settings = this.settingsService.settings;
  /** Follows the slider while dragging; saved when the drag ends. */
  protected readonly goalDraft = signal<number | null>(null);
  protected readonly goalText = computed(() => fmtDuration(this.goalDraft() ?? this.settings().goalMin));
  protected readonly addingTime = signal(false);

  private readonly anchorDay = computed(() => dateKey(this.clock.now()));
  protected readonly usualBedIso = computed(() => isoAt(this.anchorDay(), this.settings().usualBedMin));
  protected readonly usualWakeIso = computed(() => isoAt(this.anchorDay(), this.settings().usualWakeMin));

  protected readonly nightCount = computed(() => this.sleep.overnight().length);
  protected readonly checkinCount = computed(() => this.sleep.sleepiness().length);
  protected readonly sampleCount = this.sleep.sampleCount;
  protected readonly upcoming = computed(() => this.reminders.upcoming().slice(0, 4));

  protected readonly permissionNote = computed(() => {
    switch (this.reminders.permission()) {
      case 'granted':
        return 'Notifications are allowed. In a browser, reminders arrive while Drift is open in a tab; in the phone app they arrive even when it’s closed.';
      case 'denied':
        return 'Notifications are blocked. Allow them for this site in your browser’s settings to get reminders.';
      case 'unsupported':
        return 'This browser can’t show notifications. Try Chrome or Edge on a computer.';
      default:
        return 'Drift asks for notification permission only when you turn a reminder on.';
    }
  });

  protected readonly fmtClock = fmtClock;
  /** Label shown on the slider's knob while dragging. */
  protected readonly pinFormatter = (value: number): string => fmtDuration(value);

  protected onGoalInput(value: unknown): void {
    if (typeof value === 'number') {
      this.goalDraft.set(value);
    }
  }

  protected async onGoalChange(value: unknown): Promise<void> {
    if (typeof value === 'number') {
      await this.settingsService.patch({ goalMin: value });
      this.goalDraft.set(null);
      this.feedback.haptic();
    }
  }

  protected async onUsualBed(value: string | string[] | null | undefined): Promise<void> {
    if (typeof value === 'string') {
      await this.settingsService.patch({ usualBedMin: minutesFromIso(value) });
    }
  }

  protected async onUsualWake(value: string | string[] | null | undefined): Promise<void> {
    if (typeof value === 'string') {
      await this.settingsService.patch({ usualWakeMin: minutesFromIso(value) });
    }
  }

  /** Reminder toggles. Turning one on asks for permission; if refused, the toggle flips back off. */
  protected async toggleReminder(kind: ReminderSetting, event: Event): Promise<void> {
    const toggle = event.target as HTMLIonToggleElement;
    if (toggle.checked) {
      const ok = await this.reminders.turnOn(kind);
      if (!ok) {
        toggle.checked = false;
      } else {
        this.feedback.haptic('success');
      }
    } else {
      await this.reminders.turnOff(kind);
    }
  }

  protected async removeTime(index: number): Promise<void> {
    const checkins = this.settings().checkins;
    const removed = checkins.times[index];
    const times = checkins.times.filter((_, i) => i !== index);
    await this.settingsService.patch({ checkins: { ...checkins, times } });
    await this.feedback.toast(`Removed the ${fmtClock(removed)} check-in`, {
      undo: () => this.settingsService.patch({ checkins: { ...this.settings().checkins, times: [...this.settings().checkins.times, removed].sort((a, b) => a - b) } }),
    });
  }

  protected async addTime(value: string | string[] | null | undefined): Promise<void> {
    this.addingTime.set(false);
    if (typeof value !== 'string') {
      return;
    }
    const minutes = minutesFromIso(value);
    const s = this.settings();
    if (s.checkins.times.includes(minutes)) {
      await this.feedback.toast(`You already have a check-in at ${fmtClock(minutes)}.`);
      return;
    }
    if (inSleepWindow(minutes, s.usualBedMin, s.usualWakeMin)) {
      await this.feedback.toast(`${fmtClock(minutes)} is during your usual sleep, so Drift wouldn’t send it.`, { icon: 'moon' });
      return;
    }
    const times = [...s.checkins.times, minutes].sort((a, b) => a - b);
    await this.settingsService.patch({ checkins: { ...s.checkins, times } });
    this.feedback.haptic('success');
  }

  protected async sendTest(): Promise<void> {
    const result = await this.reminders.sendTest(5);
    if (result === 'granted') {
      await this.feedback.toast('A test check-in will arrive in 5 seconds.', { icon: 'notifications' });
    } else {
      await this.reminders.explainBlocked();
    }
  }

  protected kindLabel(kind: ReminderKind): string {
    return kind === 'checkin' ? 'Check-in' : kind === 'morning' ? 'Morning sleep log' : kind === 'winddown' ? 'Wind-down' : 'Test';
  }

  protected whenLabel(at: Date): string {
    const today = dateKey(this.clock.now());
    const day = dateKey(at) === today ? 'Today' : at.toLocaleDateString('en-US', { weekday: 'short' });
    return `${day}, ${fmtClock(at)}`;
  }

  protected async patch(change: Partial<DriftSettings>): Promise<void> {
    await this.settingsService.patch(change);
  }

  protected async exportBackup(): Promise<void> {
    const outcome = await this.shareService.exportFile(`drift-backup-${dateKey(new Date())}.json`, this.sleep.exportJSON());
    const message = outcome === 'downloaded' ? 'Backup saved to your downloads.'
      : outcome === 'shared' ? 'Backup shared.'
      : outcome === 'copied' ? 'Backup copied to the clipboard.'
      : outcome === 'cancelled' ? null : 'Couldn’t export a backup here.';
    if (message) {
      await this.feedback.toast(message, { icon: 'cloud-download-outline' });
    }
  }

  protected async loadSample(): Promise<void> {
    if (this.sleep.count() > 0) {
      const alert = await this.alerts.create({
        header: 'Add sample data?',
        message: 'Drift will add three weeks of example nights and check-ins alongside your own logs. You can remove them later.',
        buttons: [{ text: 'Cancel', role: 'cancel' }, { text: 'Add', role: 'confirm' }],
      });
      await alert.present();
      if ((await alert.onDidDismiss()).role !== 'confirm') {
        return;
      }
    }
    const added = await this.sleep.loadSample();
    this.feedback.haptic('success');
    await this.feedback.toast(`Added ${added.length} sample entries`, {
      icon: 'flask-outline',
      undo: () => this.sleep.removeMany(added),
    });
  }

  protected async removeSample(): Promise<void> {
    const sample: SleepData[] = this.sleep.all().filter(e => e.sample);
    await this.sleep.removeMany(sample);
    await this.feedback.toast(`Removed ${sample.length} sample entries`, {
      icon: 'flask-outline',
      undo: () => this.sleep.restoreMany(sample),
    });
  }

  protected async deleteAll(): Promise<void> {
    const alert = await this.alerts.create({
      header: 'Delete all data?',
      message: `This removes ${this.nightCount()} nights and ${this.checkinCount()} check-ins from this device.`,
      buttons: [
        { text: 'Cancel', role: 'cancel' },
        { text: 'Delete All', role: 'destructive' },
      ],
    });
    await alert.present();
    if ((await alert.onDidDismiss()).role !== 'destructive') {
      return;
    }
    const undo = await this.sleep.clearAll();
    this.feedback.haptic('warning');
    await this.feedback.toast('All data deleted', { icon: 'trash', undo });
  }
}
