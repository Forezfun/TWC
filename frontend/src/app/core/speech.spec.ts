import { Component, inject } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Spoken } from '../ui/spoken';
import { Prefs } from './prefs';
import { Speech } from './speech';
import { ReadFragment } from '../ui/read-fragment';
import { AudioOutput } from './audio-output';

class TestAudio {
  readyState = 4;
  duration = 4;
  currentTime = 0;
  seeking = false;
  onloadedmetadata: (() => void) | null = null;
  oncanplay: (() => void) | null = null;
  onseeked: (() => void) | null = null;
  onplaying: (() => void) | null = null;
  onended: (() => void) | null = null;
  onerror: (() => void) | null = null;
  play = vi.fn().mockResolvedValue(undefined);
  pause = vi.fn();
  load = vi.fn();
}

class TestUtterance {
  rate = 1;
  onstart?: () => void;
  onend?: () => void;
  onboundary?: (event: { name: string; charIndex: number; charLength: number }) => void;

  constructor(readonly text: string) {}
}

@Component({
  imports: [Spoken],
  template: `
    <main>
      <p><twc-spoken text="Возьмите список. Найдите магазин." /></p>
      <div class="sound-card" data-card-only><twc-spoken text="Учебная карточка" /></div>
    </main>
    <div class="public-actions"><button><twc-spoken text="Завершить инструкцию" /></button></div>
  `,
})
class SpeechPage {
  readonly speech = inject(Speech);
}

@Component({
  imports: [Spoken, ReadFragment],
  template: `<main>
    <twc-spoken text="Введите номер" recording="/question.mp3" />
    <div class="sound-fragment error"><p><twc-spoken text="Проверьте цифры. Номер остался в поле." systemText /></p><twc-fragment-sound label="Прослушать ошибку" /></div>
  </main>`,
})
class ErrorFragmentPage {}

it('reads only the error recording when its speaker is pressed', () => {
  const urls: string[] = [];
  vi.stubGlobal('Audio', class extends TestAudio {
    constructor(url: string) { super(); urls.push(url); }
  });
  try {
    TestBed.inject(Prefs).sound.set(true);
    const fixture = TestBed.createComponent(ErrorFragmentPage);
    fixture.detectChanges();
    fixture.nativeElement.querySelector('button').click();
    expect(urls).toEqual(['/kolibri/system-audio/callback-phone-error.mp3']);
    TestBed.inject(Speech).stop();
  } finally { vi.unstubAllGlobals(); }
});

it('waits for a question and instruction, preserves the wait on restart, and cancels it on stop', async () => {
  const spoken: TestUtterance[] = [];
  vi.stubGlobal('SpeechSynthesisUtterance', TestUtterance);
  vi.stubGlobal('speechSynthesis', {
    getVoices: () => [], cancel: vi.fn(), speak: (utterance: TestUtterance) => spoken.push(utterance),
  });
  try {
    TestBed.inject(Prefs).sound.set(true);
    const speech = TestBed.inject(Speech);
    const root = document.createElement('div');
    root.innerHTML = '<span data-read="Как вас зовут?"></span>';
    const finished = speech.playPrompt(root, 'После ответа нажмите «Стоп».');
    expect(spoken[0].text).toBe('Как вас зовут?');
    speech.restart();
    spoken[0].onend?.();
    expect(spoken).toHaveLength(2);
    spoken[1].onend?.();
    expect(spoken[2].text).toBe('После ответа нажмите «Стоп».');
    spoken[2].onend?.();
    await expect(finished).resolves.toBe(true);

    const cancelled = speech.playPrompt(root);
    speech.stop();
    await expect(cancelled).resolves.toBe(false);
  } finally { vi.unstubAllGlobals(); }
});

