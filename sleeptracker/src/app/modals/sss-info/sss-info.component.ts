import { Component } from '@angular/core';
import { IonButton, IonButtons, IonContent, IonHeader, IonItem, IonList, IonTitle, IonToolbar } from '@ionic/angular/standalone';
import { StanfordSleepinessData } from '../../data/stanford-sleepiness-data';

/** A reference sheet explaining the Stanford Sleepiness Scale. */
@Component({
  selector: 'app-sss-info',
  templateUrl: './sss-info.component.html',
  styleUrls: ['./sss-info.component.scss'],
  imports: [IonHeader, IonToolbar, IonTitle, IonButtons, IonButton, IonContent, IonList, IonItem],
})
export class SssInfoComponent {
  /** Set by Ionic's ModalController. */
  modal!: HTMLIonModalElement;

  protected readonly levels = StanfordSleepinessData.Levels;
  protected readonly labels = StanfordSleepinessData.ShortLabels;
  protected readonly descriptions = StanfordSleepinessData.ScaleValues;

  protected close(): void {
    void this.modal.dismiss();
  }
}
