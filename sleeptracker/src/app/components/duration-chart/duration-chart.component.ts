import { ChangeDetectionStrategy, Component, computed, input, signal } from '@angular/core';
import { NightPoint } from '../../utils/stats';
import { fmtDuration, fmtDurationLong, fmtShortDate } from '../../utils/time';

const W = 340;
const RIGHT = 44; // room for the goal label
const TOP = 18;
const AXIS = 22; // x-axis label band
const BAR_MAX = 24;
const GAP = 2;

interface Bar {
  index: number;
  point: NightPoint;
  x: number;
  cx: number;
  width: number;
  path: string;
  showLabel: boolean;
  label: string;
  labelY: number;
}

/**
 * Hours slept per night as columns, with the goal as a dashed threshold line.
 * One series, so one color and no legend; nights that weren't logged show as a small
 * dot on the baseline rather than a zero-height bar. Values are reachable by tapping/hovering
 * a column, by arrow keys when the chart has focus, and in a screen-reader table.
 */
@Component({
  selector: 'app-duration-chart',
  templateUrl: './duration-chart.component.html',
  styleUrls: ['./duration-chart.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DurationChartComponent {
  readonly series = input.required<NightPoint[]>();
  readonly goalMin = input(8 * 60);
  /** Smaller, label-light version for the Today screen. */
  readonly compact = input(false);

  protected readonly active = signal<number | null>(null);
  protected readonly width = W;
  protected readonly right = RIGHT;

  protected readonly left = computed(() => (this.compact() ? 4 : 30));
  protected readonly height = computed(() => (this.compact() ? 112 : 196));
  protected readonly plotBottom = computed(() => this.height() - AXIS);
  protected readonly plotWidth = computed(() => W - this.left() - RIGHT);

  /** Top of the scale: at least 10h, and always above the goal and the longest night. */
  protected readonly maxMin = computed(() => {
    const longest = Math.max(0, ...this.series().map(p => p.minutes ?? 0));
    return Math.max(10 * 60, Math.ceil((Math.max(longest, this.goalMin()) + 30) / 120) * 120);
  });

  protected readonly ticks = computed(() => {
    if (this.compact()) {
      return [];
    }
    const out: { y: number; label: string }[] = [];
    for (let m = 0; m <= this.maxMin(); m += 4 * 60) {
      out.push({ y: this.y(m), label: `${m / 60}h` });
    }
    return out;
  });

  protected readonly goalY = computed(() => this.y(this.goalMin()));
  protected readonly goalLabel = computed(() => fmtDuration(this.goalMin()));

  protected readonly slot = computed(() => this.plotWidth() / Math.max(1, this.series().length));

  protected readonly bars = computed<Bar[]>(() => {
    const points = this.series();
    const slot = this.slot();
    const width = Math.max(3, Math.min(BAR_MAX, slot - GAP));
    const base = this.plotBottom();
    const logged = points.filter(p => p.minutes !== null);
    const latest = [...points].reverse().find(p => p.minutes !== null);
    const longest = logged.reduce<NightPoint | null>((best, p) => (!best || (p.minutes ?? 0) > (best.minutes ?? 0) ? p : best), null);
    return points.map((point, index) => {
      const cx = this.left() + slot * index + slot / 2;
      const x = cx - width / 2;
      const top = point.minutes === null ? base : this.y(point.minutes);
      // Label sparingly: on the 7-day Trends chart, the latest and the longest night. The compact chart
      // on Today sits right under last night's summary, and month bars are too thin to carry labels.
      const showLabel = !this.compact() && points.length <= 7 && point.minutes !== null && (point === latest || point === longest);
      return {
        index,
        point,
        x,
        cx,
        width,
        path: point.minutes === null ? '' : columnPath(x, top, width, base),
        showLabel,
        label: point.minutes === null ? '' : fmtDuration(point.minutes),
        labelY: top - 6,
      };
    });
  });

  /** Axis labels: every day for a week, every fifth day (plus the last) for a month. */
  protected readonly axisLabels = computed(() => {
    const bars = this.bars();
    const every = bars.length <= 7 ? 1 : 5;
    return bars.filter((b, i) => i % every === 0 || i === bars.length - 1).map(b => ({ x: b.cx, text: b.point.label }));
  });

  protected readonly summary = computed(() => {
    const logged = this.series().filter(p => p.minutes !== null);
    if (!logged.length) {
      return 'No nights logged in this period.';
    }
    const met = logged.filter(p => (p.minutes ?? 0) >= this.goalMin()).length;
    return `Hours slept per night, ${logged.length} nights logged; ${met} reached the ${fmtDurationLong(this.goalMin())} goal.`;
  });

  protected readonly tooltip = computed(() => {
    const i = this.active();
    if (i === null) {
      return null;
    }
    const bar = this.bars()[i];
    if (!bar) {
      return null;
    }
    const minutes = bar.point.minutes;
    return {
      // Keep the tooltip inside the chart near the edges.
      left: Math.min(84, Math.max(16, (bar.cx / W) * 100)),
      value: minutes === null ? 'Not logged' : fmtDuration(minutes),
      detail: `Morning of ${fmtShortDate(bar.point.date)}`,
      spoken: `${fmtShortDate(bar.point.date)}: ${minutes === null ? 'not logged' : fmtDurationLong(minutes)}`,
    };
  });

  protected readonly fmtDurationLong = fmtDurationLong;
  protected readonly fmtShortDate = fmtShortDate;

  protected show(index: number): void {
    if (!this.compact()) {
      this.active.set(index);
    }
  }

  protected hide(): void {
    this.active.set(null);
  }

  /** Arrow keys step through nights while the chart has focus. */
  protected onKey(event: KeyboardEvent): void {
    const count = this.series().length;
    const current = this.active() ?? count - 1;
    const next = event.key === 'ArrowLeft' ? current - 1 : event.key === 'ArrowRight' ? current + 1 : null;
    if (next === null) {
      return;
    }
    event.preventDefault();
    this.active.set(Math.min(count - 1, Math.max(0, next)));
  }

  protected onFocus(): void {
    if (!this.compact() && this.active() === null) {
      this.active.set(this.series().length - 1);
    }
  }

  private y(minutes: number): number {
    const top = TOP;
    const bottom = this.plotBottom();
    return bottom - (Math.min(minutes, this.maxMin()) / this.maxMin()) * (bottom - top);
  }
}

/** A column with a 4px rounded data end and a square foot on the baseline. */
function columnPath(x: number, top: number, width: number, base: number): string {
  const h = base - top;
  const r = Math.min(4, width / 2, h);
  const f = (n: number) => +n.toFixed(2);
  return `M${f(x)} ${f(base)}V${f(top + r)}A${f(r)} ${f(r)} 0 0 1 ${f(x + r)} ${f(top)}H${f(x + width - r)}A${f(r)} ${f(r)} 0 0 1 ${f(x + width)} ${f(top + r)}V${f(base)}Z`;
}
