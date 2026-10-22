import { HttpClient, HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { Injectable, PLATFORM_ID, computed, inject, signal } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { CanActivateFn, Router } from '@angular/router';
import { Observable, catchError, map, tap, throwError } from 'rxjs';
import { Api } from './api';

export interface AdminUser {
  id: number;
  email: string;
  name: string;
  is_active: boolean;
  created_at: string;
}

const KEY = 'twc-admin';

/** Сессия сотрудника: JWT в localStorage, пользователь в сигнале. */
@Injectable({ providedIn: 'root' })
export class Auth {
  private readonly http = inject(HttpClient);
  private readonly api = inject(Api);
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));

  readonly token = signal<string | null>(null);
  readonly user = signal<AdminUser | null>(null);
  readonly loggedIn = computed(() => this.token() !== null);

  constructor() {
    if (!this.isBrowser) return;
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) {
        const saved = JSON.parse(raw) as { token: string; user: AdminUser };
        this.token.set(saved.token);
        this.user.set(saved.user);
      }
    } catch {
      /* нет localStorage — просто не залогинены */
    }
  }

  login(email: string, password: string): Observable<AdminUser> {
    return this.http
      .post<{ token: string; user: AdminUser }>(this.api.url('/admin/login'), { email, password })
      .pipe(
        tap((r) => this.store(r.token, r.user)),
        map((r) => r.user),
      );
  }

  logout(): void {
    this.token.set(null);
    this.user.set(null);
    if (this.isBrowser) {
      try {
        localStorage.removeItem(KEY);
      } catch {
        /* ignore */
      }
    }
  }

  private store(token: string, user: AdminUser): void {
    this.token.set(token);
    this.user.set(user);
    if (this.isBrowser) {
      try {
        localStorage.setItem(KEY, JSON.stringify({ token, user }));
      } catch {
        /* ignore */
      }
    }
  }
}

/** Добавляет Bearer к запросам админки и разлогинивает при 401. */
export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const auth = inject(Auth);
  const router = inject(Router);
  const isAdminCall = req.url.includes('/api/admin/') && !req.url.endsWith('/admin/login');
  const token = auth.token();
  const authed =
    isAdminCall && token ? req.clone({ setHeaders: { Authorization: `Bearer ${token}` } }) : req;
  return next(authed).pipe(
    catchError((e: unknown) => {
      if (isAdminCall && e instanceof HttpErrorResponse && e.status === 401) {
        auth.logout();
        void router.navigate(['/admin/login']);
      }
      return throwError(() => e);
    }),
  );
};

export const adminGuard: CanActivateFn = () => {
  const auth = inject(Auth);
  const router = inject(Router);
  return auth.loggedIn() ? true : router.createUrlTree(['/admin/login']);
};
