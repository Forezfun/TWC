import { Component, DestroyRef, ElementRef, Injector, afterNextRender, computed, inject, output, signal, viewChild } from '@angular/core';
import { Subscription } from 'rxjs';
import { errorText } from '../../core/admin-api';
import { Speech } from '../../core/speech';
import { AudioPreview } from './audio-preview';
import { INSTRUCTION_MEDIA_MAX_BYTES, InstructionApi } from '../../core/instruction-api';

type RecordingPhase = 'ready' | 'requesting' | 'recording' | 'stopping' | 'review' | 'uploading';
const recordingFormats = ['audio/mp4;codecs=mp4a.40.2', 'audio/webm;codecs=opus', 'audio/ogg;codecs=opus',
  'audio/mp4', 'audio/webm', 'audio/ogg'];

@Component({
  selector: 'twc-microphone-dialog',
  imports: [AudioPreview],
  template: `
    <dialog #dialog aria-labelledby="microphone-title" aria-describedby="microphone-target" (cancel)="reset()">
      <div class="stack">
        <div>
          <h2 id="microphone-title">Запись с микрофона</h2>
          <p id="microphone-target">{{ label() }}</p>
        </div>
        @if (blocked()) {
          <p class="notice notice--err" role="alert">{{ blocked() }}</p>
        }
        @if (error()) {
          <p class="notice notice--err" role="alert">{{ error() }}</p>
        }
        @switch (phase()) {
          @case ('ready') {
            @if (!blocked()) {
              <p>Когда будете готовы, начните запись.</p>
            }
          }
          @case ('requesting') {
            <p role="status">Разрешите доступ к микрофону в браузере.</p>
          }
          @case ('recording') {
            <p class="recording-status"><strong role="status">Идёт запись</strong>
              <span role="timer" aria-label="Длительность записи">{{ elapsed() }}</span></p>
          }
          @case ('stopping') {
            <p role="status">Готовим запись…</p>
          }
          @case ('review') {
            <p role="status">Запись готова. Можно прослушать или записать заново.</p>
            <twc-audio-preview [src]="previewUrl()" label="Прослушать запись" />
          }
          @case ('uploading') {
            <p role="status">Загружаем запись…</p>
          }
        }
        <div class="editor-actions">
          @switch (phase()) {
            @case ('ready') {
              @if (!blocked()) {
                <button #primary type="button" class="btn btn--primary" autofocus (click)="start()">Начать запись</button>
              }
            }
            @case ('recording') {
              <button #primary type="button" class="btn btn--primary" (click)="stop()">Остановить запись</button>
            }
            @case ('review') {
              <button #primary type="button" class="btn btn--primary" (click)="save()">Использовать запись</button>
              <button type="button" class="btn btn--secondary" (click)="retry()">Записать заново</button>
            }
          }
          <button #closeButton type="button" class="btn btn--secondary" (click)="close()">
            {{ blocked() ? 'Закрыть' : 'Отмена' }}
          </button>
        </div>
      </div>
    </dialog>
  `,
  styles: `
    dialog {
      width: min(32rem, calc(100% - 2rem));
      max-height: calc(100dvh - 2rem);
      padding: clamp(16px, 4vw, 26px);
      border: 1px solid var(--line);
      border-radius: var(--radius, 12px);
      color: inherit;
      background: var(--white);
    }
    dialog::backdrop { background: rgb(17 35 46 / .55); }
    .recording-status { display: flex; flex-wrap: wrap; align-items: center; gap: 12px; }
    [role='timer'] { font-variant-numeric: tabular-nums; }
  `,
})
export class MicrophoneDialog {
  private readonly api = inject(InstructionApi);
  private readonly destroyRef = inject(DestroyRef);
  private readonly injector = inject(Injector);
  private readonly dialog = viewChild.required<ElementRef<HTMLDialogElement>>('dialog');
  private readonly primary = viewChild<ElementRef<HTMLButtonElement>>('primary');
  private readonly closeButton = viewChild.required<ElementRef<HTMLButtonElement>>('closeButton');
  private readonly speech = inject(Speech);
  readonly saved = output<string>();
  protected readonly label = signal('');
  protected readonly blocked = signal('');
  protected readonly error = signal('');
  protected readonly phase = signal<RecordingPhase>('ready');
  protected readonly previewUrl = signal('');
  private readonly seconds = signal(0);
  protected readonly elapsed = computed(() => {
    const seconds = this.seconds();
    return Math.floor(seconds / 60) + ':' + String(seconds % 60).padStart(2, '0');
  });
  private attempt = 0;
  private recorder?: MediaRecorder;
  private timer?: number;
  private clip?: Blob;
  private upload?: Subscription;

  constructor() {
    this.destroyRef.onDestroy(() => this.reset());
  }

  open(label: string): void {
    const dialog = this.dialog().nativeElement;
    if (dialog.open) return;
    this.reset();
    this.label.set(label);
    const unavailable = !window.isSecureContext
      ? 'Для записи откройте админ-панель через http://127.0.0.1:4200 на компьютере с демо или через HTTPS. Здесь можно загрузить готовое аудио файлом.'
      : !navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined'
        ? 'В этом браузере запись с микрофона недоступна. Можно загрузить готовое аудио файлом.' : '';
    this.blocked.set(unavailable);
    dialog.showModal();
    this.focusAction();
  }

