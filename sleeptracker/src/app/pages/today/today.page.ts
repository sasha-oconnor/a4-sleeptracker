import { Component, DestroyRef, computed, inject, signal } from '@angular/core';
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
  addDays,
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
  /**
   * The morning "last night" ends on. Before 4 AM the night in progress hasn't ended yet, so last night
   * is the one that ended yesterday morning (a student up at 1 AM still means yesterday's night).
   */
  protected readonly logKey = computed(() =>
    minuteOfDay(this.now()) < 4 * 60 ? dateKey(addDays(this.now(), -1)) : this.todayKey());
  protected readonly lastNight = computed(() => this.sleep.nightFor(this.logKey()));
  /** Today's check-ins, newest first, so the one just logged is at the top. */
  protected readonly todaysCheckins = computed(() => [...this.sleep.checkinsOn(this.todayKey())].reverse());
  /** Today shows the latest few; "Show all" opens the rest in place. */
  protected readonly checkinPreview = 3;
  protected readonly showAllCheckins = signal(false);
  protected readonly visibleCheckins = computed(() =>
    this.showAllCheckins() ? this.todaysCheckins() : this.todaysCheckins().slice(0, this.checkinPreview));
  /** "1 check-in, 4" or "11 check-ins, average 3.5". */
  protected readonly checkinSummary = computed(() => {
    const list = this.todaysCheckins();
    if (list.length === 1) {
      return `1 check-in, ${list[0].value}`;
    }
    const avg = list.reduce((sum, c) => sum + c.value, 0) / list.length;
    return `${list.length} check-ins, average ${Number.isInteger(avg) ? avg : avg.toFixed(1)}`;
  });

  /**
   * The last one-tap check-in. The 1–7 card confirms it in place, with Undo and "Add context", then
   * folds away after a few seconds; pointing at or focusing the confirmation keeps it open.
   */
  private readonly recentId = signal<string | null>(null);
  protected readonly recent = computed(() => {
    const id = this.recentId();
    return id ? this.sleep.sleepiness().find(e => e.id === id) ?? null : null;
  });
  private readonly recentShown = signal(false);
  /** Also closes if the check-in is deleted some other way (e.g. from its chip). */
  protected readonly confirmOpen = computed(() => this.recentShown() && !!this.recent());
  /** What a screen reader hears after a tap, since the confirmation itself is visual. */
  protected readonly announcement = signal('');
  private closeTimer?: ReturnType<typeof setTimeout>;

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
      // Keep the arc visible (5 min minimum) in the first moments after starting. The dial's center
      // shows the real time asleep (elapsedMin), not this padded arc.
      wake: wrapMinutes(minuteOfDay(start) + Math.max(5, Math.round(minutes))),
      since: fmtClock(start),
      elapsedMin: minutes,
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

  /** "10 AM, 2 PM and 7 PM" for the reminder row. */
  protected readonly checkinTimesText = computed(() => {
    const times = this.settings().checkins.times.map(t => fmtClock(t).replace(':00', ''));
    return times.length > 1 ? `${times.slice(0, -1).join(', ')} and ${times[times.length - 1]}` : times.join('');
  });

  protected readonly fmtClock = fmtClock;
  protected readonly labels = StanfordSleepinessData.ShortLabels;

  constructor() {
    inject(DestroyRef).onDestroy(() => clearTimeout(this.closeTimer));
  }

  protected async checkIn(value: number): Promise<void> {
    const entry = await this.flow.quickCheckin(value);
    this.recentId.set(entry.id);
    this.recentShown.set(true);
    this.announce(`Logged ${value}, ${this.labels[value]}.`);
    this.closeSoon();
  }

  /** "What's 1–7?": tapping a level in the scale sheet logs it the same way as the row. */
  protected async explainScale(): Promise<void> {
    const level = await this.flow.showScaleInfo({ canLog: true });
    if (level !== null) {
      await this.checkIn(level);
    }
  }

  protected closeSoon(): void {
    clearTimeout(this.closeTimer);
    this.closeTimer = setTimeout(() => this.recentShown.set(false), 8000);
  }

  protected holdOpen(): void {
    clearTimeout(this.closeTimer);
  }

  protected async undoRecent(): Promise<void> {
    const entry = this.recent();
    this.closeNow();
    if (entry) {
      await this.sleep.remove(entry);
      this.feedback.haptic('warning');
      this.announce('Check-in removed.');
    }
  }

  protected addContext(): void {
    const entry = this.recent();
    this.closeNow();
    if (entry) {
      void this.flow.openSleepiness({ entry, focus: 'details' });
    }
  }

  private closeNow(): void {
    clearTimeout(this.closeTimer);
    this.recentShown.set(false);
  }

  /** Clears first, so logging the same level twice is still read out twice. */
  private announce(text: string): void {
    this.announcement.set('');
    setTimeout(() => this.announcement.set(text), 100);
  }

  protected openTrends(): void {
    void this.router.navigateByUrl('/tabs/trends');
  }

  /** One tap to start experience-sampling reminders (permission is asked only now). */
  protected async turnOnReminders(): Promise<void> {
    const ok = await this.reminders.turnOn('checkins');
    if (ok) {
      const times = this.settings().checkins.times.map(t => fmtClock(t)).join(', ');
      await this.feedback.toast(`${times}. Change them in Settings.`, {
        header: 'Check-in reminders on',
        icon: 'notifications',
      });
    }
  }
}
