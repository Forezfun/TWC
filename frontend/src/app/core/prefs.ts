import { DOCUMENT } from '@angular/common';
import { Injectable, PLATFORM_ID, effect, inject, signal } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';

export type TextSize = 'md' | 'lg' | 'xl';

const KEY = 'twc-prefs';

/** Настройки пользователя: размер текста и звук. Сохраняются между входами (правило 14). */
@Injectable({ providedIn: 'root' })
export class Prefs {
  private readonly doc = inject(DOCUMENT);
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));

  readonly textSize = signal<TextSize>('md');
  readonly sound = signal(true);

  constructor() {
    if (this.isBrowser) {
      try {
        const raw = localStorage.getItem(KEY);
        if (raw) {
          const saved = JSON.parse(raw) as { textSize?: TextSize; sound?: boolean };
          if (saved.textSize) this.textSize.set(saved.textSize);
          if (typeof saved.sound === 'boolean') this.sound.set(saved.sound);
        }
      } catch {
        /* localStorage недоступен — работаем со значениями по умолчанию */
      }
    }
    effect(() => {
      const size = this.textSize();
      const sound = this.sound();
      const root = this.doc.documentElement;
      root.classList.toggle('text-lg', size === 'lg');
      root.classList.toggle('text-xl', size === 'xl');
      if (this.isBrowser) {
        try {
          localStorage.setItem(KEY, JSON.stringify({ textSize: size, sound }));
        } catch {
          /* ignore */
        }
      }
    });
  }
}
