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
  IonTextarea,
  IonTitle,
  IonToolbar,
} from '@ionic/angular/standalone';
import { SleepDialComponent } from '../../components/sleep-dial/sleep-dial.component';
import { QUALITY_LABELS, SLEEP_TAGS } from '../../data/catalog';
import { OvernightSleepData } from '../../data/overnight-sleep-data';
import { ClockService } from '../../services/clock.service';
import { FeedbackService } from '../../services/feedback.service';
import { SettingsService } from '../../services/settings.service';
import { SleepService } from '../../services/sleep.service';
import {
  DateKey,
  MINUTE_MS,
  dateKey,
  floorTo,
  fmtClock,
  fmtDuration,
  fmtWeekday,
  inferNight,
  isoAt,
  minuteOfDay,
  minutesFromIso,
  toLocalIso,
} from '../../utils/time';

/** Times handed over by the bedtime timer ("I'm awake"). */
export interface NightPrefill {
  start: Date;
  end: Date;
  fromTimer?: boolean;
}

/**
 * Log (or edit) one night. The dial and the wheel pickers edit the same two clock times; the
 * date is the morning you woke up, and bedtime falls on the evening before when it's later than
 * the wake-up time. So 11:30 PM → 7:15 AM and 1:30 AM → 9:00 AM both just work.
 */
@Component({
  selector: 'app-overnight-log',
  templateUrl: './overnight-log.page.html',
  styleUrls: ['./overnight-log.page.scss'],
  imports: [
    IonHeader, IonToolbar, IonTitle, IonButtons, IonButton, IonContent, IonList, IonItem, IonLabel, IonIcon,
    IonDatetime, IonDatetimeButton, IonModal, IonTextarea, SleepDialComponent,
  ],
})
export class OvernightLogPage implements OnInit {
  private static count = 0;
  /** ion-datetime-button finds its picker by id, so ids must be unique on the whole page. */
  protected readonly ids = ((n: number) => ({
    morning: `drift-morning-${n}`,
    bed: `drift-bed-${n}`,
    wake: `drift-wake-${n}`,
  }))(++OvernightLogPage.count);

  /** The night being edited, or null for a new log. */
  readonly entry = input<OvernightSleepData | null>(null);
  /** Times from the sleep timer, for a new log. */
  readonly prefill = input<NightPrefill | null>(null);
  /** Set by Ionic's ModalController. */
  modal!: HTMLIonModalElement;

  private readonly sleep = inject(SleepService);
  private readonly settingsService = inject(SettingsService);
  private readonly clock = inject(ClockService);
  private readonly sheets = inject(ActionSheetController);
  private readonly feedback = inject(FeedbackService);

  protected readonly tagOptions = SLEEP_TAGS;
  protected readonly qualityLabels = QUALITY_LABELS;
  protected readonly stars = [1, 2, 3, 4, 5];
  /** "Tue, Nov 24" on the date button: the weekday helps more than the year. */
  protected readonly dateFormat = { date: { weekday: 'short', month: 'short', day: 'numeric' } } as const;

  protected readonly morningKey = signal<DateKey>(dateKey(new Date()));
  protected readonly bedMin = signal(23 * 60 + 30);
  protected readonly wakeMin = signal(7 * 60 + 30);
  protected readonly quality = signal<number | null>(null);
  protected readonly tags = signal<string[]>([]);
  protected readonly notes = signal('');
  private initial = '';
  /** The times the sheet opened with, to tell a default apart from something the person chose. */
  private readonly initialTimes = signal('');

  protected readonly goalMin = computed(() => this.settingsService.settings().goalMin);
  protected readonly todayKey = computed(() => dateKey(this.clock.now()));
  protected readonly window = computed(() => inferNight(this.morningKey(), this.bedMin(), this.wakeMin()));
  protected readonly durationMin = computed(() =>
    Math.round((this.window().end.getTime() - this.window().start.getTime()) / MINUTE_MS));
  /** Spells out the inferred days, e.g. "Sun 11:30 PM → Mon 7:15 AM". */
  protected readonly windowText = computed(() => {
    const { start, end } = this.window();
    return `${fmtWeekday(start)} ${fmtClock(start)} → ${fmtWeekday(end)} ${fmtClock(end)}`;
  });

  /** Until the person changes the times, say where the filled-in times came from. */
  protected readonly sourceNote = computed(() => {
    if (this.entry() || this.timesKey() !== this.initialTimes()) {
      return null;
    }
    return this.prefill()?.fromTimer
      ? 'Times from your sleep timer. Change them if they’re off.'
      : 'These are your usual times from Settings. Change them to match last night.';
  });
  /** On this morning's log, the sun on the dial stops at the current time. */
  protected readonly wakeMaxMin = computed(() =>
    this.morningKey() === this.todayKey() ? minuteOfDay(this.clock.now()) : null);

