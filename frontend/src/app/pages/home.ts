import { Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AUDIENCES, Api } from '../core/api';
import { Picto, Chevron } from '../ui/picto';
import { Listen } from '../ui/listen';
import { StaffLink } from '../ui/staff-link';

@Component({
  imports: [RouterLink, Picto, Chevron, Listen, StaffLink],
  template: `
    <div class="page stack-lg">
      <section class="card card--tint stack">
        <h1>Здравствуйте!</h1>
        <p class="body-text">{{ welcome() }}</p>
        <twc-listen [text]="'Здравствуйте! ' + welcome()" />
      </section>

      <section class="stack">
        <h2 id="who">Для кого нужна помощь?</h2>
        <div class="stack" role="list" aria-labelledby="who">
          @for (a of audiences; track a.key) {
            <a class="tile tile--{{ a.key }}" role="listitem" [routerLink]="['/', a.key]">
              <span class="tile__icon"><twc-picto [key]="a.key" /></span>
              <span class="tile__label"
                >{{ a.label }}<span class="tile__hint">{{ a.hint }}</span></span
              >
              <twc-chevron />
            </a>
          }
        </div>
      </section>

      <a class="btn btn--primary btn--block" routerLink="/help">
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
          aria-hidden="true"
        >
          <path d="M4 5h16v11H9l-5 4z" />
        </svg>
        Связаться с сотрудником
      </a>

      <twc-staff-link />
    </div>
  `,
})
export class Home {
  private readonly api = inject(Api);
  protected readonly audiences = AUDIENCES;
  private readonly settings = this.api.settings();
  /** Текст из настроек может начинаться с приветствия, которое уже есть в заголовке. */
  protected readonly welcome = computed(() =>
    (
      this.settings.value()['welcome_text'] ||
      'Я помогу найти нужную информацию и связаться с «Колибри».'
    )
      .replace(/^здравствуйте!?\s*/i, '')
      .replace(/^./, (c) => c.toUpperCase()),
  );
}
