import { Injectable } from '@angular/core';
import { Capacitor } from '@capacitor/core';
import { Share } from '@capacitor/share';

export type ShareOutcome = 'shared' | 'copied' | 'downloaded' | 'cancelled' | 'failed';

const isCancel = (err: unknown): boolean => {
  const e = err as { name?: string; message?: string } | null;
  return e?.name === 'AbortError' || /cancel/i.test(e?.message ?? '');
};

/** The native share sheet (Capacitor Share), with a clipboard fallback where sharing isn't available. */
@Injectable({ providedIn: 'root' })
export class ShareService {
  private canShareNatively = false;

  /**
   * Loads the plugin at startup. Browsers only allow sharing during a fresh tap, so the first tap
   * shouldn't be spent waiting for the plugin to load.
   */
  async prewarm(): Promise<void> {
    try {
      this.canShareNatively = (await Share.canShare()).value;
    } catch {
      this.canShareNatively = false;
    }
  }

  async share(title: string, text: string): Promise<ShareOutcome> {
    if (this.canShareNatively) {
      try {
        await Share.share({ title, text, dialogTitle: title });
        return 'shared';
      } catch (err) {
        if (isCancel(err)) {
          return 'cancelled';
        }
        // Otherwise fall through to copying.
      }
    }
    return this.copy(text);
  }

  async copy(text: string): Promise<ShareOutcome> {
    try {
      await navigator.clipboard.writeText(text);
      return 'copied';
    } catch {
      return 'failed';
    }
  }

  /** A backup file: downloaded in the browser, handed to the share sheet on a device. */
  async exportFile(filename: string, contents: string): Promise<ShareOutcome> {
    if (Capacitor.isNativePlatform()) {
      return this.share('Drift backup', contents);
    }
    try {
      const url = URL.createObjectURL(new Blob([contents], { type: 'application/json' }));
      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      return 'downloaded';
    } catch {
      return 'failed';
    }
  }
}
