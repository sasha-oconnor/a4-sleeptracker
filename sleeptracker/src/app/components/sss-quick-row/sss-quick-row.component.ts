import { ChangeDetectionStrategy, Component, output } from '@angular/core';
import { StanfordSleepinessData } from '../../data/stanford-sleepiness-data';

/**
 * The fastest way to log sleepiness: seven buttons, one tap each. Every button's accessible name
 * carries the full official description, and the confirmation toast repeats it (with Undo).
 */
@Component({
  selector: 'app-sss-quick-row',
  template: `
    <div class="row" role="group" aria-label="Log how sleepy you feel right now">
      @for (n of levels; track n) {
        <button type="button" class="level-badge level-badge--button" [class]="'level-' + n"
          [attr.aria-label]="'Log ' + n + ': ' + descriptions[n]" (click)="picked.emit(n)">{{ n }}</button>
      }
    </div>
    <div class="anchors" aria-hidden="true">
      <span>Wide awake</span>
      <span>Dozing off</span>
    </div>
  `,
  styles: `
    .row {
      display: grid;
      grid-template-columns: repeat(7, 1fr);
      gap: 4px;
    }
    .row button {
      justify-self: center;
      width: 100%;
      max-width: 46px;
      height: auto;
      aspect-ratio: 1;
    }
    .anchors {
      display: flex;
      justify-content: space-between;
      margin-top: 8px;
      color: var(--drift-ink-muted);
      font-size: 13px;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SssQuickRowComponent {
  readonly picked = output<number>();
  protected readonly levels = StanfordSleepinessData.Levels;
  protected readonly descriptions = StanfordSleepinessData.ScaleValues;
}
