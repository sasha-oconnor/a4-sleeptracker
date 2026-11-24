import { Component, computed, inject } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import {
  IonButton,
  IonContent,
  IonHeader,
  IonIcon,
  IonItem,
  IonLabel,
  IonList,
  IonNote,
  IonTitle,
  IonToolbar,
} from '@ionic/angular/standalone';
import { DurationChartComponent } from '../../components/duration-chart/duration-chart.component';
import { SleepDialComponent } from '../../components/sleep-dial/sleep-dial.component';
import { SssQuickRowComponent } from '../../components/sss-quick-row/sss-quick-row.component';
import { QUALITY_LABELS } from '../../data/catalog';
import { StanfordSleepinessData } from '../../data/stanford-sleepiness-data';
import { ClockService } from '../../services/clock.service';
import { FeedbackService } from '../../services/feedback.service';
import { LogFlowService } from '../../services/log-flow.service';
import { ReminderService } from '../../services/reminder.service';
import { SettingsService } from '../../services/settings.service';
import { SleepService } from '../../services/sleep.service';
import { durationSeries, nightsInRange, rangeStats } from '../../utils/stats';
import {
  MINUTE_MS,
  dateKey,
  fmtClock,
  fmtDuration,
  greeting,
  inSleepWindow,
  minuteOfDay,
  wrapMinutes,
} from '../../utils/time';

type Hero = 'welcome' | 'sleeping' | 'bedtime' | 'log' | 'summary';

/**
 * The first screen: what matters right now. In the morning that's logging last night; during the
 * day it's a one-tap sleepiness check-in; at night it's the sleep timer.
 */
@Component({
  selector: 'app-today',
  templateUrl: './today.page.html',
  styleUrls: ['./today.page.scss'],
  imports: [
    IonHeader, IonToolbar, IonTitle, IonContent, IonButton, IonIcon, IonList, IonItem, IonLabel, IonNote,
    RouterLink, SleepDialComponent, SssQuickRowComponent, DurationChartComponent,
  ],
})
export class TodayPage {
  private readonly sleep = inject(SleepService);
  private readonly settingsService = inject(SettingsService);
  private readonly clock = inject(ClockService);
  private readonly feedback = inject(FeedbackService);
  private readonly router = inject(Router);
  protected readonly flow = inject(LogFlowService);
  protected readonly reminders = inject(ReminderService);

  protected readonly now = this.clock.now;
  protected readonly settings = this.settingsService.settings;
  protected readonly todayKey = computed(() => dateKey(this.now()));
  protected readonly dateLine = computed(() =>
    this.now().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' }));
  protected readonly greeting = computed(() => greeting(this.now()));

  protected readonly session = this.sleep.session;
  protected readonly lastNight = computed(() => this.sleep.nightFor(this.todayKey()));
  protected readonly todaysCheckins = computed(() => this.sleep.checkinsOn(this.todayKey()));

  /** From three hours before the usual bedtime until 4 AM. */
  protected readonly isEvening = computed(() =>
    inSleepWindow(minuteOfDay(this.now()), wrapMinutes(this.settings().usualBedMin - 180), 4 * 60));

  protected readonly hero = computed<Hero>(() => {
    if (this.session()) {
      return 'sleeping';
    }
    if (this.sleep.count() === 0) {
      return 'welcome';
    }
    if (this.isEvening()) {
      return 'bedtime';
    }
    return this.lastNight() ? 'summary' : 'log';
  });

  /** The running timer drawn on the dial: bedtime to now. */
  protected readonly sessionDial = computed(() => {
    const s = this.session();
    if (!s) {
      return null;
    }
    const start = new Date(s.start);
    const minutes = Math.max(0, (this.now().getTime() - s.start) / MINUTE_MS);
    return {
      bed: minuteOfDay(start),
      // Keep the arc visible (5 min minimum) in the first moments after starting.
      wake: wrapMinutes(minuteOfDay(start) + Math.max(5, Math.round(minutes))),
      since: fmtClock(start),
      elapsed: fmtDuration(minutes),
    };
  });

  protected readonly lastNightView = computed(() => {
    const n = this.lastNight();
    if (!n) {
      return null;
    }
    const goal = this.settings().goalMin;
    const diff = n.durationMin - goal;
    return {
      entry: n,
      bed: minuteOfDay(n.start),
      wake: minuteOfDay(n.end),
      range: `${fmtClock(n.start)} → ${fmtClock(n.end)}`,
      goalText: Math.abs(diff) < 5 ? `Right on your ${fmtDuration(goal)} goal`
        : diff > 0 ? `${fmtDuration(diff)} more than your goal` : `${fmtDuration(-diff)} short of your goal`,
      met: diff >= -5,
      quality: n.quality ? QUALITY_LABELS[n.quality] : null,
    };
  });

  protected readonly week = computed(() => durationSeries(this.sleep.overnight(), 7, this.now()));
  protected readonly weekLine = computed(() => {
    const stats = rangeStats(nightsInRange(this.sleep.overnight(), 7, this.now()), [], this.settings().goalMin);
    if (!stats.nights || stats.avgMin === null) {
      return null;
    }
    return `Averaging ${fmtDuration(stats.avgMin)} · goal met ${stats.goalMet} of ${stats.nights} night${stats.nights === 1 ? '' : 's'}`;
  });

  protected readonly next = this.reminders.next;
  protected readonly nextLine = computed(() => {
    const r = this.next();
    if (!r) {
      return null;
    }
    const day = dateKey(r.at) === this.todayKey() ? '' : `${r.at.toLocaleDateString('en-US', { weekday: 'short' })} `;
    const what = r.kind === 'checkin' ? 'Check-in' : r.kind === 'morning' ? 'Sleep log' : 'Wind-down';
    return `${what} at ${day}${fmtClock(r.at)}`;
  });

  protected readonly fmtClock = fmtClock;
  protected readonly labels = StanfordSleepinessData.ShortLabels;

  protected openTrends(): void {
    void this.router.navigateByUrl('/tabs/trends');
  }

  protected async loadSample(): Promise<void> {
    const added = await this.sleep.loadSample();
    this.feedback.haptic('success');
    await this.feedback.toast(`Added 3 weeks of sample data (${added.length} entries)`, {
      icon: 'flask-outline',
      undo: () => this.sleep.removeMany(added),
    });
  }

  /** One tap to start experience-sampling reminders (permission is asked only now). */
  protected async turnOnReminders(): Promise<void> {
    const ok = await this.reminders.turnOn('checkins');
    if (ok) {
      const times = this.settings().checkins.times.map(t => fmtClock(t)).join(', ');
      await this.feedback.toast(`Check-in reminders on: ${times}. Change them in Settings.`, { icon: 'notifications' });
    }
  }
}