  protected close(): void {
    this.reset();
    this.dialog().nativeElement.close();
  }

  protected async start(): Promise<void> {
    if (this.phase() !== 'ready' || this.blocked()) return;
    const attempt = ++this.attempt;
    this.error.set('');
    this.phase.set('requesting');
    this.focusAction();
    let stream: MediaStream | undefined;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      if (attempt !== this.attempt) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }
      const mimeType = recordingFormats.find((type) => MediaRecorder.isTypeSupported?.(type));
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      const chunks: Blob[] = [];
      let bytes = 0;
      this.recorder = recorder;
      recorder.ondataavailable = ({ data }) => {
        if (!data.size) return;
        bytes += data.size;
        if (bytes > INSTRUCTION_MEDIA_MAX_BYTES) {
          this.fail('Запись превысила 8 МБ. Запишите более короткий фрагмент.');
          return;
        }
        chunks.push(data);
      };
      recorder.onerror = () => this.fail('Запись прервалась. Проверьте микрофон и попробуйте снова.');
      recorder.onstop = () => this.review(recorder, chunks, mimeType);
      recorder.start(500);
      this.seconds.set(0);
      const started = performance.now();
      this.timer = window.setInterval(() => this.seconds.set(Math.floor((performance.now() - started) / 1000)), 250);
      this.phase.set('recording');
      this.focusAction();
    } catch (error: unknown) {
      stream?.getTracks().forEach((track) => track.stop());
      if (attempt !== this.attempt) return;
      const name = error instanceof DOMException || error instanceof Error ? error.name : '';
      const message = name === 'NotAllowedError'
        ? 'Браузер не получил доступ к микрофону. Разрешите его в настройках сайта и попробуйте снова.'
        : name === 'NotFoundError'
          ? 'Микрофон не найден. Подключите его и попробуйте снова.'
          : 'Не удалось начать запись. Проверьте, подключён ли микрофон и свободен ли он.';
      this.fail(message);
    }
  }

  protected stop(): void {
    if (this.recorder?.state === 'recording') {
      this.phase.set('stopping');
      this.recorder.stop();
    }
  }

  protected retry(): void {
    this.discardPreview();
    this.error.set('');
    this.phase.set('ready');
    this.focusAction();
  }

  protected save(): void {
    if (!this.clip || this.phase() !== 'review') return;
    this.pausePreview();
    this.error.set('');
    this.phase.set('uploading');
    this.focusAction();
    this.upload = this.api.uploadMedia(this.clip).subscribe({
      next: ({ url }) => {
        this.saved.emit(url);
        this.close();
      },
      error: (error: unknown) => {
        this.error.set(errorText(error, 'Не удалось загрузить запись. Попробуйте снова.'));
        this.phase.set('review');
        this.focusAction();
      },
    });
  }

  protected reset(): void {
    this.attempt++;
    this.upload?.unsubscribe();
    this.upload = undefined;
    this.releaseCapture();
    this.discardPreview();
    this.seconds.set(0);
    this.error.set('');
    this.phase.set('ready');
  }

  private review(recorder: MediaRecorder, chunks: Blob[], mimeType?: string): void {
    this.releaseCapture();
    const type = (recorder.mimeType || chunks[0]?.type || mimeType || '').split(';')[0].replace(/^video\//, 'audio/');
    if (!chunks.length || !['audio/mp4', 'audio/webm', 'audio/ogg'].includes(type)) {
      this.fail(chunks.length ? 'Формат записи не поддерживается. Можно загрузить аудио файлом.'
        : 'Запись пустая. Попробуйте записать ещё раз.');
      return;
    }
    this.clip = new Blob(chunks, { type });
    this.previewUrl.set(URL.createObjectURL(this.clip));
    this.phase.set('review');
    this.focusAction();
  }

  private fail(message: string): void {
    this.releaseCapture();
    this.error.set(message);
    this.phase.set('ready');
    this.focusAction();
  }

  private releaseCapture(): void {
    if (this.timer !== undefined) window.clearInterval(this.timer);
    this.timer = undefined;
    const recorder = this.recorder;
    this.recorder = undefined;
    if (!recorder) return;
    recorder.ondataavailable = recorder.onerror = recorder.onstop = null;
    if (recorder.state !== 'inactive') recorder.stop();
    recorder.stream.getTracks().forEach((track) => track.stop());
  }

  private discardPreview(): void {
    this.pausePreview();
    const url = this.previewUrl();
    if (url) URL.revokeObjectURL(url);
    this.previewUrl.set('');
    this.clip = undefined;
  }

  private pausePreview(): void {
    if (this.previewUrl()) this.speech.stop();
  }

  private focusAction(): void {
    afterNextRender(() => {
      if (this.dialog().nativeElement.open) (this.primary() ?? this.closeButton()).nativeElement.focus();
    }, { injector: this.injector });
  }
}
