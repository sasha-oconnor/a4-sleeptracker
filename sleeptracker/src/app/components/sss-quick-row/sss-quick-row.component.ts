import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { StanfordSleepinessData } from '../../data/stanford-sleepiness-data';

/**
 * The fastest way to log sleepiness: seven buttons, one tap each. Every button's accessible name
 * carries the full official description. Today confirms the tap below the row, with Undo.
 */
@Component({
  selector: 'app-sss-quick-row',
  template: `
    <div class="row" role="group" aria-label="Log how sleepy you feel right now">
      @for (n of levels; track n) {
        <button type="button" class="level-badge level-badge--button" [class]="'level-' + n" [class.picked]="selected() === n"
          [attr.aria-label]="'Log ' + n + ': ' + descriptions[n]" (click)="picked.emit(n)">{{ n }}</button>
      }
    </div>
    <div class="anchors" aria-hidden="true">
      <span>{{ labels[1] }}</span>
      <span class="anchors__mid">{{ labels[4] }}</span>
      <span class="anchors__end">{{ labels[7] }}</span>
    </div>
  `,
  styles: `
    .row {
      display: grid;
      grid-template-columns: repeat(7, 1fr);
      gap: 2px;
    }
    .row button {
      position: relative;
      justify-self: center;
      width: 100%;
      max-width: 46px;
      height: auto;
      aspect-ratio: 1;
    }
    /* The level just logged wears an inner ring while Today shows its confirmation. */
    .row .picked::after {
      content: '';
      position: absolute;
      inset: 4px;
      border: 2px solid currentColor;
      border-radius: 50%;
      pointer-events: none;
    }
    /* Labels under 1, 4 and 7, so the middle of the scale has words too. */
    .anchors {
      display: grid;
      grid-template-columns: 1fr auto 1fr;
      gap: 8px;
      margin-top: 8px;
      color: var(--drift-ink-muted);
      font-size: 13px;
    }
    .anchors__mid {
      text-align: center;
    }
    .anchors__end {
      text-align: end;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SssQuickRowComponent {
  /** The level just logged, marked with a ring. */
  readonly selected = input<number | null>(null);
  readonly picked = output<number>();
  protected readonly levels = StanfordSleepinessData.Levels;
  protected readonly descriptions = StanfordSleepinessData.ScaleValues;
  protected readonly labels = StanfordSleepinessData.ShortLabels;
}
