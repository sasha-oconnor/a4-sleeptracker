import { AfterViewInit, Directive, ElementRef, OnDestroy, effect, inject, input } from '@angular/core';

/**
 * ion-datetime-button draws its buttons inside a shadow root and does not pass an aria-label through,
 * so a screen reader hears only "11:30 PM, button". This names those inner buttons after their row,
 * e.g. "Usual bedtime, 11:30 PM", and keeps the name current when the time changes.
 */
@Directive({ selector: 'ion-datetime-button[appLabel]' })
export class DatetimeLabelDirective implements AfterViewInit, OnDestroy {
  readonly appLabel = input.required<string>();

  private readonly host = inject<ElementRef<HTMLIonDatetimeButtonElement>>(ElementRef).nativeElement;
  private observer?: MutationObserver;
  private root: ShadowRoot | null = null;

  constructor() {
    effect(() => {
      this.appLabel();
      this.apply();
    });
  }

  async ngAfterViewInit(): Promise<void> {
    // Ionic's standalone build has no componentOnReady(); wait for the element, then one frame for its render.
    await customElements.whenDefined('ion-datetime-button');
    await new Promise(resolve => requestAnimationFrame(resolve));
    this.root = this.host.shadowRoot;
    if (!this.root) {
      return;
    }
    this.apply();
    this.observer = new MutationObserver(() => this.apply());
    this.observer.observe(this.root, { subtree: true, childList: true, characterData: true });
  }

  ngOnDestroy(): void {
    this.observer?.disconnect();
  }

  private apply(): void {
    this.root?.querySelectorAll('button').forEach(button => {
      const label = `${this.appLabel()}, ${button.textContent?.trim() ?? ''}`;
      if (button.getAttribute('aria-label') !== label) {
        button.setAttribute('aria-label', label);
      }
    });
  }
}
