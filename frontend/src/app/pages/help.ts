import { Component, DestroyRef, computed, effect, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { InstructionApi } from '../core/instruction-api';
import { NavState } from '../core/nav';
import { localId } from '../core/local-id';
import { Speech } from '../core/speech';
import { publicReturn } from '../core/return-path';
import { ActionDockTemplate } from '../ui/action-dock';
import { Spoken } from '../ui/spoken';
import { ReadCard } from '../ui/read-card';
import { ReadFragment } from '../ui/read-fragment';
import { Picto } from '../ui/picto';

type Phase = 'choose' | 'number' | 'review' | 'sending' | 'failed' | 'received';

function normalizePhone(value: string): string | null {
  if (!/^[+\d()\s-]+$/.test(value)) return null;
  const digits = value.replace(/\D/g, '');
  if (value.trim().startsWith('+')) return /^[1-9]\d{9,14}$/.test(digits) ? '+' + digits : null;
  if (digits.length === 10) return '+7' + digits;
  if (digits.length === 11 && /^[78]/.test(digits)) return '+7' + digits.slice(1);
  return null;
}

@Component({
  imports: [RouterLink, ReactiveFormsModule, ActionDockTemplate, Spoken, ReadCard, ReadFragment, Picto],
  template: `
    <div class="page stack" [class.page--scroll]="phase() === 'number' || phase() === 'review'">
      @switch (phase()) {
        @case ('choose') {
          <h1><twc-spoken text="Как вам помочь?" recording="/kolibri/system-audio/help-title.mp3" /></h1>
          <div class="sound-card">
            <button type="button" class="tile" (click)="phase.set('number')">
              <span class="tile__icon"><twc-picto key="phone" /></span>
              <span class="tile__label"><twc-spoken text="Позвоните мне" systemButton />
                <span class="tile__hint"><twc-spoken text="Оставить номер для обратного звонка" systemText /></span>
              </span>
            </button>
            <twc-card-sound label="Позвоните мне" />
          </div>
        }
        @case ('number') {
          <h1><twc-spoken text="На какой номер вам позвонить?" recording="/kolibri/system-audio/callback-phone-title.mp3" /></h1>
          <label class="field">
            <span><twc-spoken text="Номер телефона" recording="/kolibri/system-audio/callback-phone-field.mp3" /></span>
            <input class="input" type="tel" inputmode="tel" autocomplete="tel" placeholder="+7" maxlength="30"
              [formControl]="phone" [attr.aria-invalid]="formError() ? 'true' : null"
              [attr.aria-describedby]="formError() ? 'phone-hint phone-error' : 'phone-hint'" />
          </label>
          <p id="phone-hint"><twc-spoken text="Введите свой номер телефона."
            recording="/kolibri/system-audio/callback-phone-hint.mp3" /></p>
          @if (formError()) {
            <div class="sound-fragment error" role="alert">
              <p id="phone-error"><twc-spoken [text]="formError()" systemText /></p>
              <twc-fragment-sound label="Прослушать ошибку номера телефона" />
            </div>
          }
        }
        @case ('review') {
          <h1><twc-spoken text="Передать номер сотруднику?" recording="/kolibri/system-audio/callback-confirm-title.mp3" /></h1>
          <div class="card stack">
            <p>{{ number() }}</p>
            <p><twc-spoken text="Сотрудник «Колибри» получит ваш номер и просьбу перезвонить."
              recording="/kolibri/system-audio/callback-confirm-description.mp3" /></p>
          </div>
          <button type="button" class="btn btn--secondary" (click)="phase.set('number')"><twc-spoken text="Исправить номер" systemButton /></button>
        }
        @case ('sending') {
          <h1><twc-spoken text="Отправляем заявку" recording="/kolibri/system-audio/callback-sending.mp3" /></h1>
          <p role="status">Подождите немного.</p>
        }
        @case ('failed') {
          <h1><twc-spoken text="Заявка не отправлена" recording="/kolibri/system-audio/callback-failed.mp3" /></h1>
          <p role="alert"><twc-spoken text="Ваш номер сохранился. Попробуйте отправить заявку ещё раз."
            recording="/kolibri/system-audio/callback-retry-description.mp3" /></p>
        }
        @case ('received') {
          @if (demo()) {
            <h1><twc-spoken text="Учебная заявка сохранена" systemText /></h1>
            <p><twc-spoken text="Это демонстрация. Сотруднику заявка не отправлена." /></p>
          } @else {
            <h1><twc-spoken text="Заявка отправлена" recording="/kolibri/system-audio/request-sent.mp3" /></h1>
            <p><twc-spoken text="Сотрудник получил просьбу перезвонить."
              recording="/kolibri/system-audio/callback-received-description.mp3" /></p>
          }
        }
      }
    </div>
    <ng-template twcActions>
      @switch (phase()) {
        @case ('number') {
          <button type="button" class="btn btn--primary btn--block" (click)="review()"><twc-spoken text="Проверить номер" systemButton /></button>
        }
        @case ('review') {
          <button type="button" class="btn btn--primary btn--block" (click)="send()"><twc-spoken text="Да, передать номер" systemButton /></button>
          <a class="btn btn--ghost btn--block" [routerLink]="returnUrl()"><twc-spoken text="Отменить обращение" systemButton /></a>
        }
        @case ('failed') {
          <button type="button" class="btn btn--primary btn--block" (click)="send()"><twc-spoken text="Попробовать ещё раз" systemButton /></button>
          @if (returnToInstruction()) {
            <a class="btn btn--ghost btn--block" [routerLink]="returnUrl()"><twc-spoken text="Вернуться к инструкции" systemButton /></a>
          }
        }
        @case ('received') {
          @if (returnToInstruction()) {
            <a class="btn btn--primary btn--block prominent" [routerLink]="returnUrl()"><twc-spoken text="Вернуться к инструкции" systemButton /></a>
          }
        }
        @case ('choose') {
          @if (returnToInstruction()) {
            <a class="btn btn--ghost btn--block" [routerLink]="returnUrl()"><twc-spoken text="Вернуться к инструкции" systemButton /></a>
          }
        }
      }
    </ng-template>
  `,
})
export class Help {
  private readonly api = inject(InstructionApi);
  private readonly nav = inject(NavState);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly query = toSignal(this.route.queryParamMap, { initialValue: this.route.snapshot.queryParamMap });
  protected readonly returnPath = computed(() => publicReturn(this.query().get('return')));
  protected readonly returnUrl = computed(() => this.router.parseUrl(this.returnPath()));
  protected readonly returnToInstruction = computed(() => this.returnPath().startsWith('/instructions/'));
  protected readonly phase = signal<Phase>('choose');
  protected readonly phone = new FormControl('', { nonNullable: true });
  protected readonly number = signal('');
  protected readonly formError = signal('');
  protected readonly demo = signal(false);
  private key = '';

  constructor() {
    const speech = inject(Speech);
    effect(() => { this.phase(); speech.stop(); });
    const back = () => {
      switch (this.phase()) {
        case 'number': this.phase.set('choose'); break;
        case 'review': this.phase.set('number'); break;
        case 'failed': this.phase.set('review'); break;
        case 'sending': break;
        default: void this.router.navigateByUrl(this.returnPath());
      }
    };
    this.nav.backAction.set(back);
    inject(DestroyRef).onDestroy(() => {
      if (this.nav.backAction() === back) this.nav.backAction.set(null);
    });
  }

  protected review(): void {
    const normalized = normalizePhone(this.phone.value);
    if (!normalized) {
      this.formError.set('Проверьте цифры. Номер остался в поле.');
      return;
    }
    this.formError.set('');
    if (normalized !== this.number()) this.key = '';
    this.number.set(normalized);
    this.phase.set('review');
  }

  protected send(): void {
    if (this.phase() !== 'review' && this.phase() !== 'failed') return;
    this.phase.set('sending');
    this.key ||= localId();
    this.api.callback({ phone: this.number(), consent: true, idempotency_key: this.key }).subscribe({
      next: (receipt) => {
        this.demo.set(receipt.demo === true);
        this.phase.set('received');
      },
      error: () => this.phase.set('failed'),
    });
  }
}
