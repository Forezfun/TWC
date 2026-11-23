import { Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Api } from '../core/api';
import { DEFAULT_SITE_DISPLAY, SiteDisplayApi, SiteRole } from '../core/site-display';
import { Chevron } from '../ui/picto';
import { RolePictogram } from '../ui/role-pictogram';
import { Spoken } from '../ui/spoken';
import { ReadCard } from '../ui/read-card';

@Component({
  imports: [RouterLink, RolePictogram, Chevron, Spoken, ReadCard],
  template: `
    <div class="page page--scroll stack role-page">
      <h1><twc-spoken text="Кто пользуется помощником?" recording="/kolibri/system-audio/roles-title.mp3" /></h1>
      @if (welcome(); as text) {
        <p class="body-text"><twc-spoken [text]="text" /></p>
      }
      <div class="stack audience-list">
        @if (site.isLoading()) {
          <p role="status">Загружаем роли…</p>
        } @else if (site.error()) {
          <button type="button" class="btn btn--secondary" (click)="site.reload()">Загрузить роли снова</button>
        } @else if (site.hasValue() && !audiences().length) {
          <p>Сейчас нет доступных ролей.</p>
        }
        @for (a of audiences(); track a.key) {
          <div class="sound-card">
            <a class="tile" [routerLink]="['/', a.key]">
              <span class="tile__icon"><twc-role-pictogram [roleKey]="a.key" [url]="a.icon_url ?? null" /></span>
              <span class="tile__label">
                <twc-spoken [text]="a.title" [recording]="a.audio_url" [systemButton]="isStandardRole(a)" />
                @if (a.hint) { <span class="tile__hint"><twc-spoken [text]="a.hint" [recording]="a.hint_audio_url ?? null" systemText /></span> }
              </span>
              <twc-chevron />
            </a>
            <twc-card-sound [label]="a.title" />
          </div>
        }
      </div>
    </div>
  `,
})
export class Home {
  private readonly settings = inject(Api).settings();
  protected readonly welcome = computed(() => (this.settings.value()['welcome_text'] ?? '')
    .replace(/^здравствуйте!?\s*/i, '').replace(/^./, (letter) => letter.toUpperCase()));
  private readonly config = inject(SiteDisplayApi);
  protected readonly site = this.config.resource;
  protected readonly audiences = this.config.roles;

  protected isStandardRole(role: SiteRole): boolean {
    return DEFAULT_SITE_DISPLAY.roles.some(({ key, title }) => key === role.key && title === role.title);
  }
}