it('highlights the sentence and word, restarts the page, and clears the highlight on stop', () => {
  const spoken: TestUtterance[] = [];
  vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'performance'] });
  vi.stubGlobal('SpeechSynthesisUtterance', TestUtterance);
  vi.stubGlobal('speechSynthesis', {
    getVoices: () => [],
    cancel: vi.fn(),
    speak: (utterance: TestUtterance) => spoken.push(utterance),
  });
  try {
    TestBed.configureTestingModule({ imports: [SpeechPage] });
    TestBed.inject(Prefs).sound.set(true);
    const fixture = TestBed.createComponent(SpeechPage);
    fixture.detectChanges();
    const speech = fixture.componentInstance.speech;
    const highlighted = () => fixture.nativeElement.querySelector('.word.reading')?.textContent;

    expect(speech.playPage()).toBe(true);
    expect(spoken[0].text.trim()).toBe('Возьмите список.');
    spoken[0].onstart?.();
    fixture.detectChanges();
    expect(highlighted()).toBe('Возьмите');

    spoken[0].onend?.();
    spoken[1].onboundary?.({ name: 'word', charIndex: 8, charLength: 7 });
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.sentence.reading')?.textContent).toBe('Найдите магазин.');
    expect(highlighted()).toBe('магазин');

    spoken[1].onend?.();
    expect(spoken[2].text).toBe('Завершить инструкцию');
    speech.restart();
    expect(spoken[3].text.trim()).toBe('Возьмите список.');
    speech.stop();
    spoken[3].onend?.();
    fixture.detectChanges();
    expect(spoken).toHaveLength(4);
    expect(fixture.nativeElement.querySelector('.reading')).toBeNull();

    expect(speech.playCard(fixture.nativeElement.querySelector('.sound-card'))).toBe(true);
    expect(spoken[4].text).toBe('Учебная карточка');
  } finally {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  }
});

it('plays a recorded sample with an empty transcript', () => {
  const play = vi.fn().mockResolvedValue(undefined);
  const createAudio = vi.fn();
  vi.stubGlobal('Audio', class extends TestAudio {
    constructor(url: string) { super(); createAudio(url); }
    override play = play;
  });
  try {
    const speech = TestBed.inject(Speech);
    expect(speech.playSample('', '/api/instruction-media/sample.mp3')).toBe(true);
    expect(createAudio).toHaveBeenCalledWith('/api/instruction-media/sample.mp3');
    expect(play).toHaveBeenCalledOnce();
    speech.stop();
  } finally {
    vi.unstubAllGlobals();
  }
});

it('waits for buffered audio and the end of a seek before playing a recording fragment', () => {
  const audio = new TestAudio();
  audio.readyState = 0;
  vi.stubGlobal('Audio', class { constructor() { return audio; } });
  try {
    const speech = TestBed.inject(Speech);
    speech.playSample('Вторая часть', '/combined.mp3', { from: 0.25, to: 0.75 });
    expect(audio.play).not.toHaveBeenCalled();
    audio.readyState = 1;
    audio.onloadedmetadata?.();
    expect(audio.currentTime).toBe(1);
    audio.readyState = 4;
    audio.oncanplay?.();
    expect(audio.play).not.toHaveBeenCalled();
    audio.onseeked?.();
    expect(audio.play).toHaveBeenCalledOnce();
    speech.stop();
  } finally { vi.unstubAllGlobals(); }
});

