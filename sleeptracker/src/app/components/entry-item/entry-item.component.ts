import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { IonIcon } from '@ionic/angular/standalone';
import { QUALITY_LABELS, tagLabel } from '../../data/catalog';
import { OvernightSleepData } from '../../data/overnight-sleep-data';
import { SleepData } from '../../data/sleep-data';
import { StanfordSleepinessData } from '../../data/stanford-sleepiness-data';
import { fmtClock, fmtWeekday } from '../../utils/time';

/** One row in the Journal: a night (moon) or a sleepiness check-in (numbered level badge). */
@Component({
  selector: 'app-entry-item',
  template: `
    @if (night(); as n) {
      <span class="icon-badge" aria-hidden="true"><ion-icon name="moon"></ion-icon></span>
      <span class="body">
        <span class="title">
          <span class="main">{{ n.durationString() }}</span>
          <span class="sub tabular">{{ fmtWeekday(n.start) }} {{ fmtClock(n.start) }} – {{ fmtClock(n.end) }}</span>
        </span>
        @if (details()) {
          <span class="meta">{{ details() }}</span>
        }
      </span>
    } @else {
      @if (checkin(); as c) {
        <span class="level-badge" [class]="'level-' + c.value" aria-hidden="true">{{ c.value }}</span>
        <span class="body">
          <span class="title">
            <span class="main">{{ c.shortLabel }}</span>
            <span class="sub tabular">{{ fmtClock(c.loggedAt) }}</span>
          </span>
          <span class="meta">{{ details() || c.description }}</span>
        </span>
      }
    }
  `,
  styleUrls: ['./entry-item.component.scss'],
  imports: [IonIcon],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EntryItemComponent {
  readonly entry = input.required<SleepData>();

  protected readonly night = computed(() => {
    const e = this.entry();
    return e instanceof OvernightSleepData ? e : null;
  });
  protected readonly checkin = computed(() => {
    const e = this.entry();
    return e instanceof StanfordSleepinessData ? e : null;
  });

  /** Quality, tags and notes in one quiet line, e.g. "Good · Late caffeine · Exam stress". */
  protected readonly details = computed(() => {
    const e = this.entry();
    const parts: string[] = [];
    if (e instanceof OvernightSleepData && e.quality) {
      parts.push(`Felt ${QUALITY_LABELS[e.quality]?.toLowerCase()}`);
    }
    parts.push(...e.tags.map(tagLabel));
    if (e.notes) {
      parts.push(`“${e.notes}”`);
    }
    return parts.join(' · ');
  });

  protected readonly fmtClock = fmtClock;
  protected readonly fmtWeekday = fmtWeekday;
}
