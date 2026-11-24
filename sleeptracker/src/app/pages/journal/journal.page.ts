import { Component, computed, inject, signal } from '@angular/core';
import {
  IonButton,
  IonButtons,
  IonContent,
  IonHeader,
  IonIcon,
  IonItem,
  IonItemOption,
  IonItemOptions,
  IonItemSliding,
  IonLabel,
  IonList,
  IonListHeader,
  IonSegment,
  IonSegmentButton,
  IonTitle,
  IonToolbar,
} from '@ionic/angular/standalone';
import { EntryItemComponent } from '../../components/entry-item/entry-item.component';
import { OvernightSleepData } from '../../data/overnight-sleep-data';
import { SleepData } from '../../data/sleep-data';
import { StanfordSleepinessData } from '../../data/stanford-sleepiness-data';
import { ClockService } from '../../services/clock.service';
import { FeedbackService } from '../../services/feedback.service';
import { LogFlowService } from '../../services/log-flow.service';
import { SleepService } from '../../services/sleep.service';
import { DateKey, dateKey, fmtClock, fmtDay, fmtWeekday } from '../../utils/time';

type Filter = 'all' | 'sleep' | 'sleepiness';

interface DayGroup {
  key: DateKey;
  label: string;
  summary: string;
  entries: SleepData[];
}

/** Everything logged, newest first, grouped by day. A night is filed under the morning it ended. */
@Component({
  selector: 'app-journal',
  templateUrl: './journal.page.html',
  styleUrls: ['./journal.page.scss'],
  imports: [
    IonHeader, IonToolbar, IonTitle, IonButtons, IonButton, IonIcon, IonContent, IonSegment, IonSegmentButton,
    IonLabel, IonList, IonListHeader, IonItem, IonItemSliding, IonItemOptions, IonItemOption, EntryItemComponent,
  ],
})
export class JournalPage {
  private readonly sleep = inject(SleepService);
  private readonly clock = inject(ClockService);
  private readonly feedback = inject(FeedbackService);
  protected readonly flow = inject(LogFlowService);

  protected readonly filter = signal<Filter>('all');

  protected readonly groups = computed<DayGroup[]>(() => {
    const filter = this.filter();
    const today = this.clock.now();
    const byDay = new Map<DateKey, SleepData[]>();
    for (const entry of this.sleep.all()) {
      const isNight = entry instanceof OvernightSleepData;
      if ((filter === 'sleep' && !isNight) || (filter === 'sleepiness' && isNight)) {
        continue;
      }
      const key = dateKey(entry.timestamp);
      byDay.set(key, [...(byDay.get(key) ?? []), entry]);
    }
    return [...byDay].map(([key, entries]) => {
      const night = entries.find((e): e is OvernightSleepData => e instanceof OvernightSleepData);
      const checkins = entries.filter(e => e instanceof StanfordSleepinessData).length;
      const parts = [
        ...(night ? [`${night.durationString()} sleep`] : []),
        ...(checkins ? [`${checkins} check-in${checkins === 1 ? '' : 's'}`] : []),
      ];
      return { key, label: fmtDay(key, today), summary: parts.join(' · '), entries };
    });
  });

  protected readonly empty = computed(() => {
    switch (this.filter()) {
      case 'sleep':
        return {
          title: 'No nights logged yet',
          text: 'Log last night in the morning, or start the sleep timer at bedtime.',
          button: 'Log a night',
        };
      case 'sleepiness':
        return {
          title: 'No check-ins yet',
          text: 'Rate how sleepy you feel a few times a day. The 1–7 buttons on Today take one tap.',
          button: 'Log a check-in',
        };
      default:
        return { title: 'Your journal is empty', text: 'Everything you log shows up here, newest first.', button: 'Log something' };
    }
  });

  protected setFilter(value: unknown): void {
    if (value === 'all' || value === 'sleep' || value === 'sleepiness') {
      this.filter.set(value);
      this.feedback.haptic();
    }
  }

  protected edit(entry: SleepData): void {
    if (entry instanceof OvernightSleepData) {
      void this.flow.openOvernight({ entry });
    } else if (entry instanceof StanfordSleepinessData) {
      void this.flow.openSleepiness({ entry });
    }
  }

  protected async remove(entry: SleepData, sliding: IonItemSliding): Promise<void> {
    await sliding.close();
    await this.flow.remove(entry);
  }

  protected newLog(): void {
    const filter = this.filter();
    if (filter === 'sleep') {
      void this.flow.openOvernight();
    } else if (filter === 'sleepiness') {
      void this.flow.openSleepiness();
    } else {
      void this.flow.chooseLog();
    }
  }

  /** What a screen reader hears for a row, with the time so two check-ins on one day don't sound alike. */
  protected rowLabel(entry: SleepData): string {
    if (entry instanceof OvernightSleepData) {
      return `Edit sleep, ${fmtWeekday(entry.start)} ${fmtClock(entry.start)} to ${fmtClock(entry.end)}: ${entry.durationString()}`;
    }
    if (entry instanceof StanfordSleepinessData) {
      return `Edit check-in at ${fmtClock(entry.loggedAt)}: ${entry.value}, ${entry.shortLabel}`;
    }
    return entry.summaryString();
  }
}
