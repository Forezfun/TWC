import { Component, inject } from '@angular/core';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { Auth } from '../../core/auth';
import { PictogramSemanticSearch } from '../../core/pictogram-semantic-search';

@Component({
  imports: [RouterOutlet, RouterLink, RouterLinkActive],
  styles: `
    .admin-navigation { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between;
      gap: 10px 24px; margin: 18px 0 24px; }
    .admin-navigation .admin-tabs { margin: 0; }
    .semantic-offer { display: flex; flex-wrap: wrap; align-items: center; gap: 6px 10px; min-inline-size: 0; }
    .semantic-offer h2 { margin: 0; font-size: .87rem; font-weight: 500; line-height: 1.3; color: var(--muted); letter-spacing: 0; }
    .semantic-note { flex-basis: 100%; margin: 0; font-size: .8rem; line-height: 1.3; text-align: end; overflow-wrap: anywhere; }
    .search-modes { display: flex; gap: 2px; padding: 3px; border: 1px solid var(--line); border-radius: 10px; background: var(--white); }
    .search-modes .btn { min-height: 32px; padding: 4px 12px; border: 0; border-radius: 7px; font-size: .87rem; }
    .search-modes .btn[aria-pressed='true'] { color: white; background: var(--primary); }
    .semantic-download { min-height: 40px; }
    .semantic-download small { font-weight: 500; opacity: .75; }
    .semantic-progress { display: flex; align-items: center; gap: 6px;
      font-size: .85rem; font-variant-numeric: tabular-nums; }
    .semantic-progress progress { inline-size: clamp(60px, 10vw, 110px); block-size: 10px; accent-color: var(--primary); }
    @media (max-width: 40rem) {
      .semantic-offer { inline-size: 100%; }
      .semantic-note { text-align: start; }
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
          <aside class="semantic-offer" aria-labelledby="pictogram-search-type">
            <h2 id="pictogram-search-type">Поиск пиктограмм</h2>
            <div class="search-modes" role="group" aria-labelledby="pictogram-search-type">
              <button type="button" class="btn btn--ghost btn--sm" [attr.aria-pressed]="semantic.mode() === 'exact'"
                (click)="semantic.selectMode('exact')">Точный</button>
              <button type="button" class="btn btn--ghost btn--sm" [attr.aria-pressed]="semantic.mode() === 'contextual'"
                [disabled]="!semantic.installed()"
                [attr.title]="semantic.installed() ? null : 'Сначала скачайте модель'"
                (click)="semantic.selectMode('contextual')">Контекстный</button>
            </div>
            @if (progress) {
              <div class="semantic-progress">
                <progress max="100" [attr.value]="progress.percent" aria-label="Загрузка поиска по смыслу"></progress>
                @if (progress.percent !== null) { <span aria-hidden="true">{{ progress.percent }}%</span> }
              </div>
            } @else if (setup && semantic.supported()) {
              @if (semantic.latest()) {
                <button type="button" class="btn btn--secondary btn--sm semantic-download"
                  title="Контекстный поиск находит пиктограммы по смыслу, а не только по названию"
                  (click)="semantic.install()">
                  {{ semantic.updateAvailable() ? 'Обновить модель' : 'Скачать модель' }}
                  @if (!semantic.updateAvailable()) { <small>160 МБ</small> }
                </button>
              } @else {
                <button type="button" class="btn btn--secondary btn--sm semantic-download" (click)="semantic.refresh()">Перепроверить</button>
              }
            }
            @if (setup) {
              @if (semantic.message()) {
                <p class="semantic-note" role="alert">{{ semantic.message() }}</p>
              } @else if (progress) {
                <p class="semantic-note muted" role="status">{{ progress.checking ? 'Проверяем модель и индекс…' : 'Скачиваем модель и индекс…' }}</p>
              } @else if (!semantic.supported()) {
                <p class="semantic-note">Для скачивания нужен HTTPS или localhost.</p>
              }
            }
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
