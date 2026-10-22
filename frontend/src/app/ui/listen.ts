import { Component, inject, input } from '@angular/core';
import { Speech } from '../core/speech';

/** Кнопка «Прослушать» / «Остановить». Скрыта, если звук выключен в настройках. */
@Component({
  selector: 'twc-listen',
  template: `
    @if (speech.available) {
      <button
        type="button"
        class="btn btn--ghost"
        (click)="speech.toggle(text())"
        [attr.aria-pressed]="speech.speaking() === text()"
      >
        @if (speech.speaking() === text()) {
          <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
            <rect x="6" y="6" width="12" height="12" rx="2" />
          </svg>
          Остановить
        } @else {
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
            aria-hidden="true"
          >
            <path d="M4 10v4h4l5 4V6L8 10zM16 9a4 4 0 0 1 0 6M18.5 6.5a8 8 0 0 1 0 11" />
          </svg>
          Прослушать
        }
      </button>
    }
  `,
})
export class Listen {
  protected readonly speech = inject(Speech);
  readonly text = input.required<string>();
}
