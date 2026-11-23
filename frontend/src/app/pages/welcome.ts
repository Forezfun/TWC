import { NgOptimizedImage } from '@angular/common';
import { Component, DestroyRef, afterEveryRender, computed, effect, inject, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { NavState } from '../core/nav';
import { Prefs } from '../core/prefs';
import { Speech } from '../core/speech';
import { ActionDockTemplate } from '../ui/action-dock';
import { Picto } from '../ui/picto';
import { PreferencesControls } from '../ui/preferences';
import { ReadCard } from '../ui/read-card';
import { Spoken } from '../ui/spoken';

type Stage = 'start' | 'card' | 'sound' | 'silent' | 'setup';

@Component({
  imports: [ NgOptimizedImage, Spoken, ReadCard, Picto, PreferencesControls, ActionDockTemplate],
  styles: `
    .intro-pictogram { display: block; inline-size: min(100%, clamp(112px, 24dvh, 200px));
      block-size: auto; margin-inline: auto; }
    .sound-guide { display: flex; align-items: center; justify-content: center; gap: clamp(12px, 4vw, 32px); margin-block: 20px; }
    .sound-guide img { inline-size: clamp(72px, 19dvh, 132px); block-size: auto; object-fit: contain; }
    .sound-guide svg { flex: none; inline-size: clamp(32px, 8vw, 58px); color: var(--primary); }
  `,
  template: `
    <div class="page stack" [class.page--scroll]="stage() === 'setup' || stage() === 'start'"
      [class.intro-hint]="introHint()" [class.card-hint]="cardHint()">
      @switch (stage()) {
        @case ('start') {
          <h1><twc-spoken text="Помощь шаг за шагом" recording="/kolibri/system-audio/intro-title.mp3" /></h1>
          <p><twc-spoken text="Кнопка «Прослушать страницу» озвучивает эту страницу. Во время озвучки можно остановиться или начать сначала."
            recording="/kolibri/system-audio/intro-play-page.mp3" /></p>
          <img ngSrc="/kolibri/intro-help.png" width="500" height="500" priority class="intro-pictogram" alt="" />
          @if (prefs.sound() && !prefs.onboarded()) {
            <button type="button" class="btn btn--ghost btn--block" (click)="withoutAudio()">Продолжить без озвучки</button>
          }
        }
        @case ('card') {
          <div class="training-caption">
            <h1><twc-spoken text="Послушайте одну карточку" recording="/kolibri/system-audio/intro-card-title.mp3" /></h1>
            <p><twc-spoken text="Нажмите на маленький динамик рядом с карточкой."
              recording="/kolibri/system-audio/intro-card-speaker.mp3" /></p>
          </div>
          <div class="training-card stack">
            <div class="sound-card" data-card-only>
              <div class="tile">
                <span class="tile__icon"><twc-picto key="doc" /></span>
                <span class="tile__label">
                  <twc-spoken text="Привет!" recording="/kolibri/system-audio/intro-card-hello.mp3" />
                  <span class="tile__hint"><twc-spoken text="Это учебная карточка."
                    recording="/kolibri/system-audio/intro-card-description.mp3" /></span>
                </span>
              </div>
              <twc-card-sound label="Привет!" />
            </div>
          </div>
          <p class="training-caption"><twc-spoken text="Динамик читает текст этой карточки."
            recording="/kolibri/system-audio/intro-card-explanation.mp3" /></p>
        }
        @case ('sound') {
          <h1><twc-spoken text="Слышно?" recording="/kolibri/system-audio/intro-sound-title.mp3" /></h1>
          <p><twc-spoken text="Если звук не слышно, прибавьте громкость на устройстве."
            recording="/kolibri/system-audio/intro-sound-volume.mp3" /></p>
          <div class="sound-guide" role="img" aria-label="Звука нет. Увеличьте громкость на устройстве.">
            <img ngSrc="/kolibri/pictograms/arasaac/38214.png" width="300" height="300" alt="" />
            <svg viewBox="0 0 64 32" fill="none" stroke="currentColor" stroke-width="4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 16h52M44 4l12 12-12 12" /></svg>
            <img ngSrc="/kolibri/pictograms/phone-volume-up.png" width="1254" height="1254" alt="" />
          </div>
          @if (!prefs.onboarded()) {
            <button type="button" class="btn btn--ghost btn--block" (click)="withoutAudio()">Продолжить без озвучки</button>
          }
        }
        @case ('silent') {
          <div class="notice-window" role="status">
            <h1><twc-spoken text="Озвучка выключена" /></h1>
            <p><twc-spoken text="Её можно включить в настройках в любой момент." /></p>
          </div>
        }
        @case ('setup') {
          <h1><twc-spoken text="Настройте «Колибри»" recording="/kolibri/system-audio/intro-setup-title.mp3" /></h1>
          <p><twc-spoken text="Выберите, как вам удобнее пользоваться помощником."
            recording="/kolibri/system-audio/intro-setup-description.mp3" /></p>
          <twc-preferences />
        }
      }
    </div>
    <ng-template twcActions>
      @switch (stage()) {
        @case ('start') {
          <button type="button" class="btn btn--primary btn--block" (click)="go(prefs.sound() ? 'sound' : 'silent')"><twc-spoken text="Дальше" systemButton /></button>
        }
        @case ('card') {
          <button type="button" class="btn btn--primary btn--block" (click)="continueToSetup()"><twc-spoken text="Дальше" systemButton /></button>
        }
        @case ('sound') {
          <button type="button" class="btn btn--primary btn--block" (click)="go('card')"><twc-spoken text="Да, слышно" systemButton /></button>
        }
        @case ('silent') {
          <button type="button" class="btn btn--primary btn--block" (click)="continueToSetup()"><twc-spoken text="Продолжить" systemButton /></button>
        }
        @case ('setup') {
          <button type="button" class="btn btn--primary btn--block" (click)="finish()"><twc-spoken text="Готово" systemButton /></button>
        }
      }
    </ng-template>
  `,
})
export class Welcome {
  protected readonly stage = signal<Stage>('start');
  protected readonly prefs = inject(Prefs);
  private readonly router = inject(Router);
  private readonly nav = inject(NavState);
  private readonly speech = inject(Speech);
  private readonly route = inject(ActivatedRoute);
  private readonly quietFrom = signal<Stage>('start');
  private readonly setupFrom = signal<Stage>('sound');
  private readonly hintTaken = signal(false);
  private readonly awaitingPage = signal(false);
  private introRead = false;

  protected readonly introHint = computed(() => this.stage() === 'start' && this.prefs.sound()
    && !this.speech.playing() && !this.hintTaken());
  protected readonly cardHint = computed(() => this.stage() === 'card' && this.prefs.sound()
    && !this.awaitingPage() && !this.speech.playing() && !this.hintTaken());

  constructor() {
    effect((cleanup) => {
      const stage = this.stage();
      if (stage === 'start') return;
      const back = () => {
        const previous: Record<Exclude<Stage, 'start'>, Stage> = {
          card: 'sound', sound: 'start', silent: this.quietFrom(), setup: this.setupFrom(),
        };
        this.go(previous[stage], false);
      };
      this.nav.backAction.set(back);
      cleanup(() => { if (this.nav.backAction() === back) this.nav.backAction.set(null); });
    });
    effect(() => {
      if (!this.speech.playing()) return;
      if (this.stage() === 'start' && this.speech.scope() === 'page') {
        this.introRead = true;
        this.hintTaken.set(true);
      } else if (this.stage() === 'card' && this.speech.scope() === 'card') {
        this.hintTaken.set(true);
      }
    });
    afterEveryRender(() => {
      if (this.awaitingPage()) {
        this.speech.playPage();
        this.awaitingPage.set(false);
      }
    });
    // Сохранённые настройки применяются после гидратации.
    afterEveryRender(() => {
      if (this.prefs.onboarded() && this.route.snapshot.routeConfig?.path === '' && this.stage() === 'start') {
        void this.router.navigate(['/sections'], { replaceUrl: true });
      }
    });
  }

  protected go(stage: Stage, auto = true): void {
    const previous = this.stage();
    if (stage === 'setup') this.setupFrom.set(previous);
    this.speech.stop();
    this.hintTaken.set(false);
    this.awaitingPage.set(stage === 'card' && auto && previous === 'sound' && this.introRead && this.prefs.sound());
    this.stage.set(stage);
    if (stage === 'start') this.introRead = false;
  }

  protected withoutAudio(): void {
    if (this.prefs.onboarded()) return;
    this.quietFrom.set(this.stage());
    this.prefs.sound.set(false);
    this.go('silent');
  }

  protected continueToSetup(): void {
    if (this.prefs.onboarded()) this.finish();
    else this.go('setup');
  }

  protected finish(): void {
    this.prefs.onboarded.set(true);
    void this.router.navigate(['/sections']);
  }
}
