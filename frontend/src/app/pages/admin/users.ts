import { Component, inject, signal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { AdminApi, errorText } from '../../core/admin-api';
import { Auth } from '../../core/auth';

@Component({
  imports: [ReactiveFormsModule],
  styles: [`
    .staff-actions { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; }
    .staff-archive { margin-block: 1rem; }
    .staff-archive summary { cursor: pointer; inline-size: fit-content; }
    .staff-archive .table-wrap, .staff-archive p { margin-block-start: 12px; }
  `],
  template: `
    @if (message()) {
      <p [class]="'notice ' + (messageOk() ? 'notice--ok' : 'notice--err')"
        [attr.role]="messageOk() ? 'status' : 'alert'">{{ message() }}</p>
    }
    <div class="table-wrap">
      <table class="table">
        <thead>
          <tr>
            <th>Почта</th>
            <th>Имя</th>
            <th>Доступ</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          @for (u of list.hasValue() ? list.value() : []; track u.id) {
            <tr>
              <td>{{ u.email }}</td>
              <td>{{ u.name || '—' }}</td>
              <td>
                @if (u.is_active) {
                  <span class="badge badge--done">Активен</span>
                } @else {
                  <span class="badge badge--off">Отключён</span>
                }
              </td>
              <td><div class="staff-actions">
                @if (u.id !== auth.user()?.id) {
                  <button
                    type="button"
                    class="btn btn--sm"
                    [class]="u.is_active ? 'btn btn--sm btn--danger' : 'btn btn--sm btn--secondary'"
                    [disabled]="changing() !== null"
                    (click)="toggle(u.id, !u.is_active)"
                  >
                    {{ u.is_active ? 'Отключить' : 'Включить' }}
                  </button>
                  <button type="button" class="btn btn--secondary btn--sm" [disabled]="changing() !== null"
                    [attr.aria-label]="'Архивировать сотрудника ' + (u.name || u.email)"
                    (click)="archiveUser(u.id, true)">Архивировать</button>
                } @else {
                  <span class="muted">это вы</span>
                }
              </div></td>
            </tr>
          }
        </tbody>
      </table>
    </div>
    <details #archivePanel class="staff-archive" (toggle)="archiveOpen.set(archivePanel.open)">
      <summary class="btn btn--secondary">Архив сотрудников</summary>
      @if (archived.isLoading()) {
        <p role="status">Загружаем архив…</p>
      } @else if (archived.error()) {
        <p role="alert">Не удалось загрузить архив.</p>
        <button type="button" class="btn btn--secondary btn--sm" (click)="archived.reload()">Повторить</button>
      } @else if (archived.hasValue() && archived.value().length) {
        <div class="table-wrap">
          <table class="table">
            <thead><tr><th>Почта</th><th>Имя</th><th>Действия</th></tr></thead>
            <tbody>
              @for (u of archived.value(); track u.id) {
                <tr>
                  <td>{{ u.email }}</td>
                  <td>{{ u.name || '—' }}</td>
                  <td><button type="button" class="btn btn--secondary btn--sm" [disabled]="changing() !== null"
                    [attr.aria-label]="'Вернуть из архива ' + (u.name || u.email)"
                    (click)="archiveUser(u.id, false)">Вернуть из архива</button></td>
                </tr>
              }
            </tbody>
          </table>
        </div>
      } @else if (archiveOpen()) {
        <p>В архиве пока нет сотрудников.</p>
      }
    </details>
    <div class="split" style="margin-top:1rem">
      <form class="card stack" [formGroup]="create" (ngSubmit)="add()" novalidate>
        <h2>Новый сотрудник</h2>
        <label class="field"
          ><span>Почта</span><input class="input" type="email" formControlName="email"
        /></label>
        <label class="field"><span>Имя</span><input class="input" formControlName="name" /></label>
        <label class="field"
          ><span>Пароль (от 8 символов)</span
          ><input class="input" type="text" formControlName="password" autocomplete="off"
        /></label>
        <button type="submit" class="btn btn--primary" [disabled]="create.invalid">Добавить</button>
      </form>
      <form class="card stack" [formGroup]="pwd" (ngSubmit)="changePassword()" novalidate>
        <h2>Сменить свой пароль</h2>
        <label class="field"
          ><span>Текущий пароль</span
          ><input
            class="input"
            type="password"
            formControlName="current"
            autocomplete="current-password"
        /></label>
        <label class="field"
          ><span>Новый пароль (от 8 символов)</span
          ><input class="input" type="password" formControlName="next" autocomplete="new-password"
        /></label>
        <button type="submit" class="btn btn--secondary" [disabled]="pwd.invalid">Сменить</button>
      </form>
    </div>
  `,
})
export class AdminUsers {
  private readonly api = inject(AdminApi);
  protected readonly auth = inject(Auth);
  protected readonly list = this.api.users();
  protected readonly archiveOpen = signal(false);
  protected readonly archived = this.api.users(true, this.archiveOpen);
  protected readonly changing = signal<number | null>(null);
  protected readonly message = signal<string | null>(null);
  protected readonly messageOk = signal(true);
  protected readonly create = new FormGroup({
    email: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, Validators.email],
    }),
    name: new FormControl('', { nonNullable: true }),
    password: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, Validators.minLength(8)],
    }),
  });
  protected readonly pwd = new FormGroup({
    current: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
    next: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, Validators.minLength(8)],
    }),
  });

  protected add(): void {
    const { email, name, password } = this.create.getRawValue();
    this.api.createUser(email.trim(), name.trim(), password).subscribe({
      next: (u) => {
        this.notify(`Добавлен ${u.email}`, true);
        this.create.reset();
        this.list.reload();
      },
      error: (e: unknown) => this.notify(errorText(e), false),
    });
  }

  protected toggle(id: number, active: boolean): void {
    if (this.changing() !== null) return;
    this.changing.set(id);
    this.api.setUserActive(id, active).subscribe({
      next: () => { this.changing.set(null); this.list.reload(); },
      error: (e: unknown) => { this.changing.set(null); this.notify(errorText(e), false); },
    });
  }

  protected archiveUser(id: number, archived: boolean): void {
    if (this.changing() !== null) return;
    this.changing.set(id);
    this.api.setUserArchived(id, archived).subscribe({
      next: (user) => {
        this.changing.set(null);
        if (this.list.hasValue()) {
          this.list.value.update((users) => {
            const remaining = users.filter((item) => item.id !== id);
            return archived ? remaining : [...remaining, user].sort((a, b) => a.id - b.id);
          });
        }
        if (!archived && this.archived.hasValue()) {
          this.archived.value.update((users) => users.filter((item) => item.id !== id));
        }
        if (this.archiveOpen()) this.archived.reload();
        this.list.reload();
        this.notify(archived ? 'Сотрудник архивирован.' : 'Сотрудник возвращён из архива и активен.', true);
      },
      error: (error: unknown) => {
        this.changing.set(null);
        this.notify(errorText(error), false);
      },
    });
  }

  protected changePassword(): void {
    const { current, next } = this.pwd.getRawValue();
    this.api.changePassword(current, next).subscribe({
      next: () => {
        this.notify('Пароль изменён', true);
        this.pwd.reset();
      },
      error: (e: unknown) => this.notify(errorText(e), false),
    });
  }

  private notify(text: string, ok: boolean): void {
    this.message.set(text);
    this.messageOk.set(ok);
  }
}
