import { Injectable, PLATFORM_ID, inject, signal } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { Prefs } from './prefs';

/** Озвучка текста по нажатию (правило 9): без автозапуска, с остановкой. */
@Injectable({ providedIn: 'root' })
export class Speech {
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));
  private readonly prefs = inject(Prefs);

  /** Текст, который сейчас озвучивается, или null. */
  readonly speaking = signal<string | null>(null);

  get available(): boolean {
    return this.isBrowser && 'speechSynthesis' in window && this.prefs.sound();
  }

  toggle(text: string): void {
    if (!this.available) return;
    if (this.speaking() === text) {
      this.stop();
      return;
    }
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = 'ru-RU';
    u.rate = 0.9;
    u.onend = () => this.speaking.set(null);
    u.onerror = () => this.speaking.set(null);
    this.speaking.set(text);
    window.speechSynthesis.speak(u);
  }

  stop(): void {
    if (!this.isBrowser || !('speechSynthesis' in window)) return;
    window.speechSynthesis.cancel();
    this.speaking.set(null);
  }
}
