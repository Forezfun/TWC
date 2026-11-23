import { Component, computed, effect, inject } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { map } from 'rxjs';
import { Api, Audience, ScenarioNode, audienceLabel, indexTree, isAudience } from '../core/api';
import { NavState } from '../core/nav';
import { Speech } from '../core/speech';
import { Picto, Chevron, pictoFor } from '../ui/picto';
import { ReadCard } from '../ui/read-card';
import { Spoken } from '../ui/spoken';

@Component({
  imports: [RouterLink, Picto, Chevron, ReadCard, Spoken],
  template: `
    <div class="page stack-lg">
      @if (tree.isLoading()) {
        <p class="status" role="status">Загружаем…</p>
      } @else if (tree.error()) {
        <div class="card card--danger stack">
          <p><strong>Не удалось загрузить раздел.</strong></p>
          <p>Проверьте интернет и нажмите «Повторить».</p>
          <button type="button" class="btn btn--primary" (click)="tree.reload()"><twc-spoken text="Повторить" /></button>
        </div>
      } @else if (!node()) {
        <div class="card card--sand stack">
          <p><strong>Такого раздела нет.</strong></p>
          <a class="btn btn--primary" [routerLink]="['/', audience()]"><twc-spoken text="К списку тем" /></a>
        </div>
      } @else {
        <p class="crumb">{{ label() }}{{ parent() ? ' · ' + parent()!.title : '' }}</p>

        <section class="card stack" [class.card--tint]="node()!.kind === 'menu'">
          <h1><twc-spoken [text]="node()!.title" [recording]="node()!.body ? null : node()!.audio_url" /></h1>
          @if (node()!.image_url) {
            <img class="media" [src]="node()!.image_url" alt="" />
          }
          @if (node()!.body) {
            <p class="body-text"><twc-spoken [text]="node()!.body!" [recording]="node()!.audio_url" /></p>
          }

        </section>

        @switch (node()!.kind) {
          @case ('menu') {
            <div class="stack" role="list" aria-label="Подразделы">
              @for (c of node()!.children; track c.id) {
                <div class="sound-card" role="listitem">
                <a
                  class="tile tile--{{ c.kind }}"
                  [routerLink]="['/', audience(), c.id]"
                >
                  <span class="tile__icon">
                    @if (c.image_url) {
                      <img [src]="c.image_url" alt="" width="44" height="44" />
                    } @else {
                      <twc-picto [key]="picto(c)" />
                    }
                  </span>
                  <span class="tile__label"><twc-spoken [text]="c.title" /></span>
                  <twc-chevron />
                </a>
                <twc-card-sound [label]="c.title" />
                </div>
              } @empty {
                <div class="card card--sand">
                  <p>В этой теме пока нет материалов. Можно задать вопрос сотруднику.</p>
                </div>
                <a
                  class="btn btn--primary btn--block"
                  routerLink="/consult"
                  [queryParams]="{ audience: audience() }"
                  ><twc-spoken text="Записаться на консультацию" /></a
                >
              }
            </div>
          }
          @case ('consult') {
            <div class="card card--green stack">
              <p>
                Вы заполните короткую форму и выберете удобное время. Сотрудник «Колибри» подтвердит
                запись.
              </p>
              <a
                class="btn btn--primary btn--block"
                routerLink="/consult"
                [queryParams]="{ audience: audience() }"
                ><twc-spoken text="Выбрать время" /></a
              >
            </div>
          }
          @case ('donate') {
            <div class="card card--peach stack">
              <p class="body-text">{{ donateMessage() }}</p>
              <a
                class="btn btn--primary btn--block"
                [href]="donateUrl()"
                target="_blank"
                rel="noopener"
              >
                <twc-spoken text="Перейти к пожертвованию" />
              </a>
              <p class="field__hint">Страница откроется в новой вкладке браузера.</p>
            </div>
          }
          @case ('volunteer') {
            <div class="card card--blue stack">
              <p>
                Чтобы стать волонтёром, напишите или позвоните координатору. Он расскажет, какая
                помощь нужна сейчас.
              </p>
              @if (coordinator()) {
                <p>
                  <strong>{{ coordinator() }}</strong>
                </p>
              }
              <a
                class="btn btn--primary btn--block"
                routerLink="/consult"
                [queryParams]="{ audience: audience(), topic: 'Хочу стать волонтёром' }"
                ><twc-spoken text="Оставить заявку" /></a
              >
            </div>
          }
          @case ('link') {
            @if (node()!.link_url) {
              <a
                class="btn btn--primary btn--block"
                [href]="node()!.link_url"
                target="_blank"
                rel="noopener"
                ><twc-spoken text="Открыть страницу" /></a
              >
              <p class="field__hint">Страница откроется в новой вкладке браузера.</p>
            }
          }
          @default {
            <a
              class="btn btn--secondary btn--block"
              routerLink="/consult"
              [queryParams]="{ audience: audience(), topic: node()!.title }"
            >
              <twc-spoken text="Остались вопросы? Записаться на консультацию" />
            </a>
          }
        }
      }
    </div>
  `,
})
export class NodePage {
  private readonly api = inject(Api);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly nav = inject(NavState);
  private readonly speech = inject(Speech);

  private readonly params = toSignal(
    this.route.paramMap.pipe(
      map((p) => {
        const a = p.get('audience');
        const id = Number(p.get('id'));
        if (!isAudience(a) || !Number.isFinite(id)) {
          void this.router.navigate(['/']);
          return { audience: null, id: 0 };
        }
        return { audience: a as Audience, id };
      }),
    ),
    { initialValue: { audience: null as Audience | null, id: 0 } },
  );

  protected readonly audience = computed(() => this.params().audience);
  protected readonly tree = this.api.scenarios(this.audience);
  private readonly settings = this.api.settings();

  private readonly index = computed(() => indexTree(this.tree.hasValue() ? this.tree.value() : []));
  protected readonly node = computed<ScenarioNode | undefined>(() =>
    this.index().get(this.params().id),
  );
  protected readonly parent = computed(() => {
    const p = this.node()?.parent_id;
    return p ? this.index().get(p) : undefined;
  });
  protected readonly label = computed(() => audienceLabel(this.audience()));
  protected readonly donateMessage = computed(
    () => this.settings.value()['donate_message'] || 'Спасибо, что хотите поддержать «Колибри»!',
  );
  protected readonly donateUrl = computed(
    () =>
      this.node()?.link_url ||
      this.settings.value()['donate_url'] ||
      'https://anokolibri.ru/donate',
  );
  protected readonly coordinator = computed(
    () => this.settings.value()['coordinator_contact'] || '',
  );
  protected readonly picto = pictoFor;

  constructor() {
    effect(() => {
      this.nav.parentId.set(this.node()?.parent_id ?? null);
    });
    effect(() => {
      this.params();
      this.speech.stop();
    });
  }
}
