import { Component, input } from '@angular/core';
import { IonButton, IonButtons, IonContent, IonHeader, IonItem, IonList, IonTitle, IonToolbar } from '@ionic/angular/standalone';
import { StanfordSleepinessData } from '../../data/stanford-sleepiness-data';

/** A reference sheet explaining the Stanford Sleepiness Scale. Opened from Today, a tapped level logs it. */
@Component({
  selector: 'app-sss-info',
  templateUrl: './sss-info.component.html',
  styleUrls: ['./sss-info.component.scss'],
  imports: [IonHeader, IonToolbar, IonTitle, IonButtons, IonButton, IonContent, IonList, IonItem],
})
export class SssInfoComponent {
  /** Set by Ionic's ModalController. */
  modal!: HTMLIonModalElement;
  /** True when opened from the check-in row: tapping a level logs it (the caller shows the Undo toast). */
  readonly canLog = input(false);

  protected readonly levels = StanfordSleepinessData.Levels;
  protected readonly labels = StanfordSleepinessData.ShortLabels;
  protected readonly descriptions = StanfordSleepinessData.ScaleValues;

  protected close(): void {
    void this.modal.dismiss();
  }

  protected pick(level: number): void {
    if (this.canLog()) {
      void this.modal.dismiss(level, 'pick');
    }
  }
}
