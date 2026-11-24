import { Component, computed, inject, signal } from '@angular/core';
import {
  IonButton,
  IonButtons,
  IonContent,
  IonHeader,
  IonIcon,
  IonItem,
  IonLabel,
  IonList,
  IonNote,
  IonSegment,
  IonSegmentButton,
  IonTitle,
  IonToolbar,
} from '@ionic/angular/standalone';
import { DurationChartComponent } from '../../components/duration-chart/duration-chart.component';
import { SleepinessChartComponent } from '../../components/sleepiness-chart/sleepiness-chart.component';
import { QUALITY_LABELS } from '../../data/catalog';
import { StanfordSleepinessData } from '../../data/stanford-sleepiness-data';
import { ClockService } from '../../services/clock.service';
import { FeedbackService } from '../../services/feedback.service';
import { LogFlowService } from '../../services/log-flow.service';
import { SettingsService } from '../../services/settings.service';
import { ShareService } from '../../services/share.service';
import { SleepService } from '../../services/sleep.service';
import {
  checkinsInRange,
  durationSeries,
  nightsInRange,
  rangeStats,
  shareText,
  sleepInsight,
  sleepinessByTime,
} from '../../utils/stats';
import { fmtClock, fmtDuration } from '../../utils/time';

type Range = 7 | 30;

/** How sleep and sleepiness look over the last week or month, and how they relate. */
@Component({
  selector: 'app-trends',
  templateUrl: './trends.page.html',
  styleUrls: ['./trends.page.scss'],
  imports: [
    IonHeader, IonToolbar, IonTitle, IonButtons, IonButton, IonIcon, IonContent, IonSegment, IonSegmentButton,
    IonLabel, IonList, IonItem, IonNote, DurationChartComponent, SleepinessChartComponent,
  ],
})
export class TrendsPage {
  private readonly sleep = inject(SleepService);
  private readonly settingsService = inject(SettingsService);
  private readonly clock = inject(ClockService);
  private readonly shareService = inject(ShareService);
  private readonly feedback = inject(FeedbackService);
  protected readonly flow = inject(LogFlowService);

  protected readonly range = signal<Range>(7);
  protected readonly goalMin = computed(() => this.settingsService.settings().goalMin);

  protected readonly nights = computed(() => nightsInRange(this.sleep.overnight(), this.range(), this.clock.now()));
  protected readonly checkins = computed(() => checkinsInRange(this.sleep.sleepiness(), this.range(), this.clock.now()));
  protected readonly stats = computed(() => rangeStats(this.nights(), this.checkins(), this.goalMin()));
  protected readonly series = computed(() => durationSeries(this.sleep.overnight(), this.range(), this.clock.now()));
  protected readonly buckets = computed(() => sleepinessByTime(this.checkins()));
  protected readonly insight = computed(() => sleepInsight(this.nights(), this.checkins(), this.goalMin()));
  protected readonly isEmpty = computed(() => !this.nights().length && !this.checkins().length);

  /** The headline, as a sentence rather than a big number. */
  protected readonly sleepLead = computed(() => {
    const s = this.stats();
    if (s.avgMin === null) {
      return 'No nights logged in this period yet.';
    }
    const diff = Math.round(s.avgMin - this.goalMin());
    const vsGoal = Math.abs(diff) < 5 ? 'right on your goal'
      : diff > 0 ? `${fmtDuration(diff)} more than your ${fmtDuration(this.goalMin())} goal`
      : `${fmtDuration(-diff)} short of your ${fmtDuration(this.goalMin())} goal`;
    return `You averaged ${fmtDuration(s.avgMin)} a night, ${vsGoal}.`;
  });

  protected readonly sleepinessLead = computed(() => {
    const withData = this.buckets().filter(b => b.mean !== null);
    if (!withData.length) {
      return 'No check-ins in this period yet.';
    }
    if (withData.length === 1) {
      return `So far you’ve only checked in ${withData[0].longLabel}. Check in at different times to see your daily rhythm.`;
    }
    const alert = withData.reduce((m, b) => (b.mean! < m.mean! ? b : m));
    const sleepy = withData.reduce((m, b) => (b.mean! > m.mean! ? b : m));
    return `You’re most alert ${alert.longLabel} and sleepiest ${sleepy.longLabel}.`;
  });

