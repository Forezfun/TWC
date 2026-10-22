import { Injectable, signal } from '@angular/core';

/** Текущий родитель узла — чтобы «Назад» вело на уровень выше, а не в историю браузера. */
@Injectable({ providedIn: 'root' })
export class NavState {
  readonly parentId = signal<number | null>(null);
}