  protected readonly bedIso = computed(() => isoAt(this.morningKey(), this.bedMin()));
  protected readonly wakeIso = computed(() => isoAt(this.morningKey(), this.wakeMin()));
  /** On today's log, the wake-up picker can't go past the current time. */
  protected readonly wakeMax = computed(() =>
    this.morningKey() === this.todayKey() ? toLocalIso(this.clock.now()) : undefined);
  /** Mornings that already have a log, marked in the date picker. */
  protected readonly loggedMornings = computed(() => {
    const editing = this.entry()?.id;
    return this.sleep.overnight()
      .filter(n => n.id !== editing)
      .map(n => ({ date: n.morningKey, textColor: '#0e0f11', backgroundColor: 'rgba(79, 209, 197, 0.85)' }));
  });

  protected readonly duplicate = computed(() => this.sleep.nightFor(this.morningKey(), this.entry()?.id));
  protected readonly errors = computed(() => {
    const out: string[] = [];
    if (this.bedMin() === this.wakeMin()) {
      out.push('Bedtime and wake-up can’t be the same time.');
    }
    if (this.window().end.getTime() > this.clock.now().getTime() + MINUTE_MS) {
      out.push('That wake-up time hasn’t happened yet. Pick an earlier time or an earlier morning.');
    }
    return out;
  });
  protected readonly warnings = computed(() => {
    const out: string[] = [];
    const minutes = this.durationMin();
    if (!this.errors().length && minutes < 2 * 60) {
      out.push(`Only ${fmtDuration(minutes)} of sleep. Double-check the times if that’s not right.`);
    }
    if (!this.errors().length && minutes > 14 * 60) {
      out.push(`${fmtDuration(minutes)} is a very long night. Double-check the times if that’s not right.`);
    }
    const dup = this.duplicate();
    if (dup) {
      out.push(`You already logged ${dup.durationString()} for this night. Saving replaces it, and you can undo.`);
    }
    return out;
  });
  protected readonly valid = computed(() => this.errors().length === 0);

  ngOnInit(): void {
    const settings = this.settingsService.settings();
    const entry = this.entry();
    const prefill = this.prefill();
    if (entry) {
      this.morningKey.set(entry.morningKey);
      this.bedMin.set(minuteOfDay(entry.start));
      this.wakeMin.set(minuteOfDay(entry.end));
      this.quality.set(entry.quality);
      this.tags.set([...entry.tags]);
      this.notes.set(entry.notes);
    } else if (prefill) {
      this.morningKey.set(dateKey(prefill.end));
      this.bedMin.set(minuteOfDay(prefill.start));
      this.wakeMin.set(minuteOfDay(prefill.end));
    } else {
      // Smart defaults: this morning, the usual bedtime, and the usual wake-up
      // (or "now" when logging before the usual wake-up time).
      const now = new Date();
      const nowMin = floorTo(minuteOfDay(now), 5);
      this.morningKey.set(dateKey(now));
      this.bedMin.set(settings.usualBedMin);
      this.wakeMin.set(nowMin < settings.usualWakeMin ? nowMin : settings.usualWakeMin);
    }
    this.initial = this.snapshot();
    this.initialTimes.set(this.timesKey());
    // Guards Cancel, swipe-down, and backdrop taps alike: never lose an edited log by accident.
    this.modal.canDismiss = (_data?: unknown, role?: string) => this.confirmLeave(role);
  }

  protected isTagged(id: string): boolean {
    return this.tags().includes(id);
  }

  protected toggleTag(id: string): void {
    this.tags.update(list => (list.includes(id) ? list.filter(t => t !== id) : [...list, id]));
    this.feedback.haptic();
  }

  protected setQuality(value: number): void {
    this.quality.set(this.quality() === value ? null : value);
    this.feedback.haptic();
  }

  protected onMorning(value: string | string[] | null | undefined): void {
    if (typeof value === 'string') {
      this.morningKey.set(value.slice(0, 10));
    }
  }

  protected onBed(value: string | string[] | null | undefined): void {
    if (typeof value === 'string') {
      this.bedMin.set(minutesFromIso(value));
    }
  }

  protected onWake(value: string | string[] | null | undefined): void {
    if (typeof value === 'string') {
      this.wakeMin.set(minutesFromIso(value));
    }
  }

  protected onDialCommit(): void {
    this.feedback.haptic();
  }

  protected cancel(): void {
    void this.modal.dismiss(null, 'cancel');
  }

  protected save(): void {
    if (!this.valid()) {
      return;
    }
    const { start, end } = this.window();
    const original = this.entry();
    const result = original ? original.clone() : new OvernightSleepData(start, end);
    result.setWindow(start, end);
    result.quality = this.quality();
    result.tags = [...this.tags()];
    result.notes = this.notes().trim();
    if (!original) {
      result.source = this.prefill()?.fromTimer ? 'timer' : 'manual';
    }
    void this.modal.dismiss(result, 'save');
  }

  protected remove(): void {
    void this.modal.dismiss(null, 'delete');
  }

  private timesKey(): string {
    return `${this.morningKey()} ${this.bedMin()} ${this.wakeMin()}`;
  }

  private snapshot(): string {
    return JSON.stringify([
      this.morningKey(), this.bedMin(), this.wakeMin(), this.quality(), [...this.tags()].sort(), this.notes().trim(),
    ]);
  }

  private async confirmLeave(role?: string): Promise<boolean> {
    if (role === 'save' || role === 'delete' || this.snapshot() === this.initial) {
      return true;
    }
    const sheet = await this.sheets.create({
      header: 'Discard this sleep log?',
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
