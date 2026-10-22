import { Component, inject, signal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { AdminApi, errorText } from '../../core/admin-api';
import { Auth } from '../../core/auth';

@Component({
  imports: [ReactiveFormsModule],
  template: `
    @if (message()) {
      <p [class]="'notice ' + (messageOk() ? 'notice--ok' : 'notice--err')">{{ message() }}</p>
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
          @for (u of list.value(); track u.id) {
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
              <td>
                @if (u.id !== auth.user()?.id) {
                  <button
                    type="button"
                    class="btn btn--sm"
                    [class]="u.is_active ? 'btn btn--sm btn--danger' : 'btn btn--sm btn--secondary'"
                    (click)="toggle(u.id, !u.is_active)"
                  >
                    {{ u.is_active ? 'Отключить' : 'Включить' }}
                  </button>
                } @else {
                  <span class="muted">это вы</span>
                }
              </td>
            </tr>
          }
        </tbody>
      </table>
    </div>
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
    this.api.setUserActive(id, active).subscribe({
      next: () => this.list.reload(),
      error: (e: unknown) => this.notify(errorText(e), false),
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
