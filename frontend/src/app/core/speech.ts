import { DOCUMENT, isPlatformBrowser } from '@angular/common';
import { DestroyRef, Injectable, PLATFORM_ID, computed, inject, signal } from '@angular/core';
import { AudioOutput } from './audio-output';
import { Prefs } from './prefs';

interface Fragment {
  text: string;
  element?: HTMLElement;
  audio?: string;
  audioFrom?: number;
  audioTo?: number;
  start?: number;
  onError?: () => void;
}

interface Cursor {
  element?: HTMLElement;
  offset: number;
}

type SpeechScope = 'page' | 'card' | 'text' | 'sample';
const sentences = new Intl.Segmenter('ru', { granularity: 'sentence' });
const words = new Intl.Segmenter('ru', { granularity: 'word' });

@Injectable({ providedIn: 'root' })
export class Speech {
  private readonly document = inject(DOCUMENT);
  private readonly browser = isPlatformBrowser(inject(PLATFORM_ID));
  private readonly prefs = inject(Prefs);
  private readonly output = inject(AudioOutput);
  private outputReady: Promise<void> | null = null;
  private fragments: Fragment[] = [];
  private generation = 0;
  private timer?: number;
  private audio?: HTMLAudioElement;
  private utterance?: SpeechSynthesisUtterance;
  private completion?: (completed: boolean) => void;
  readonly speaking = signal<string | null>(null);
  readonly scope = signal<SpeechScope | null>(null);
  readonly cursor = signal<Cursor | null>(null);
  readonly message = signal('');
  readonly playing = computed(() => this.speaking() !== null);

  constructor() {
    // Firefox loads its voice list asynchronously on the first query.
    if (this.browser) window.speechSynthesis?.getVoices();
    inject(DestroyRef).onDestroy(() => this.stop());
  }

  get available(): boolean {
    return this.hasSynthesis && this.prefs.sound();
  }

  private get hasSynthesis(): boolean {
    return this.browser && typeof window.speechSynthesis !== 'undefined' &&
      typeof window.SpeechSynthesisUtterance === 'function';
  }

  playPage(): boolean {
    const elements = this.document.querySelectorAll<HTMLElement>('main [data-read], .scenario-support [data-read], .public-actions [data-read]');
    return this.play(Array.from(elements).filter((element) =>
      !element.closest('[data-card-only]') && (element.checkVisibility?.() ?? true)).map((element) => ({
      element, text: element.dataset['read'] ?? '', audio: element.dataset['recording'],
      audioFrom: Number(element.dataset['recordingFrom']) || 0,
      audioTo: Number(element.dataset['recordingTo']) || 1,
    })), 'page');
  }

  playCard(card: HTMLElement): boolean {
    return this.play(Array.from(card.querySelectorAll<HTMLElement>('[data-read]'), (element) => ({
      element, text: element.dataset['read'] ?? '', audio: element.dataset['recording'],
      audioFrom: Number(element.dataset['recordingFrom']) || 0,
      audioTo: Number(element.dataset['recordingTo']) || 1,
    })), 'card');
  }

  playPrompt(root: HTMLElement, instruction = ''): Promise<boolean> {
    if (!this.prefs.sound()) return Promise.resolve(true);
    const parts: Fragment[] = Array.from(root.querySelectorAll<HTMLElement>('[data-read]'), (element) => ({
      element, text: element.dataset['read'] ?? '', audio: element.dataset['recording'],
      audioFrom: Number(element.dataset['recordingFrom']) || 0,
      audioTo: Number(element.dataset['recordingTo']) || 1,
    }));
    if (instruction) parts.push({ text: instruction });
    return new Promise((resolve) => {
      if (!this.play(parts, 'text', resolve)) resolve(false);
    });
  }

  toggle(text: string): void {
    if (this.speaking() === text) this.stop();
    else this.play([{ text }], 'text');
  }

