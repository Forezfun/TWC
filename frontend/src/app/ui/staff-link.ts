import { Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Auth } from '../core/auth';

/** Неброская ссылка для сотрудников НКО внизу публичных страниц. */
@Component({
  selector: 'twc-staff-link',
  imports: [RouterLink],
  template: `
    <p class="staff-link">
      @if (auth.loggedIn()) {
        <a routerLink="/admin">Админка «Колибри»</a>
      } @else {
        <a routerLink="/admin/login">Вход для сотрудников</a>
      }
    </p>
  `,
})
export class StaffLink {
  protected readonly auth = inject(Auth);
}
