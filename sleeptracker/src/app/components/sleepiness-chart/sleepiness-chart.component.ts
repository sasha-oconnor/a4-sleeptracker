import { ChangeDetectionStrategy, Component, computed, input, signal } from '@angular/core';
import { StanfordSleepinessData } from '../../data/stanford-sleepiness-data';
import { TimeBucket } from '../../utils/stats';

const W = 340;
const H = 178;
const LEFT = 26;
const RIGHT = 8;
const TOP = 20;
const AXIS = 24;
const BAR_MAX = 24;

/**
 * Average Stanford Sleepiness Scale rating in each 3-hour window of the day. Columns rise from 1
 * (the scale's floor, "wide awake"), so a taller column means sleepier. One series in one color;
 * only the sleepiest and most alert windows get a direct label, the rest are a tap away.
 */
@Component({
  selector: 'app-sleepiness-chart',
  templateUrl: './sleepiness-chart.component.html',
  styleUrls: ['./sleepiness-chart.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SleepinessChartComponent {
  readonly buckets = input.required<TimeBucket[]>();

  protected readonly active = signal<number | null>(null);
  protected readonly width = W;
  protected readonly height = H;
  protected readonly left = LEFT;
  protected readonly right = RIGHT;
  protected readonly plotBottom = H - AXIS;
  protected readonly ticks = [1, 4, 7].map(v => ({ v, y: this.y(v) }));

  protected readonly slot = computed(() => (W - LEFT - RIGHT) / Math.max(1, this.buckets().length));

  protected readonly cols = computed(() => {
    const buckets = this.buckets();
    const slot = this.slot();
    const width = Math.min(BAR_MAX, slot - 2);
    const withData = buckets.filter(b => b.mean !== null);
    const max = withData.reduce<TimeBucket | null>((m, b) => (!m || b.mean! > m.mean! ? b : m), null);
    const min = withData.reduce<TimeBucket | null>((m, b) => (!m || b.mean! < m.mean! ? b : m), null);
    return buckets.map((bucket, index) => {
      const cx = LEFT + slot * index + slot / 2;
      const top = bucket.mean === null ? this.plotBottom : this.y(bucket.mean);
      return {
        index,
        bucket,
        cx,
        path: bucket.mean === null ? '' : columnPath(cx - width / 2, top, width, this.plotBottom),
        labelY: top - 6,
        // Direct-label only the extremes, and only when they differ.
        showLabel: bucket.mean !== null && withData.length > 1 && (bucket === max || bucket === min) && max !== min,
        value: bucket.mean === null ? '' : bucket.mean.toFixed(1),
      };
    });
  });

  protected readonly summary = computed(() => {
    const withData = this.buckets().filter(b => b.mean !== null);
    if (!withData.length) {
      return 'No check-ins in this period.';
    }
    const sleepiest = withData.reduce((m, b) => (b.mean! > m.mean! ? b : m));
    const alertest = withData.reduce((m, b) => (b.mean! < m.mean! ? b : m));
    return `Average sleepiness by time of day, 1 is wide awake and 7 is dozing off. Most alert ${alertest.longLabel} (${alertest.mean!.toFixed(1)}); sleepiest ${sleepiest.longLabel} (${sleepiest.mean!.toFixed(1)}).`;
  });

  protected readonly tooltip = computed(() => {
    const i = this.active();
    const col = i === null ? undefined : this.cols()[i];
    if (!col) {
      return null;
    }
    const { mean, n, longLabel } = col.bucket;
    const level = mean === null ? null : Math.round(mean);
    return {
      left: Math.min(84, Math.max(16, (col.cx / W) * 100)),
      value: mean === null ? 'No check-ins' : `${mean.toFixed(1)} · ${StanfordSleepinessData.ShortLabels[level!]}`,
      detail: mean === null ? longLabel : `${longLabel} · ${n} check-in${n === 1 ? '' : 's'}`,
    };
  });

  protected show(index: number): void {
    this.active.set(index);
  }

  protected hide(): void {
    this.active.set(null);
  }

  protected onFocus(): void {
    if (this.active() === null) {
      this.active.set(0);
    }
  }

  protected onKey(event: KeyboardEvent): void {
    const count = this.buckets().length;
    const current = this.active() ?? 0;
    const next = event.key === 'ArrowLeft' ? current - 1 : event.key === 'ArrowRight' ? current + 1 : null;
    if (next === null) {
      return;
    }
    event.preventDefault();
    this.active.set(Math.min(count - 1, Math.max(0, next)));
  }

  private y(value: number): number {
    return this.plotBottom - ((value - 1) / 6) * (this.plotBottom - TOP);
  }
}

function columnPath(x: number, top: number, width: number, base: number): string {
  const h = base - top;
  const r = Math.min(4, width / 2, h);
  const f = (n: number) => +n.toFixed(2);
  if (h <= 0.5) {
    // A 1.0 average: draw a sliver on the floor so the window still reads as "logged".
    return `M${f(x)} ${f(base)}V${f(base - 2)}H${f(x + width)}V${f(base)}Z`;
  }
  return `M${f(x)} ${f(base)}V${f(top + r)}A${f(r)} ${f(r)} 0 0 1 ${f(x + r)} ${f(top)}H${f(x + width - r)}A${f(r)} ${f(r)} 0 0 1 ${f(x + width)} ${f(top + r)}V${f(base)}Z`;
}
