import { Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Api } from '../core/api';
import { Listen } from '../ui/listen';
import { StaffLink } from '../ui/staff-link';

@Component({
  imports: [RouterLink, Listen, StaffLink],
  template: `
    <div class="page stack-lg">
      <section class="stack">
        <h1>Помощь</h1>
        <twc-listen [text]="spoken()" />
      </section>

      <section class="card card--blue stack">
        <h2>Связаться с сотрудником</h2>
        @if (coordinator()) {
          <p>
            <strong>{{ coordinator() }}</strong>
          </p>
        } @else {
          <p>Оставьте заявку, и сотрудник «Колибри» свяжется с вами сам.</p>
        }
        <a class="btn btn--primary btn--block" routerLink="/consult">Оставить заявку</a>
      </section>

      <section class="card card--sage stack">
        <h2>Как пользоваться</h2>
        <ol style="margin:0;padding-left:1.3rem">
          <li>На главной выберите, для кого нужна помощь.</li>
          <li>Нажмите на тему. Откроется список вопросов.</li>
          <li>Нажмите на вопрос. Появится ответ.</li>
          <li>Кнопка «Назад» внизу возвращает на шаг назад. «К темам» открывает список тем.</li>
          <li>Кнопка «Прослушать» читает текст вслух. Звук можно выключить в настройках.</li>
        </ol>
      </section>

      <section class="card stack">
        <h2>Если вам трудно</h2>
        <p>
          Можно попросить близкого человека помочь с формой или настройками. Можно вернуться на
          главную и начать заново.
        </p>
        <a class="btn btn--secondary btn--block" routerLink="/">На главную</a>
      </section>

      <twc-staff-link />
    </div>
  `,
})
export class Help {
  private readonly settings = inject(Api).settings();
  protected readonly coordinator = computed(
    () => this.settings.value()['coordinator_contact'] || '',
  );
  protected readonly spoken = computed(() =>
    [
      'Помощь.',
      this.coordinator()
        ? `Связаться с сотрудником: ${this.coordinator()}.`
        : 'Оставьте заявку, и сотрудник свяжется с вами.',
      'На главной выберите, для кого нужна помощь. Нажмите на тему, затем на вопрос. Кнопка Назад возвращает на шаг назад.',
    ].join(' '),
  );
}
