import { Component, inject } from '@angular/core';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { Auth } from '../../core/auth';
import { PictogramSemanticSearch } from '../../core/pictogram-semantic-search';

@Component({
  imports: [RouterOutlet, RouterLink, RouterLinkActive],
  styles: `
    .admin-navigation { display: flow-root; position: relative; }
    .semantic-offer { inline-size: fit-content; max-inline-size: 100%; padding: 10px 14px; margin: 0 0 16px auto;
      background: var(--white); border: 1px solid var(--line); border-radius: var(--radius); }
    .semantic-offer--setup { inline-size: min(100%, 27rem); }
    .semantic-caption { display: flex; flex-wrap: wrap; align-items: baseline; gap: 2px 8px; justify-content: space-between; margin-block-end: 4px; }
    .semantic-caption h2 { margin: 0; font-size: .86rem; font-weight: 600; line-height: 1.3; }
    .semantic-caption p { margin: 0; font-size: .8rem; line-height: 1.3; overflow-wrap: anywhere; }
    .semantic-controls { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 8px; }
    .search-modes { display: flex; flex-wrap: wrap; gap: 3px; min-inline-size: 0; padding-inline: 2px; border-radius: 9px; background: var(--bg); }
    .search-modes .btn { padding-inline: 9px; }
    .search-modes .btn[aria-pressed='true'] { color: white; background: var(--primary); }
    .semantic-progress { display: flex; align-items: center; justify-content: flex-end; gap: 6px;
      font-size: .85rem; font-variant-numeric: tabular-nums; }
    .semantic-progress progress { inline-size: clamp(36px, 10vw, 90px); block-size: 12px; accent-color: var(--primary); }
    @media (min-width: 80rem) {
      .admin-navigation:has(.semantic-offer) .admin-tabs { padding-inline-end: 15rem; }
      .admin-navigation:has(.semantic-offer--setup) .admin-tabs { padding-inline-end: 28rem; }
      .semantic-offer { position: absolute; inset-block-start: -2px; inset-inline-end: 0; margin: 0; }
    }
    @media (max-width: 79.99rem) {
      .admin-navigation:has(.semantic-offer) .admin-tabs { margin-block-end: 10px; }
    }
  `,
  template: `
    <div class="admin">
      <div class="admin-head">
        <h1>Админ-панель</h1>
        <div class="muted">
          {{ auth.user()?.name || auth.user()?.email }}
          <button type="button" class="btn btn--ghost btn--sm" (click)="logout()">Выйти</button>
        </div>
      </div>
      <div class="admin-navigation">
        <nav class="admin-tabs" aria-label="Разделы админ-панели">
          <a routerLink="/admin/requests" routerLinkActive="active">Заявки</a>
          <a routerLink="/admin/scenarios" routerLinkActive="active">Сценарии</a>
          <a routerLink="/admin/pictograms" routerLinkActive="active" ariaCurrentWhenActive="page">Пиктограммы</a>
          <a routerLink="/admin/settings" routerLinkActive="active">Настройки</a>
          <a routerLink="/admin/users" routerLinkActive="active">Сотрудники</a>
          <a routerLink="/" target="_blank">Открыть сайт ↗</a>
        </nav>
        @if (semantic.checked()) {
          @let progress = semantic.progress();
          @let setup = !semantic.installed() || semantic.updateAvailable() || !!progress;
          <aside class="semantic-offer" [class.semantic-offer--setup]="setup" aria-label="Поиск пиктограмм">
            <div class="semantic-caption">
              <h2 id="pictogram-search-type">Тип поиска пиктограмм</h2>
              @if (setup) {
                @if (semantic.message()) {
                  <p role="alert">{{ semantic.message() }}</p>
                } @else if (progress) {
                  <p class="muted" role="status">{{ progress.checking ? 'Проверяем модель и индекс…' : 'Скачиваем модель и индекс…' }}</p>
                } @else if (semantic.supported()) {
                  <p class="muted">{{ semantic.updateAvailable()
                    ? 'Доступно обновление' : 'Заметно упрощает поиск · 160 МБ' }}</p>
                } @else {
                  <p>Для скачивания нужен HTTPS или localhost.</p>
                }
              }
            </div>
            <div class="semantic-controls">
              <div class="search-modes" role="group" aria-labelledby="pictogram-search-type">
                <button type="button" class="btn btn--ghost btn--sm" [attr.aria-pressed]="semantic.mode() === 'exact'"
                  (click)="semantic.selectMode('exact')">Точный</button>
                <button type="button" class="btn btn--ghost btn--sm" [attr.aria-pressed]="semantic.mode() === 'contextual'"
                  [disabled]="!semantic.installed()" (click)="semantic.selectMode('contextual')">Контекстный</button>
              </div>
              @if (progress) {
                <div class="semantic-progress">
                  <progress max="100" [attr.value]="progress.percent" aria-label="Загрузка поиска по смыслу"></progress>
                  @if (progress.percent !== null) { <span aria-hidden="true">{{ progress.percent }}%</span> }
                </div>
              } @else if (setup && semantic.supported()) {
                @if (semantic.latest()) {
                  <button type="button" class="btn btn--secondary btn--sm" (click)="semantic.install()">
                    {{ semantic.updateAvailable() ? 'Обновить модель' : 'Скачать модель' }}
                  </button>
                } @else {
                  <button type="button" class="btn btn--secondary btn--sm" (click)="semantic.refresh()">Перепроверить</button>
                }
              }
            </div>
          </aside>
        }
      </div>
      <router-outlet />
    </div>
  `,
})
export class AdminLayout {
  protected readonly auth = inject(Auth);
  protected readonly semantic = inject(PictogramSemanticSearch);
  private readonly router = inject(Router);
  protected logout(): void {
    this.auth.logout();
    void this.router.navigate(['/admin/login']);
  }
}
