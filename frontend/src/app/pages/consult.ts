import { Component, computed, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { toSignal } from '@angular/core/rxjs-interop';
import { map } from 'rxjs';
import {
  AUDIENCES,
  Api,
  Audience,
  RequestResult,
  Slot,
  audienceLabel,
  isAudience,
} from '../core/api';
import { Listen } from '../ui/listen';

type Step = 'form' | 'confirm' | 'done';

/**
 * Запись на консультацию в три шага: форма → проверка данных → подтверждение.
 * Перед отправкой показываем данные (правило 1 AutismGuide), при ошибке данные не теряются.
 */
@Component({
  imports: [ReactiveFormsModule, RouterLink, DatePipe, Listen],
  template: `
    <div class="page stack-lg">
      @switch (step()) {
        @case ('form') {
          <section class="stack">
            <h1>Запись на консультацию</h1>
            <p>Заполните форму. Сотрудник «Колибри» свяжется с вами и подтвердит время.</p>
            <twc-listen
              text="Запись на консультацию. Заполните форму. Сотрудник Колибри свяжется с вами и подтвердит время."
            />
          </section>

          <form class="stack-lg" [formGroup]="form" (ngSubmit)="toConfirm()" novalidate>
            <label class="field">
              <span>Как вас зовут?</span>
              <input
                class="input"
                type="text"
                formControlName="name"
                autocomplete="name"
                [attr.aria-invalid]="invalid('name')"
                aria-describedby="name-err"
              />
              @if (invalid('name')) {
                <p class="error" id="name-err">
                  Напишите имя, чтобы мы знали, как к вам обращаться.
                </p>
              }
            </label>

            <label class="field">
              <span>Как с вами связаться?</span>
              <input
                class="input"
                type="text"
                formControlName="contact"
                autocomplete="tel"
                placeholder="Телефон, Telegram или почта"
                [attr.aria-invalid]="invalid('contact')"
                aria-describedby="contact-err contact-hint"
              />
              <span class="field__hint" id="contact-hint">Например: +7 900 000-00-00 или @имя</span>
              @if (invalid('contact')) {
                <p class="error" id="contact-err">Укажите телефон, Telegram или почту.</p>
              }
            </label>

            <fieldset class="field stack" style="border:0;padding:0;margin:0">
              <legend><span>Для кого консультация?</span></legend>
              @for (a of audiences; track a.key) {
                <label class="choice"
                  ><input type="radio" formControlName="audience" [value]="a.key" />
                  {{ a.label }}</label
                >
              }
            </fieldset>

            <fieldset class="field stack" style="border:0;padding:0;margin:0">
              <legend><span>Когда вам удобно?</span></legend>
              @if (slots.isLoading()) {
                <p class="status" role="status">Смотрим свободное время…</p>
              } @else if (slots.value().length) {
                @for (s of slots.value(); track s.id) {
                  <label class="choice">
                    <input type="radio" formControlName="slot_id" [value]="s.id" />
                    {{ s.starts_at | date: 'd MMMM, EEEE' : undefined : 'ru' }} в
                    {{ s.starts_at | date: 'HH:mm' }}
                  </label>
                }
                <label class="choice"
                  ><input type="radio" formControlName="slot_id" [value]="null" /> Другое время —
                  напишу ниже</label
                >
              } @else {
                <p class="field__hint">
                  Свободных окон в календаре сейчас нет. Напишите, когда вам удобно, и координатор
                  подберёт время.
                </p>
              }
              @if (form.controls.slot_id.value === null) {
                <label class="field">
                  <span>Удобное время словами</span>
                  <input
                    class="input"
                    type="text"
                    formControlName="preferred_time"
                    placeholder="Например: будни после 18:00"
                  />
                </label>
              }
            </fieldset>

            <label class="field">
              <span
                >О чём хотите поговорить?
                <span class="field__hint" style="display:inline">(необязательно)</span></span
              >
              <textarea class="input" formControlName="comment"></textarea>
            </label>

            <button type="submit" class="btn btn--primary btn--block">Проверить данные</button>
          </form>
        }

        @case ('confirm') {
          <section class="stack">
            <h1>Проверьте данные</h1>
            <p>
              Если всё верно, нажмите «Отправить заявку». Если нужно что-то поменять, нажмите
              «Изменить».
            </p>
          </section>
          <dl class="card card--tint kv">
            <div>
              <dt>Имя</dt>
              <dd>{{ form.value.name }}</dd>
            </div>
            <div>
              <dt>Контакт</dt>
              <dd>{{ form.value.contact }}</dd>
            </div>
            <div>
              <dt>Для кого</dt>
              <dd>{{ audienceLabel(form.value.audience ?? null) || 'Не указано' }}</dd>
            </div>
            <div>
              <dt>Время</dt>
              <dd>{{ timeText() }}</dd>
            </div>
            @if (form.value.comment) {
              <div>
                <dt>Тема</dt>
                <dd>{{ form.value.comment }}</dd>
              </div>
            }
          </dl>
          @if (submitError()) {
            <div class="card card--danger" role="alert">
              <p>
                <strong>{{ submitError() }}</strong>
              </p>
              <p>Данные сохранены. Можно изменить их или попробовать отправить ещё раз.</p>
            </div>
          }
          <div class="stack">
            <button
              type="button"
              class="btn btn--primary btn--block"
              (click)="submit()"
              [disabled]="sending()"
            >
              {{ sending() ? 'Отправляем…' : 'Отправить заявку' }}
            </button>
            <button
              type="button"
              class="btn btn--secondary btn--block"
              (click)="step.set('form')"
              [disabled]="sending()"
            >
              Изменить
            </button>
          </div>
        }

        @case ('done') {
          <section class="card card--green stack" role="status">
            <h1>Заявка отправлена</h1>
            <p>
              Спасибо, {{ result()?.name }}! Сотрудник «Колибри» свяжется с вами:
              <strong>{{ result()?.contact }}</strong
              >.
            </p>
            @if (result()?.slot) {
              <p>
                Выбранное время:
                <strong>{{
                  result()!.slot!.starts_at | date: 'd MMMM, HH:mm' : undefined : 'ru'
                }}</strong
                >. Мы подтвердим его отдельно.
              </p>
            }
            <twc-listen [text]="'Заявка отправлена. Сотрудник Колибри свяжется с вами.'" />
          </section>
          <a class="btn btn--primary btn--block" routerLink="/">На главную</a>
        }
      }
    </div>
  `,
})
export class Consult {
  private readonly api = inject(Api);
  private readonly route = inject(ActivatedRoute);

  protected readonly audiences = AUDIENCES;
  protected readonly audienceLabel = audienceLabel;
  protected readonly slots = this.api.slots();

  protected readonly step = signal<Step>('form');
  protected readonly sending = signal(false);
  protected readonly submitError = signal<string | null>(null);
  protected readonly result = signal<RequestResult | null>(null);

  protected readonly form = new FormGroup({
    name: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, Validators.maxLength(120)],
    }),
    contact: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, Validators.minLength(3), Validators.maxLength(200)],
    }),
    audience: new FormControl<Audience | null>(null),
    slot_id: new FormControl<number | null>(null),
    preferred_time: new FormControl('', {
      nonNullable: true,
      validators: [Validators.maxLength(200)],
    }),
    comment: new FormControl('', { nonNullable: true }),
  });

  private readonly query = toSignal(this.route.queryParamMap.pipe(map((q) => q)), {
    initialValue: null,
  });

  protected readonly timeText = computed(() => {
    const id = this.form.value.slot_id;
    const slot = this.slots.value().find((s: Slot) => s.id === id);
    if (slot) {
      const d = new Date(slot.starts_at);
      return d.toLocaleString('ru-RU', {
        day: 'numeric',
        month: 'long',
        hour: '2-digit',
        minute: '2-digit',
      });
    }
    return this.form.value.preferred_time || 'Координатор предложит время';
  });

  constructor() {
    const q = this.route.snapshot.queryParamMap;
    const a = q.get('audience');
    if (isAudience(a)) this.form.controls.audience.setValue(a);
    const topic = q.get('topic');
    if (topic) this.form.controls.comment.setValue(topic);
  }

  protected invalid(name: 'name' | 'contact'): boolean {
    const c = this.form.controls[name];
    return c.invalid && (c.touched || c.dirty);
  }

  protected toConfirm(): void {
    this.form.markAllAsTouched();
    if (this.form.invalid) return;
    this.submitError.set(null);
    this.step.set('confirm');
  }

  protected submit(): void {
    const v = this.form.getRawValue();
    this.sending.set(true);
    this.submitError.set(null);
    this.api
      .createRequest({
        name: v.name.trim(),
        contact: v.contact.trim(),
        audience: v.audience,
        comment: v.comment.trim() || null,
        preferred_time: v.slot_id ? null : v.preferred_time.trim() || null,
        slot_id: v.slot_id,
      })
      .subscribe({
        next: (r) => {
          this.sending.set(false);
          this.result.set(r);
          this.step.set('done');
        },
        error: (e: { status?: number; error?: { detail?: string } }) => {
          this.sending.set(false);
          if (e.status === 409) {
            this.submitError.set(e.error?.detail ?? 'Это время уже занято. Выберите другое.');
            this.slots.reload();
          } else {
            this.submitError.set(
              'Не получилось отправить заявку. Проверьте интернет и попробуйте ещё раз.',
            );
          }
        },
      });
  }
}
