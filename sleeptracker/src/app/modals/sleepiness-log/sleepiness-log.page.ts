import { Component, ElementRef, OnInit, computed, inject, input, signal, viewChild } from '@angular/core';
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
import { DatetimeLabelDirective } from '../../components/datetime-label.directive';
import { CHECKIN_TAGS } from '../../data/catalog';
import { StanfordSleepinessData } from '../../data/stanford-sleepiness-data';
import { ClockService } from '../../services/clock.service';
import { FeedbackService } from '../../services/feedback.service';
import { MINUTE_MS, dateKey, fmtClock, fmtDay, fromLocalIso, toLocalIso } from '../../utils/time';

/** Log (or edit) one Stanford Sleepiness Scale rating, with optional context and notes. */
@Component({
  selector: 'app-sleepiness-log',
  templateUrl: './sleepiness-log.page.html',
  styleUrls: ['./sleepiness-log.page.scss'],
  imports: [
    IonHeader, IonToolbar, IonTitle, IonButtons, IonButton, IonContent, IonList, IonItem, IonLabel, IonIcon,
    IonRadioGroup, IonRadio, IonDatetime, IonDatetimeButton, IonModal, IonTextarea, DatetimeLabelDirective,
  ],
})
export class SleepinessLogPage implements OnInit {
  private static count = 0;
  /** ion-datetime-button finds its picker by id, so ids must be unique on the whole page. */
  protected readonly ids = ((n: number) => ({ when: `drift-when-${n}`, heading: `drift-sss-heading-${n}` }))(
    ++SleepinessLogPage.count);
  /** "Tue, Nov 24" and "7:40 AM" on the When buttons: the weekday helps more than the year. */
  protected readonly whenFormat = {
    date: { weekday: 'short', month: 'short', day: 'numeric' },
    time: { hour: 'numeric', minute: '2-digit' },
  } as const;

  /** The check-in being edited, or null for a new one. */
  readonly entry = input<StanfordSleepinessData | null>(null);
  /** A level to preselect (e.g. from a quick check-in). */
  readonly value = input<number | null>(null);
  /** 'details' when opened from Today's "Add context": open scrolled to the context and notes. */
  readonly focus = input<'details' | null>(null);
  /** Set by Ionic's ModalController. */
  modal!: HTMLIonModalElement;

  private readonly content = viewChild.required(IonContent);
  private readonly details = viewChild.required<ElementRef<HTMLElement>>('details');
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
  /** New: how to answer. Editing: which check-in this is, e.g. "Your check-in from yesterday at 8:25 AM". */
  protected readonly helpText = computed(() => {
    const entry = this.entry();
    if (!entry) {
      return 'Choose the statement that fits best right now.';
    }
    const day = fmtDay(dateKey(entry.loggedAt), this.clock.now());
    const when = day === 'Today' || day === 'Yesterday' ? day.toLowerCase() : day;
    return `Your check-in from ${when} at ${fmtClock(entry.loggedAt)}.`;
  });

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
    if (this.focus() === 'details') {
      this.modal.addEventListener('ionModalDidPresent', () => void this.scrollToDetails(), { once: true });
    }
  }

  private async scrollToDetails(): Promise<void> {
    const scroller = await this.content().getScrollElement();
    const top = this.details().nativeElement.getBoundingClientRect().top - scroller.getBoundingClientRect().top;
    await this.content().scrollToPoint(0, scroller.scrollTop + top - 12, 300);
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
    // Editing: make clear the saved check-in stays; only the unsaved edits go.
    const editing = !!this.entry();
    const sheet = await this.sheets.create({
      header: editing ? 'Discard your changes?' : 'Discard this check-in?',
      subHeader: editing ? 'Your saved check-in won’t change.' : undefined,
      buttons: [
        { text: editing ? 'Discard Changes' : 'Discard Check-in', role: 'destructive' },
        { text: 'Keep Editing', role: 'cancel' },
      ],
    });
    await sheet.present();
    const { role: choice } = await sheet.onWillDismiss();
    return choice === 'destructive';
  }
}
