import { Component, DestroyRef, inject, input, signal } from '@angular/core';
import { Subscription } from 'rxjs';
import { AdminApi } from '../../core/admin-api';
import { Speech } from '../../core/speech';
import { RecordedField, VOICE_FIELD_LABELS } from '../../core/voice-recordings';

@Component({
  selector: 'twc-request-voice-answers',
  template: `
    <details>
      <summary>Аудиоответы · {{ fields().length }}</summary>
      <div class="stack">
        @for (field of fields(); track field) {
          <button class="btn btn--secondary btn--sm" type="button" [disabled]="loading() !== null"
            [attr.aria-label]="'Прослушать аудиоответ: ' + labels[field] + ', заявка ' + requestId()" (click)="listen(field)">
            {{ loading() === field ? 'Загружаем…' : 'Прослушать · ' + labels[field] }}
          </button>
        }
        @if (speech.playing() && speech.speaking() === activeLabel()) {
          <button class="btn btn--secondary btn--sm" type="button" (click)="speech.stop()">Стоп</button>
        }
        @if (error()) { <p role="alert">{{ error() }}</p> }
      </div>
    </details>
  `,
  styles: `:host { display: block; margin-block-start: 8px; } summary { cursor: pointer; } .stack { margin-block-start: 8px; }`,
})
export class RequestVoiceAnswers {
  readonly requestId = input.required<number>();
  readonly fields = input.required<RecordedField[]>();
  protected readonly labels = VOICE_FIELD_LABELS;
  protected readonly speech = inject(Speech);
  protected readonly loading = signal<RecordedField | null>(null);
  protected readonly activeLabel = signal('');
  protected readonly error = signal('');
  private readonly api = inject(AdminApi);
  private readonly urls = new Map<RecordedField, string>();
  private download?: Subscription;

  constructor() {
    inject(DestroyRef).onDestroy(() => {
      this.download?.unsubscribe();
      if (this.speech.speaking() === this.activeLabel()) this.speech.stop();
      this.urls.forEach((url) => URL.revokeObjectURL(url));
    });
  }

  protected listen(field: RecordedField): void {
    this.error.set('');
    const cached = this.urls.get(field);
    if (cached) { this.play(field, cached); return; }
    this.loading.set(field);
    this.download = this.api.requestVoiceAnswer(this.requestId(), field).subscribe({
      next: (blob) => {
        this.loading.set(null);
        const url = URL.createObjectURL(blob);
        this.urls.set(field, url);
        this.play(field, url);
      },
      error: () => { this.loading.set(null); this.error.set('Не удалось загрузить аудиоответ. Попробуйте снова.'); },
    });
  }

  private play(field: RecordedField, url: string): void {
    this.activeLabel.set(`Аудиоответ: ${this.labels[field]}. Заявка ${this.requestId()}`);
    this.speech.playSample(this.activeLabel(), url, null, () => this.error.set('Не удалось воспроизвести аудиоответ.'));
  }
}