it('prepares the output before both recorded audio and browser speech and cancels pending starts', async () => {
  const ready: (() => void)[] = [];
  TestBed.configureTestingModule({ providers: [{ provide: AudioOutput, useValue: {
    prepare: () => new Promise<void>((resolve) => ready.push(resolve)), stop: vi.fn(),
  } }] });
  const spoken: TestUtterance[] = [];
  const audio = new TestAudio();
  const cancel = vi.fn();
  vi.stubGlobal('Audio', class { constructor() { return audio; } });
  vi.stubGlobal('SpeechSynthesisUtterance', TestUtterance);
  vi.stubGlobal('speechSynthesis', { getVoices: () => [], cancel, speak: (value: TestUtterance) => spoken.push(value) });
  try {
    TestBed.inject(Prefs).sound.set(true);
    const speech = TestBed.inject(Speech);
    speech.playSample('Запись', '/recording.mp3');
    expect(audio.play).not.toHaveBeenCalled();
    ready[0]();
    await Promise.resolve();
    expect(audio.play).toHaveBeenCalledOnce();
    speech.toggle('Первая фраза. Вторая фраза.');
    expect(spoken).toHaveLength(0);
    expect(cancel).not.toHaveBeenCalled();
    ready[1]();
    await Promise.resolve();
    expect(spoken[0].text).toBe('Первая фраза. ');
    spoken[0].onend?.();
    await Promise.resolve();
    expect(spoken[1].text).toBe('Вторая фраза.');
    speech.stop();
    speech.playSample('Не запускать после стопа', '/recording.mp3');
    speech.stop();
    ready[2]();
    await Promise.resolve();
    expect(audio.play).toHaveBeenCalledOnce();
    speech.toggle('Отменённая фраза');
    speech.stop();
    ready[3]();
    await Promise.resolve();
    expect(spoken).toHaveLength(2);
  } finally { vi.unstubAllGlobals(); }
});

it('ignores late media events and playback errors after Stop or Restart', async () => {
  const audios: TestAudio[] = [];
  vi.stubGlobal('Audio', class extends TestAudio {
    constructor() { super(); this.readyState = 0; audios.push(this); }
  });
  try {
    const speech = TestBed.inject(Speech);
    speech.playSample('Запись', '/recording.mp3');
    const staleReady = audios[0].oncanplay;
    speech.restart();
    audios[0].readyState = 4;
    staleReady?.();
    expect(audios[0].play).not.toHaveBeenCalled();
    audios[1].readyState = 4;
    audios[1].oncanplay?.();
    expect(audios[1].play).toHaveBeenCalledOnce();
    speech.stop();
    expect(audios[1].oncanplay).toBeNull();
    expect(speech.playing()).toBe(false);
  } finally { vi.unstubAllGlobals(); }
});

it('uses a system recording only for an opted-in label and prefers explicit recordings', () => {
  const fixture = TestBed.createComponent(Spoken);
  const host: HTMLElement = fixture.nativeElement;
  fixture.componentRef.setInput('text', 'Закрыть предпросмотр');
  fixture.detectChanges();
  expect(host.hasAttribute('data-recording')).toBe(false);

  fixture.componentRef.setInput('systemButton', true);
  fixture.detectChanges();
  expect(host.getAttribute('data-recording')).toBe('/kolibri/system-audio/buttons/close-preview.mp3?v=2');

  fixture.componentRef.setInput('recording', '/api/instruction-media/explicit.mp3');
  fixture.detectChanges();
  expect(host.getAttribute('data-recording')).toBe('/api/instruction-media/explicit.mp3');
});

it('matches system text recordings exactly and preserves an uploaded recording', () => {
  const fixture = TestBed.createComponent(Spoken);
  const host: HTMLElement = fixture.nativeElement;
  fixture.componentRef.setInput('text', 'Повседневные дела, общение, безопасность');
  fixture.detectChanges();
  expect(host.hasAttribute('data-recording')).toBe(false);

  fixture.componentRef.setInput('systemText', true);
  fixture.detectChanges();
  expect(host.getAttribute('data-recording')).toBe('/kolibri/system-audio/roles-self-hint.mp3');

  fixture.componentRef.setInput('text', 'Повседневные дела');
  fixture.detectChanges();
  expect(host.getAttribute('data-recording')).toBe('/kolibri/system-audio/topics-everyday.mp3');

  fixture.componentRef.setInput('recording', '/api/instruction-media/custom-topic.mp3');
  fixture.detectChanges();
  expect(host.getAttribute('data-recording')).toBe('/api/instruction-media/custom-topic.mp3');

  fixture.componentRef.setInput('recording', null);
  fixture.componentRef.setInput('text', 'Другая тема');
  fixture.detectChanges();
  expect(host.hasAttribute('data-recording')).toBe(false);
});
