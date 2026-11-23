import { Component, ElementRef, inject, input } from '@angular/core';
import { Prefs } from '../core/prefs';
import { Speech } from '../core/speech';

@Component({
  selector: 'twc-fragment-sound',
  host: { '[hidden]': '!prefs.sound()' },
  template: `@if (prefs.sound()) {
    <button type="button" class="btn btn--ghost fragment-sound" [attr.aria-label]="label()" (click)="listen()">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 10v4h4l5 4V6l-5 4zM16 9a4 4 0 0 1 0 6M18.5 6.5a8 8 0 0 1 0 11" /></svg>
    </button>
  }`,
})
export class ReadFragment {
  readonly label = input.required<string>();
  protected readonly prefs = inject(Prefs);
  private readonly element = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly speech = inject(Speech);

  protected listen(): void {
    const fragment = this.element.nativeElement.closest<HTMLElement>('.sound-fragment');
    if (fragment) this.speech.playCard(fragment);
  }
}
