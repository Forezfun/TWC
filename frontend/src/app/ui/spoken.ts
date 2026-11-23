import { Component, ElementRef, booleanAttribute, computed, inject, input } from '@angular/core';
import { Speech } from '../core/speech';
import buttonRecordings from './system-button-recordings.json';
import textRecordings from './system-text-recordings.json';

const sentences = new Intl.Segmenter('ru', { granularity: 'sentence' });
const words = new Intl.Segmenter('ru', { granularity: 'word' });
const recordingsByLabel = new Map(Object.entries(buttonRecordings));
const recordingsByText = new Map(Object.entries(textRecordings));

@Component({
  selector: 'twc-spoken',
  host: {
    '[attr.data-read]': 'text()',
    '[attr.data-recording]': 'audioUrl()',
    '[attr.data-recording-from]': 'recordingRange()?.from',
    '[attr.data-recording-to]': 'recordingRange()?.to',
  },
  template: `
    @for (sentence of parts(); track sentence.index) {
      <span class="sentence" [class.reading]="active()?.sentence === sentence.index">@for (word of sentence.words; track word.index) {
        <span class="word" [class.reading]="word.isWordLike && active()?.word === sentence.index + word.index">{{ word.segment }}</span>
      }</span>
    }
  `,
  styles: `
    .sentence, .word { color: inherit; background: transparent; border-radius: 3px; box-decoration-break: clone; }
    .sentence.reading { background-color: #f7edca; color: #233c4a; }
    .word.reading { background-color: #ebce80; color: #233c4a; box-shadow: inset 0 -1px #98722d; }
    @media (prefers-reduced-motion: no-preference) {
      .sentence, .word { transition: background-color 210ms ease, color 210ms ease, box-shadow 210ms ease !important; }
    }
  `,
})
export class Spoken {
  readonly text = input.required<string>();
  readonly recording = input<string | null>(null);
  readonly systemButton = input(false, { transform: booleanAttribute });
  readonly systemText = input(false, { transform: booleanAttribute });
  readonly recordingRange = input<{ from: number; to: number } | null>(null);
  private readonly element = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly speech = inject(Speech);
  protected readonly audioUrl = computed(() => {
    if (this.recording()) return this.recording();
    const button = this.systemButton() ? recordingsByLabel.get(this.text()) : undefined;
    if (button) return `/kolibri/system-audio/buttons/${button}.mp3?v=2`;
    const text = this.systemText() ? recordingsByText.get(this.text()) : undefined;
    return text ? `/kolibri/system-audio/${text}.mp3` : null;
  });
  protected readonly parts = computed(() => Array.from(sentences.segment(this.text()), (sentence) => ({
    index: sentence.index,
    end: sentence.index + sentence.segment.length,
    words: Array.from(words.segment(sentence.segment)),
  })));
  protected readonly active = computed(() => {
    const cursor = this.speech.cursor();
    if (cursor?.element !== this.element.nativeElement) return null;
    const sentence = this.parts().find((part) => cursor.offset >= part.index && cursor.offset < part.end);
    if (!sentence) return null;
    const relative = cursor.offset - sentence.index;
    let word = -1;
    for (const part of sentence.words) {
      if (part.index > relative) break;
      if (part.isWordLike) word = sentence.index + part.index;
    }
    return { sentence: sentence.index, word };
  });
}
