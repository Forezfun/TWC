import { Component, computed, inject } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { map } from 'rxjs';
import { Api, Audience, audienceLabel, isAudience } from '../core/api';
import { NavState } from '../core/nav';
import { Picto, Chevron, pictoFor } from '../ui/picto';
import { ReadCard } from '../ui/read-card';
import { Spoken } from '../ui/spoken';

@Component({
  imports: [RouterLink, Picto, Chevron, ReadCard, Spoken],
  template: `
    <div class="page stack-lg">
      <p class="crumb">{{ label() }}</p>
      <section class="stack">
        <h1 id="topics"><twc-spoken text="Выберите тему" /></h1>
        <a class="btn btn--primary btn--block" routerLink="/instructions" [queryParams]="{ audience: audience() }">
          <twc-picto key="book" /><twc-spoken text="Пошаговые инструкции" />
        </a>
      </section>

      @if (tree.isLoading()) {
        <p class="status" role="status">Загружаем темы…</p>
      } @else if (tree.error()) {
        <div class="card card--danger stack">
          <p><strong>Не удалось загрузить темы.</strong></p>
          <p>Проверьте интернет и нажмите «Повторить».</p>
          <button type="button" class="btn btn--primary" (click)="tree.reload()">Повторить</button>
        </div>
      } @else {
        <div class="stack" role="list" aria-labelledby="topics">
          @for (n of tree.value(); track n.id) {
            <div class="sound-card" role="listitem">
            <a
              class="tile tile--{{ n.kind }}"
              [routerLink]="['/', audience(), n.id]"
            >
              <span class="tile__icon">
                @if (n.image_url) {
                  <img [src]="n.image_url" alt="" width="44" height="44" />
                } @else {
                  <twc-picto [key]="picto(n)" />
                }
              </span>
              <span class="tile__label"><twc-spoken [text]="n.title" /></span>
              <twc-chevron />
            </a>
            <twc-card-sound [label]="n.title" />
            </div>
          } @empty {
            <p class="status">Темы пока не добавлены.</p>
          }
        </div>
      }
    </div>
  `,
})
export class Topics {
  private readonly api = inject(Api);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly nav = inject(NavState);

  protected readonly audience = toSignal(
    this.route.paramMap.pipe(
      map((p) => {
        const a = p.get('audience');
        if (!isAudience(a)) {
          void this.router.navigate(['/']);
          return null;
        }
        this.nav.parentId.set(null);
        return a as Audience;
      }),
    ),
    { initialValue: null },
  );

  protected readonly tree = this.api.scenarios(this.audience);
  protected readonly label = computed(() => audienceLabel(this.audience()));
  protected readonly picto = pictoFor;
}