  protected readonly insightView = computed(() => {
    const i = this.insight();
    if (!i) {
      return null;
    }
    const longName = `${fmtDuration(i.thresholdMin)}+ nights`;
    const goal = fmtDuration(this.goalMin());
    const delta = i.shortMean - i.longMean;
    const sentence = Math.abs(delta) < 0.3
      ? 'So far your sleepiness is about the same after longer and shorter nights.'
      : delta > 0
        ? `After nights of ${fmtDuration(i.thresholdMin)} or more, you felt ${delta.toFixed(1)} points more alert the next day.`
        : `Interesting: you felt ${(-delta).toFixed(1)} points sleepier after longer nights. Oversleeping can do that.`;
    return {
      sentence,
      // Say so when the split isn't the goal, so a 7h 55m night counting as "longer" makes sense.
      note: i.usedGoal ? null
        : `Not enough ${goal}+ nights yet, so this compares your longer (${fmtDuration(i.thresholdMin)}+) and shorter nights.`,
      rows: [
        { label: longName, value: i.longMean, days: i.longDays },
        { label: i.usedGoal ? `Under ${goal}` : 'Shorter nights', value: i.shortMean, days: i.shortDays },
      ].map(r => ({ ...r, width: ((r.value - 1) / 6) * 100, text: r.value.toFixed(1) })),
    };
  });

  /** Before there's enough to compare: say what's missing and how far along they are. */
  protected readonly insightWaiting = computed(() => {
    const mornings = new Set(this.nights().map(n => n.morningKey));
    const days = new Set(this.checkins().map(c => c.dayKey).filter(d => mornings.has(d))).size;
    const sofar = days === 1 ? 'You have 1 so far.' : `You have ${days} so far.`;
    return `This needs about 4 days that have both a logged night and a check-in, some after longer nights and some ` +
      `after shorter ones. ${sofar}`;
  });

  protected readonly rows = computed(() => {
    const s = this.stats();
    const dash = '–';
    return [
      { label: 'Average sleep', value: s.avgMin === null ? dash : fmtDuration(s.avgMin) },
      { label: 'Typical bedtime', value: s.avgBed === null ? dash : fmtClock(s.avgBed) },
      { label: 'Typical wake-up', value: s.avgWake === null ? dash : fmtClock(s.avgWake) },
      { label: 'Nights at goal', value: s.nights ? `${s.goalMet} of ${s.nights}` : dash },
      { label: 'Total short of goal', value: s.nights ? fmtDuration(s.debtMin) : dash },
      {
        label: 'Felt rested',
        value: s.avgQuality === null ? dash : `${s.avgQuality.toFixed(1)} / 5 · ${QUALITY_LABELS[Math.round(s.avgQuality)]}`,
      },
    ];
  });

  protected readonly checkinRows = computed(() => {
    const s = this.stats();
    const avg = s.avgSleepiness;
    return [
      { label: 'Check-ins', value: String(s.checkins) },
      {
        label: 'Average',
        value: avg === null ? '–' : `${avg.toFixed(1)} / 7 · ${StanfordSleepinessData.ShortLabels[Math.round(avg)]}`,
      },
    ];
  });

  protected setRange(value: unknown): void {
    const n = Number(value);
    if (n === 7 || n === 30) {
      this.range.set(n);
      this.feedback.haptic();
    }
  }

  protected async share(): Promise<void> {
    const text = shareText(this.stats(), this.range(), this.goalMin());
    const outcome = await this.shareService.share('My sleep with Drift', text);
    if (outcome === 'copied') {
      await this.feedback.toast('Paste it into a message.', { header: 'Summary copied' });
    } else if (outcome === 'failed') {
      await this.feedback.toast('Couldn’t share from this browser.', { icon: 'warning' });
    }
  }
}
