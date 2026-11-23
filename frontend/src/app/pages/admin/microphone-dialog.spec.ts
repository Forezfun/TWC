import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { InstructionApi } from '../../core/instruction-api';
import { Speech } from '../../core/speech';
import { MicrophoneDialog } from './microphone-dialog';

class TestRecorder {
  static isTypeSupported(type: string): boolean {
    return type === 'audio/webm;codecs=opus';
  }

  state = 'inactive';
  ondataavailable?: (event: { data: Blob }) => void;
  onstop?: () => void;
  readonly mimeType = 'audio/webm;codecs=opus';

  constructor(readonly stream: MediaStream) {}

  start(): void {
    this.state = 'recording';
  }

  stop(): void {
    this.state = 'inactive';
    this.ondataavailable?.({ data: new Blob(['test audio'], { type: this.mimeType }) });
    this.onstop?.();
  }
}

function microphone(secure = true) {
  vi.stubGlobal('isSecureContext', secure);
  vi.stubGlobal('MediaRecorder', TestRecorder);
  const stop = vi.fn();
  const stream = { getTracks: () => [{ stop }] };
  const getUserMedia = vi.fn<() => Promise<typeof stream>>().mockResolvedValue(stream);
  Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: { getUserMedia } });
  const revokeObjectURL = vi.fn();
  vi.stubGlobal('URL', Object.assign(class extends URL {}, {
    createObjectURL: () => 'blob:recording-preview', revokeObjectURL,
  }));
  const upload = vi.fn((_clip: Blob) => of({ url: '/api/instruction-media/recording.webm' }));
  const playback = vi.fn(() => true);
  TestBed.configureTestingModule({ providers: [
    { provide: InstructionApi, useValue: { uploadMedia: upload } },
    { provide: Speech, useValue: { playSample: playback, stop: vi.fn() } },
  ] });
  const fixture = TestBed.createComponent(MicrophoneDialog);
  fixture.detectChanges();
  const root: HTMLElement = fixture.nativeElement;
  const dialog = root.querySelector('dialog')!;
  dialog.showModal = () => { dialog.open = true; };
  dialog.close = () => { dialog.open = false; };
  const click = (text: string) => {
    const button = [...dialog.querySelectorAll('button')].find((button) => button.textContent.trim() === text);
    expect(button).toBeDefined();
    button!.click();
    fixture.detectChanges();
  };
  return { fixture, dialog, click, getUserMedia, stream, stop, upload, revokeObjectURL, playback };
}

const mediaDevicesBefore = Object.getOwnPropertyDescriptor(navigator, 'mediaDevices');
afterEach(() => {
  if (mediaDevicesBefore) Object.defineProperty(navigator, 'mediaDevices', mediaDevicesBefore);
  else Reflect.deleteProperty(navigator, 'mediaDevices');
  vi.unstubAllGlobals();
});

it('записывает, даёт прослушать и прикрепляет аудио после подтверждения', async () => {
  const { fixture, dialog, click, getUserMedia, stop, upload, revokeObjectURL, playback } = microphone();
  const saved = vi.fn();
  fixture.componentInstance.saved.subscribe(saved);
  fixture.componentInstance.open('Озвучка ответа 1');
  fixture.detectChanges();
  expect(dialog.textContent).toContain('Озвучка ответа 1');
  expect(getUserMedia).not.toHaveBeenCalled();
  click('Начать запись');
  await Promise.resolve();
  fixture.detectChanges();
  expect(getUserMedia).toHaveBeenCalledWith({ audio: true });
  expect(dialog.textContent).toContain('Идёт запись');
  click('Остановить запись');
  expect(stop).toHaveBeenCalledOnce();
  click('Прослушать');
  expect(playback).toHaveBeenCalledWith('', 'blob:recording-preview', undefined, expect.any(Function));
  expect(upload).not.toHaveBeenCalled();
  click('Использовать запись');
  expect(upload.mock.calls[0][0].type).toBe('audio/webm');
  expect(saved).toHaveBeenCalledWith('/api/instruction-media/recording.webm');
  expect(revokeObjectURL).toHaveBeenCalledWith('blob:recording-preview');
  expect(dialog.open).toBe(false);
});

it('останавливает микрофон, если разрешение пришло после отмены', async () => {
  const { fixture, click, getUserMedia, stream, stop, upload } = microphone();
  let grant!: (value: typeof stream) => void;
  getUserMedia.mockImplementation(() => new Promise((resolve) => { grant = resolve; }));
  fixture.componentInstance.open('Озвучка названия шага');
  fixture.detectChanges();
  click('Начать запись');
  click('Отмена');
  grant(stream);
  await Promise.resolve();
  expect(stop).toHaveBeenCalledOnce();
  expect(upload).not.toHaveBeenCalled();
});

it('объясняет, как открыть микрофон, если админ-панель открыта по HTTP в локальной сети', () => {
  const { fixture, dialog, getUserMedia } = microphone(false);
  fixture.componentInstance.open('Озвучка текста шага');
  fixture.detectChanges();
  expect(dialog.open).toBe(true);
  expect(dialog.querySelector('[role="alert"]')?.textContent).toContain('127.0.0.1:4200');
  expect(getUserMedia).not.toHaveBeenCalled();
});
