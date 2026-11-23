import { Component, inject } from '@angular/core';
import { Prefs, TextSize } from '../core/prefs';
import { Speech } from '../core/speech';
import { Spoken } from './spoken';

@Component({
  selector: 'twc-preferences',
  imports: [Spoken],
  template: `
    <fieldset class="pref-group">
      <legend><twc-spoken text="Озвучка" recording="/kolibri/system-audio/settings-voice.mp3" /></legend>
      <div class="seg">
        <button type="button" class="btn btn--secondary" [attr.aria-pressed]="prefs.sound()" (click)="setSound(true)"><twc-spoken text="Включена" systemButton /></button>
        <button type="button" class="btn btn--secondary" [attr.aria-pressed]="!prefs.sound()" (click)="setSound(false)"><twc-spoken text="Выключена" systemButton /></button>
      </div>
    </fieldset>
    <fieldset class="pref-group">
      <legend><twc-spoken text="Размер букв" recording="/kolibri/system-audio/settings-text-size.mp3" /></legend>
      <div class="seg">
        @for (size of sizes; track size.key) {
          <button type="button" class="btn btn--secondary" [attr.aria-pressed]="prefs.textSize() === size.key" (click)="prefs.textSize.set(size.key)"><twc-spoken [text]="size.label" systemButton /></button>
        }
      </div>
    </fieldset>
    <fieldset class="pref-group">
      <legend><twc-spoken text="Фон экрана" recording="/kolibri/system-audio/settings-background.mp3" /></legend>
      <div class="seg">
        <button type="button" class="btn btn--secondary" [attr.aria-pressed]="!prefs.warm()" (click)="prefs.warm.set(false)"><twc-spoken text="Светлый" systemButton /></button>
        <button type="button" class="btn btn--secondary" [attr.aria-pressed]="prefs.warm()" (click)="prefs.warm.set(true)"><twc-spoken text="Тёплый" systemButton /></button>
      </div>
    </fieldset>
  `,
})
export class PreferencesControls {
  protected readonly prefs = inject(Prefs);
  private readonly speech = inject(Speech);
  protected readonly sizes: { key: TextSize; label: string }[] = [
    { key: 'md', label: 'Обычный' }, { key: 'lg', label: 'Крупный' }, { key: 'xl', label: 'Очень крупный' },
  ];

  protected setSound(value: boolean): void {
    this.speech.stop();
    this.prefs.sound.set(value);
  }
}