  playSample(text: string, url?: string | null, range?: { from: number; to: number } | null, onError?: () => void): boolean {
    return this.play([{ text, audio: url ?? undefined, audioFrom: range?.from, audioTo: range?.to, onError }], 'sample');
  }

  restart(): void {
    const scope = this.scope();
    const completion = this.completion;
    this.completion = undefined;
    if (scope) this.start(scope, completion);
  }

  stop(): void {
    this.clear();
    this.fragments = [];
  }

  private clear(): void {
    const completion = this.completion;
    this.completion = undefined;
    completion?.(false);
    this.generation += 1;
    if (this.browser) {
      window.clearInterval(this.timer);
      if (this.audio) {
        this.releaseAudio(this.audio);
        this.audio = undefined;
      }
      if (this.utterance) window.speechSynthesis?.cancel();
      this.output.stop();
    }
    this.outputReady = null;
    this.utterance = undefined;
    this.cursor.set(null);
    this.speaking.set(null);
    this.scope.set(null);
    this.message.set('');
  }

  private play(parts: Fragment[], scope: SpeechScope, completion?: (completed: boolean) => void): boolean {
    if (!this.browser || (!this.prefs.sound() && scope !== 'sample')) {
      this.stop();
      this.message.set('Озвучка выключена. Её можно включить в настройках.');
      return false;
    }
    this.fragments = parts.filter((part) => part.text.trim() || part.audio).flatMap((part) =>
      part.audio ? [part] : Array.from(sentences.segment(part.text), (sentence) => ({
        ...part, text: sentence.segment, start: sentence.index,
      })),
    );
    if (!this.fragments.length) return false;
    this.start(scope, completion);
    return true;
  }

  private start(scope: SpeechScope, completion?: (completed: boolean) => void): void {
    this.clear();
    this.completion = completion;
    this.outputReady = this.output.prepare();
    this.scope.set(scope);
    this.read(0, this.generation);
  }

