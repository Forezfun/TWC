import { Component, inject, signal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { Auth } from '../../core/auth';
import { errorText } from '../../core/admin-api';

@Component({
  imports: [ReactiveFormsModule, RouterLink],
  template: `
    <div class="page login stack-lg">
      <section class="stack">
        <h1>Вход для сотрудников</h1>
        <p class="muted">Админка навигатора «Колибри». Для пользователей сайта вход не нужен.</p>
      </section>
      <form class="card stack" [formGroup]="form" (ngSubmit)="submit()" novalidate>
        <label class="field">
          <span>Почта</span>
          <input class="input" type="email" formControlName="email" autocomplete="username" />
        </label>
        <label class="field">
          <span>Пароль</span>
          <input
            class="input"
            type="password"
            formControlName="password"
            autocomplete="current-password"
          />
        </label>
        @if (error()) {
          <p class="notice notice--err" role="alert">{{ error() }}</p>
        }
        <button
          type="submit"
          class="btn btn--primary btn--block"
          [disabled]="busy() || form.invalid"
        >
          {{ busy() ? 'Входим…' : 'Войти' }}
        </button>
        <a class="btn btn--ghost btn--block" routerLink="/">На сайт</a>
      </form>
    </div>
  `,
})
export class AdminLogin {
  private readonly auth = inject(Auth);
  private readonly router = inject(Router);
  protected readonly busy = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly form = new FormGroup({
    email: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, Validators.email],
    }),
    password: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
  });

  protected submit(): void {
    if (this.form.invalid) return;
    this.busy.set(true);
    this.error.set(null);
    const { email, password } = this.form.getRawValue();
    this.auth.login(email.trim(), password).subscribe({
      next: () => void this.router.navigate(['/admin']),
      error: (e: unknown) => {
        this.busy.set(false);
        this.error.set(errorText(e, 'Не удалось войти.'));
      },
    });
  }
}
