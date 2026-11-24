import { Injectable, inject } from '@angular/core';
import { ToastController } from '@ionic/angular/standalone';
import type { ToastButton } from '@ionic/core';
import { Capacitor } from '@capacitor/core';
import { Haptics, ImpactStyle, NotificationType } from '@capacitor/haptics';
import { SettingsService } from './settings.service';

export interface ToastOptions {
  /** Bold first line; the message becomes the quieter detail line under it. */
  header?: string;
  /** Adds an "Undo" button that runs this (the app's "uh-oh" button). */
  undo?: () => unknown;
  /** One extra button, e.g. "Details" or "Log now". */
  action?: { text: string; handler: () => unknown };
  icon?: string;
  duration?: number;
  position?: 'top' | 'bottom';
}

export type HapticKind = 'tap' | 'success' | 'warning';

/** Toasts (with Undo) and haptic feedback, in one place so they look and feel consistent. */
@Injectable({ providedIn: 'root' })
export class FeedbackService {
  private readonly toasts = inject(ToastController);
  private readonly settings = inject(SettingsService);
  private current: HTMLIonToastElement | null = null;

  /**
   * Vibration only exists on phones. Desktop browsers either lack the API (the plugin rejects) or
   * ignore it, so only try on a native app or a touch device.
   */
  private readonly canVibrate =
    Capacitor.isNativePlatform() ||
    (typeof navigator !== 'undefined' && 'vibrate' in navigator &&
      (window.matchMedia?.('(pointer: coarse)').matches || navigator.maxTouchPoints > 0));

  async toast(message: string, opts: ToastOptions = {}): Promise<void> {
    // Only one toast at a time: a new message replaces the old one.
    this.current?.dismiss().catch(() => undefined);
    this.current = null;

    const buttons: ToastButton[] = [];
    if (opts.action) {
      const action = opts.action;
      buttons.push({ text: action.text, handler: () => void action.handler() });
    }
    if (opts.undo) {
      const undo = opts.undo;
      buttons.push({ text: 'Undo', role: 'cancel', handler: () => void undo() });
    }
    const position = opts.position ?? 'bottom';
    const anchor = position === 'bottom' && document.getElementById('tab-bar') ? 'tab-bar' : undefined;

    const stacked = buttons.length > 1;
    const toast = await this.toasts.create({
      header: opts.header,
      message,
      // Every toast leads with an icon badge. In the stacked layout it would float on a line of its own.
      icon: stacked ? undefined : opts.icon ?? 'checkmark',
      buttons,
      // Toasts with buttons stay long enough to read and react to.
      duration: opts.duration ?? (buttons.length ? 6000 : 2500),
      position,
      positionAnchor: anchor,
      swipeGesture: 'vertical',
      layout: stacked ? 'stacked' : 'baseline',
      cssClass: opts.header ? ['drift-toast', 'drift-toast--titled'] : 'drift-toast',
    });
    this.current = toast;
    await toast.present();
  }

  haptic(kind: HapticKind = 'tap'): void {
    if (!this.canVibrate || !this.settings.settings().haptics) {
      return;
    }
    const run =
      kind === 'success' ? Haptics.notification({ type: NotificationType.Success }) :
      kind === 'warning' ? Haptics.notification({ type: NotificationType.Warning }) :
      Haptics.impact({ style: ImpactStyle.Light });
    run.catch(() => undefined);
  }
}