  private read(index: number, current: number): void {
    if (current !== this.generation) return;
    const part = this.fragments[index];
    if (!part) {
      this.cursor.set(null);
      this.speaking.set(null);
      this.scope.set(null);
      this.output.stop();
      this.outputReady = null;
      const completion = this.completion;
      this.completion = undefined;
      completion?.(true);
      return;
    }
    this.speaking.set(part.text);
    this.cursor.set(null);
    let lastOffset = -1;
    const update = (position: number) => {
      const offset = Math.max(0, Math.min(position, part.text.length - 1));
      if (offset === lastOffset) return;
      lastOffset = offset;
      this.cursor.set({ element: part.element, offset: (part.start ?? 0) + offset });
    };
    this.reveal(part.element);
    const started = performance.now();
    let baseOffset = 0;
    let baseTime = started;
    let rangeEnd = part.text.length;
    let rate = 82;
    let finished = false;
    const next = () => {
      if (finished || current !== this.generation) return;
      finished = true;
      window.clearInterval(this.timer);
      this.audio = undefined;
      this.utterance = undefined;
      this.read(index + 1, current);
    };
    const fail = () => {
      if (finished || current !== this.generation) return;
      this.stop();
      this.message.set('Озвучка недоступна. Можно продолжить без звука.');
      part.onError?.();
    };
    const startClock = () => {
      window.clearInterval(this.timer);
      this.timer = window.setInterval(() => {
        if (current !== this.generation || finished) return;
        if (this.audio && Number.isFinite(this.audio.duration) && this.audio.duration > 0) {
          const from = part.audioFrom ?? 0;
          const to = part.audioTo ?? 1;
          const progress = this.audio.currentTime / this.audio.duration;
          if (to < 1 && progress >= to) {
            this.audio.pause();
            next();
            return;
          }
          update(Math.floor((progress - from) / (to - from) * part.text.length));
        } else {
          update(Math.min(rangeEnd - 1, baseOffset + Math.floor((performance.now() - baseTime) / rate)));
        }
      }, 48);
    };

    const synthesize = () => {
      if (finished || current !== this.generation) return;
      if (!part.text.trim() || !this.hasSynthesis) {
        fail();
        return;
      }
      const utterance = new SpeechSynthesisUtterance(part.text);
      utterance.lang = 'ru-RU';
      utterance.rate = 0.88;
      const chosen = window.speechSynthesis.getVoices().find((v) => /^ru\b/i.test(v.lang) && v.localService);
      if (chosen) utterance.voice = chosen;
      utterance.onstart = () => {
        if (current !== this.generation) return;
        baseTime = performance.now();
        update(baseOffset);
        startClock();
      };
      utterance.onboundary = (event) => {
        if (finished || current !== this.generation || (event.name && event.name !== 'word')) return;
        const now = performance.now();
        const offset = event.charIndex;
        if (offset > baseOffset) rate = Math.max(38, Math.min(240, (now - baseTime) / (offset - baseOffset)));
        baseOffset = offset;
        baseTime = now;
        const word = words.segment(part.text).containing(offset);
        rangeEnd = Math.min(part.text.length, offset + (event.charLength ||
          (word ? word.index + word.segment.length - offset : 1)));
        update(offset);
      };
      utterance.onend = next;
      utterance.onerror = fail;
      const speak = () => {
        if (finished || current !== this.generation) return;
        try {
          this.utterance = utterance;
          window.speechSynthesis.speak(utterance);
        } catch {
          fail();
        }
      };
      if (this.outputReady) void this.outputReady.then(speak);
      else speak();
    };

    if (part.audio) {
      const audio = new Audio(part.audio);
      const from = part.audioFrom ?? 0;
      const to = part.audioTo ?? 1;
      this.audio = audio;
      audio.preload = 'auto';
      let positioned = from === 0;
      let seekPending = false;
      let requested = false;
      const fallback = () => {
        if (finished || current !== this.generation || this.audio !== audio) return;
        this.audio = undefined;
        this.releaseAudio(audio);
        window.clearInterval(this.timer);
        if (this.scope() === 'sample') fail();
        else synthesize();
      };
      const play = () => {
        if (finished || current !== this.generation || this.audio !== audio) return;
        void audio.play().catch(fallback);
      };
      const ready = () => {
        if (finished || current !== this.generation || this.audio !== audio || requested) return;
        if (audio.readyState < 1) return;
        if ((from > 0 || to < 1) && (!Number.isFinite(audio.duration) || audio.duration <= 0 || from >= to)) {
          fallback();
          return;
        }
        if (!positioned) {
          positioned = true;
          seekPending = true;
          try { audio.currentTime = audio.duration * from; } catch { fallback(); }
          return;
        }
        if (seekPending || audio.seeking || audio.readyState < 3) return;
        requested = true;
        if (this.outputReady) void this.outputReady.then(play);
        else play();
      };
      audio.onloadedmetadata = ready;
      audio.oncanplay = ready;
      audio.onseeked = () => { seekPending = false; ready(); };
      audio.onplaying = () => {
        if (current === this.generation && this.audio === audio) {
          if (lastOffset < 0) update(0);
          startClock();
        }
      };
      audio.onended = next;
      audio.onerror = fallback;
      audio.load();
      ready();
      return;
    }
    synthesize();
  }

  private releaseAudio(audio: HTMLAudioElement): void {
    audio.onloadedmetadata = audio.oncanplay = audio.onseeked = audio.onplaying = audio.onended = audio.onerror = null;
    audio.pause();
  }

  private reveal(element?: HTMLElement): void {
    const viewport = element?.closest<HTMLElement>('.app__main');
    if (!element || !viewport) return;
    const area = viewport.getBoundingClientRect();
    const item = element.getBoundingClientRect();
    const delta = item.top < area.top ? item.top - area.top - 12
      : item.bottom > area.bottom ? item.bottom - area.bottom + 12 : 0;
    if (delta) viewport.scrollBy({ top: delta, behavior: 'instant' });
  }
}
