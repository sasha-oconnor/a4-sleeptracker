import { ChangeDetectionStrategy, Component, ElementRef, computed, input, model, output, signal, viewChild } from '@angular/core';
import { MINUTES_PER_DAY, fmtClock, fmtDuration, fmtDurationLong, wrapMinutes } from '../../utils/time';

type Handle = 'bed' | 'wake';

/** Geometry of the dial, in SVG user units. */
const SIZE = 300;
const CENTER = SIZE / 2;
const RADIUS = 112;
const SNAP = 5;

/**
 * A 24-hour clock face (midnight at the top, noon at the bottom) showing a night as an arc from
 * bedtime (moon) to wake-up (sun), like the bedtime dial in Apple's Clock and Health apps.
 *
 * Interactive mode: drag either handle (snaps to 5 minutes), or focus one and use the arrow keys.
 * The arc can never run backwards, which makes an impossible night impossible to enter.
 * Static mode: the same picture, used to show last night on the Today screen.
 */
@Component({
  selector: 'app-sleep-dial',
  templateUrl: './sleep-dial.component.html',
  styleUrls: ['./sleep-dial.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '(window:blur)': 'cancelDrag()' },
})
export class SleepDialComponent {

  /** Bedtime and wake-up, as minutes past midnight. Two-way bindable: [(bed)] / [(wake)]. */
  readonly bed = model.required<number>();
  readonly wake = model.required<number>();
  readonly goalMin = input(8 * 60);
  readonly interactive = input(true);
  /** Small static version (Today screen): no clock labels or goal text. */
  readonly compact = input(false);
  /** Latest allowed wake-up (minutes past midnight), e.g. "now" when logging this morning. */
  readonly wakeMax = input<number | null>(null);
  /** The form has an error: draw the arc in red and drop the goal text. */
  readonly invalid = input(false);
  /** Emits when the person finishes a drag or key press (for haptics). */
  readonly committed = output<Handle>();

  private readonly svg = viewChild.required<ElementRef<SVGSVGElement>>('svg');
  protected readonly dragging = signal<Handle | null>(null);

  protected readonly size = SIZE;
  protected readonly center = CENTER;
  protected readonly radius = RADIUS;

  protected readonly durationMin = computed(() => {
    const span = wrapMinutes(this.wake() - this.bed());
    return span === 0 ? 0 : span;
  });
  protected readonly durationText = computed(() => fmtDuration(this.durationMin()));
  protected readonly metGoal = computed(() => this.durationMin() >= this.goalMin());
  protected readonly goalText = computed(() => {
    const diff = this.durationMin() - this.goalMin();
    if (Math.abs(diff) < 5) {
      return 'right on your goal';
    }
    return diff > 0 ? `${fmtDuration(diff)} over goal` : `${fmtDuration(-diff)} under goal`;
  });

  protected readonly bedPoint = computed(() => this.point(this.bed()));
  protected readonly wakePoint = computed(() => this.point(this.wake()));

  /** The sleep arc, drawn clockwise from bedtime to wake-up. */
  protected readonly arcPath = computed(() => {
    const span = this.durationMin();
    if (span === 0) {
      return '';
    }
    const a = this.bedPoint();
    const b = this.wakePoint();
    const large = span > MINUTES_PER_DAY / 2 ? 1 : 0;
    return `M ${a.x} ${a.y} A ${RADIUS} ${RADIUS} 0 ${large} 1 ${b.x} ${b.y}`;
  });

  /** Hour ticks; the four quarter-day ticks are longer and labelled. */
  protected readonly ticks = Array.from({ length: 24 }, (_, h) => {
    const major = h % 6 === 0;
    const outer = this.polar(h * 60, RADIUS - 24);
    const inner = this.polar(h * 60, RADIUS - (major ? 34 : 29));
    return { x1: outer.x, y1: outer.y, x2: inner.x, y2: inner.y, major };
  });
  /** Midnight and noon are labelled; 6 AM and 6 PM get longer ticks (labels there would crowd the duration). */
  protected readonly labels = [
    { text: '12AM', ...this.polar(0, RADIUS - 48) },
    { text: '12PM', ...this.polar(720, RADIUS - 48) },
  ];

  protected readonly fmtClock = fmtClock;
  protected readonly ariaSummary = computed(() =>
    `Sleep from ${fmtClock(this.bed())} to ${fmtClock(this.wake())}: ${fmtDurationLong(this.durationMin())}.`);

  protected valueText(which: Handle): string {
    return `${which === 'bed' ? 'Bedtime' : 'Wake-up'} ${fmtClock(which === 'bed' ? this.bed() : this.wake())}`;
  }

  protected startDrag(event: PointerEvent, which: Handle): void {
    if (!this.interactive() || !event.isPrimary) {
      return;
    }
    event.preventDefault();
    (event.currentTarget as Element).setPointerCapture(event.pointerId);
    this.dragging.set(which);
  }

  protected moveDrag(event: PointerEvent): void {
    const which = this.dragging();
    if (!which) {
      return;
    }
    const minutes = this.minutesAt(event.clientX, event.clientY);
    if (minutes === null) {
      return;
    }
    const next = which === 'wake' ? this.limitWake(minutes) : minutes;
    // Keep the two handles from landing on the same spot (a zero-length night).
    const other = which === 'bed' ? this.wake() : this.bed();
    if (next === other) {
      return;
    }
    (which === 'bed' ? this.bed : this.wake).set(next);
  }

  protected endDrag(event: PointerEvent): void {
    const which = this.dragging();
    if (!which) {
      return;
    }
    (event.currentTarget as Element).releasePointerCapture?.(event.pointerId);
    this.dragging.set(null);
    this.committed.emit(which);
  }

  /** The window lost focus mid-drag (or capture was lost): end the drag cleanly. */
  protected cancelDrag(): void {
    const which = this.dragging();
    if (which) {
      this.dragging.set(null);
      this.committed.emit(which);
    }
  }

  /**
   * Touches that start on a handle belong to the handle: they must not scroll the sheet or start the
   * card modal's swipe-to-close. Touches anywhere else on the dial scroll as usual.
   */
  protected holdTouch(event: Event): void {
    if (this.interactive()) {
      event.stopPropagation();
      if (event.type === 'touchstart' && event.cancelable) {
        event.preventDefault();
      }
    }
  }

  /** Arrow keys nudge by 5 minutes (Shift for 30); Page Up/Down by an hour. */
  protected onKey(event: KeyboardEvent, which: Handle): void {
    if (!this.interactive()) {
      return;
    }
    const step =
      event.key === 'ArrowUp' || event.key === 'ArrowRight' ? 1 :
      event.key === 'ArrowDown' || event.key === 'ArrowLeft' ? -1 :
      event.key === 'PageUp' ? 12 :
      event.key === 'PageDown' ? -12 : 0;
    if (!step) {
      return;
    }
    event.preventDefault();
    const target = which === 'bed' ? this.bed : this.wake;
    const amount = step * (event.shiftKey ? 30 : SNAP);
    let next = wrapMinutes(Math.round((target() + amount) / SNAP) * SNAP);
    if (which === 'wake') {
      next = this.limitWake(next);
    }
    const other = which === 'bed' ? this.wake() : this.bed();
    target.set(next === other ? wrapMinutes(next + Math.sign(amount) * SNAP) : next);
    this.committed.emit(which);
  }

  /**
   * Keeps the wake-up from passing wakeMax. A position in the blocked stretch (after wakeMax, before
   * midnight) snaps to whichever end is closer, so the sun stops at "now" instead of jumping around.
   */
  private limitWake(minutes: number): number {
    const max = this.wakeMax();
    if (max === null || minutes <= max) {
      return minutes;
    }
    const limit = Math.floor(max / SNAP) * SNAP;
    return minutes - max <= MINUTES_PER_DAY - minutes ? limit : 0;
  }

  /** Converts a pointer position to minutes past midnight, snapped to 5 minutes. */
  private minutesAt(clientX: number, clientY: number): number | null {
    const svg = this.svg().nativeElement;
    const matrix = svg.getScreenCTM();
    if (!matrix) {
      return null;
    }
    const p = new DOMPoint(clientX, clientY).matrixTransform(matrix.inverse());
    const dx = p.x - CENTER;
    const dy = p.y - CENTER;
    if (Math.hypot(dx, dy) < 8) {
      return null;
    }
    // atan2(dx, -dy) is 0 at the top and grows clockwise, which is exactly a clock face.
    const angle = (Math.atan2(dx, -dy) + 2 * Math.PI) % (2 * Math.PI);
    return wrapMinutes(Math.round(((angle / (2 * Math.PI)) * MINUTES_PER_DAY) / SNAP) * SNAP);
  }

  private point(minutes: number): { x: number; y: number } {
    return this.polar(minutes, RADIUS);
  }

  private polar(minutes: number, r: number): { x: number; y: number } {
    const angle = (minutes / MINUTES_PER_DAY) * 2 * Math.PI;
    return {
      x: +(CENTER + r * Math.sin(angle)).toFixed(2),
      y: +(CENTER - r * Math.cos(angle)).toFixed(2),
    };
  }
}
