import { Component, inject, input, signal } from '@angular/core';
import { Speech } from '../../core/speech';

@Component({
  selector: 'twc-audio-preview',
  template: `
    <button type="button" class="btn btn--secondary btn--sm"
      [disabled]="!src() && !sample().trim()" [attr.aria-label]="label()" (click)="listen()">
      Прослушать
    </button>
    @if (failed()) { <span class="muted" role="status">Не удалось воспроизвести озвучку.</span> }
  `,
  styles: [`:host { display: inline-flex; align-items: center; flex-wrap: wrap; gap: 8px; }`],
})
export class AudioPreview {
  private readonly speech = inject(Speech);
  readonly src = input<string | null>();
  readonly sample = input('');
  readonly range = input<{ from: number; to: number } | null>();
  readonly label = input('Прослушать озвучку');
  protected readonly failed = signal(false);

  protected listen(): void {
    this.failed.set(false);
    if (!this.speech.playSample(this.sample(), this.src(), this.range(), () => this.failed.set(true))) {
      this.failed.set(true);
    }
  }
}
