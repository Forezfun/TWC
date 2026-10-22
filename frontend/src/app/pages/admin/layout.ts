import { Component, inject } from '@angular/core';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { Auth } from '../../core/auth';

@Component({
  imports: [RouterOutlet, RouterLink, RouterLinkActive],
  template: `
    <div class="admin">
      <div class="admin-head">
        <h1>Админка</h1>
        <div class="muted">
          {{ auth.user()?.name || auth.user()?.email }}
          <button type="button" class="btn btn--ghost btn--sm" (click)="logout()">Выйти</button>
        </div>
      </div>
      <nav class="admin-tabs" aria-label="Разделы админки">
        <a routerLink="/admin/requests" routerLinkActive="active">Заявки</a>
        <a routerLink="/admin/slots" routerLinkActive="active">Слоты</a>
        <a routerLink="/admin/scenarios" routerLinkActive="active">Сценарии</a>
        <a routerLink="/admin/settings" routerLinkActive="active">Настройки</a>
        <a routerLink="/admin/users" routerLinkActive="active">Сотрудники</a>
        <a routerLink="/" target="_blank">Открыть сайт ↗</a>
      </nav>
      <router-outlet />
    </div>
  `,
})
export class AdminLayout {
  protected readonly auth = inject(Auth);
  private readonly router = inject(Router);
  protected logout(): void {
    this.auth.logout();
    void this.router.navigate(['/admin/login']);
  }
}
