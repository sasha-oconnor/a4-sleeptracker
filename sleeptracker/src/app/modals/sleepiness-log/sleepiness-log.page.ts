import { Component, OnInit, computed, inject, input, signal } from '@angular/core';
import {
  ActionSheetController,
  IonButton,
  IonButtons,
  IonContent,
  IonDatetime,
  IonDatetimeButton,
  IonHeader,
  IonIcon,
  IonItem,
  IonLabel,
  IonList,
  IonModal,
  IonRadio,
  IonRadioGroup,
  IonTextarea,
  IonTitle,
  IonToolbar,
} from '@ionic/angular/standalone';
import { CHECKIN_TAGS } from '../../data/catalog';
import { StanfordSleepinessData } from '../../data/stanford-sleepiness-data';
import { ClockService } from '../../services/clock.service';
import { FeedbackService } from '../../services/feedback.service';
import { MINUTE_MS, fromLocalIso, toLocalIso } from '../../utils/time';

/** Log (or edit) one Stanford Sleepiness Scale rating, with optional context and notes. */
@Component({
  selector: 'app-sleepiness-log',
  templateUrl: './sleepiness-log.page.html',
  styleUrls: ['./sleepiness-log.page.scss'],
  imports: [
    IonHeader, IonToolbar, IonTitle, IonButtons, IonButton, IonContent, IonList, IonItem, IonLabel, IonIcon,
    IonRadioGroup, IonRadio, IonDatetime, IonDatetimeButton, IonModal, IonTextarea,
  ],
})
export class SleepinessLogPage implements OnInit {
  private static count = 0;
  protected readonly whenId = `drift-when-${++SleepinessLogPage.count}`;

  /** The check-in being edited, or null for a new one. */
  readonly entry = input<StanfordSleepinessData | null>(null);
  /** A level to preselect (e.g. from a quick check-in). */
  readonly value = input<number | null>(null);
  /** Set by Ionic's ModalController. */
  modal!: HTMLIonModalElement;

  private readonly clock = inject(ClockService);
  private readonly sheets = inject(ActionSheetController);
  private readonly feedback = inject(FeedbackService);

  protected readonly levels = StanfordSleepinessData.Levels;
  protected readonly labels = StanfordSleepinessData.ShortLabels;
  protected readonly descriptions = StanfordSleepinessData.ScaleValues;
  protected readonly tagOptions = CHECKIN_TAGS;

  protected readonly level = signal<number | null>(null);
  protected readonly when = signal(new Date());
  protected readonly tags = signal<string[]>([]);
  protected readonly notes = signal('');
  private initial = '';

  protected readonly whenIso = computed(() => toLocalIso(this.when()));
  protected readonly maxIso = computed(() => toLocalIso(this.clock.now()));
  protected readonly errors = computed(() =>
    this.when().getTime() > this.clock.now().getTime() + MINUTE_MS ? ['That time hasn’t happened yet.'] : []);
  protected readonly valid = computed(() => this.level() !== null && this.errors().length === 0);

  ngOnInit(): void {
    const entry = this.entry();
    if (entry) {
      this.level.set(entry.value);
      this.when.set(new Date(entry.loggedAt));
      this.tags.set([...entry.tags]);
      this.notes.set(entry.notes);
    } else {
      this.level.set(this.value());
      this.when.set(new Date());
    }
    this.initial = this.snapshot();
    this.modal.canDismiss = (_data?: unknown, role?: string) => this.confirmLeave(role);
  }

  protected pick(value: unknown): void {
    if (typeof value === 'number') {
      this.level.set(value);
      this.feedback.haptic();
    }
  }

  protected onWhen(value: string | string[] | null | undefined): void {
    if (typeof value === 'string') {
      this.when.set(fromLocalIso(value));
    }
  }

  protected isTagged(id: string): boolean {
    return this.tags().includes(id);
  }

  protected toggleTag(id: string): void {
    this.tags.update(list => (list.includes(id) ? list.filter(t => t !== id) : [...list, id]));
    this.feedback.haptic();
  }

  protected cancel(): void {
    void this.modal.dismiss(null, 'cancel');
  }

  protected save(): void {
    const level = this.level();
    if (level === null || !this.valid()) {
      return;
    }
    const original = this.entry();
    const result = original ? original.clone() : new StanfordSleepinessData(level, this.when());
    result.value = level;
    result.loggedAt = this.when();
    result.tags = [...this.tags()];
    result.notes = this.notes().trim();
    void this.modal.dismiss(result, 'save');
  }

  protected remove(): void {
    void this.modal.dismiss(null, 'delete');
  }

  private snapshot(): string {
    return JSON.stringify([this.level(), this.when().getTime(), [...this.tags()].sort(), this.notes().trim()]);
  }

  private async confirmLeave(role?: string): Promise<boolean> {
    if (role === 'save' || role === 'delete' || this.snapshot() === this.initial) {
      return true;
    }
    const sheet = await this.sheets.create({
      header: 'Discard this check-in?',
      buttons: [
        { text: 'Discard Changes', role: 'destructive' },
        { text: 'Keep Editing', role: 'cancel' },
      ],
    });
    await sheet.present();
    const { role: choice } = await sheet.onWillDismiss();
    return choice === 'destructive';
  }
}
