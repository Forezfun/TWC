import { HttpClient, httpResource } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { Api, Audience, NodeKind, RequestResult, Slot } from './api';
import { AdminUser } from './auth';

/** Плоский узел из админки (без children). */
export interface AdminNode {
  id: number;
  audience: Audience;
  parent_id: number | null;
  kind: NodeKind;
  title: string;
  body: string | null;
  image_url: string | null;
  audio_url: string | null;
  link_url: string | null;
  position: number;
  is_published: boolean;
  updated_at: string;
}

export type NodeInput = Omit<AdminNode, 'id' | 'updated_at'>;

export interface AdminSlot extends Slot {
  is_booked: boolean;
}

export interface Setting {
  key: string;
  value: string;
  description: string | null;
}

export type RequestStatus = 'new' | 'confirmed' | 'done' | 'cancelled';

export const STATUS_LABELS: Record<RequestStatus, string> = {
  new: 'Новая',
  confirmed: 'Подтверждена',
  done: 'Завершена',
  cancelled: 'Отменена',
};

export const KIND_LABELS: Record<NodeKind, string> = {
  menu: 'Меню (список кнопок)',
  answer: 'Ответ (текст)',
  consult: 'Запись на консультацию',
  donate: 'Пожертвование',
  volunteer: 'Стать волонтёром',
  link: 'Внешняя ссылка',
};

@Injectable({ providedIn: 'root' })
export class AdminApi {
  private readonly http = inject(HttpClient);
  private readonly api = inject(Api);
  private u = (p: string) => this.api.url(`/admin${p}`);

  // --- сценарии
  nodes(audience: () => Audience) {
    return httpResource<AdminNode[]>(
      () => ({ url: this.u('/nodes'), params: { audience: audience() } }),
      { defaultValue: [] },
    );
  }
  createNode(data: NodeInput): Observable<AdminNode> {
    return this.http.post<AdminNode>(this.u('/nodes'), data);
  }
  updateNode(id: number, data: Partial<NodeInput>): Observable<AdminNode> {
    return this.http.patch<AdminNode>(this.u(`/nodes/${id}`), data);
  }
  deleteNode(id: number): Observable<void> {
    return this.http.delete<void>(this.u(`/nodes/${id}`));
  }

  // --- настройки
  settings() {
    return httpResource<Setting[]>(() => this.u('/settings'), { defaultValue: [] });
  }
  saveSetting(key: string, value: string, description?: string): Observable<Setting> {
    return this.http.put<Setting>(this.u(`/settings/${encodeURIComponent(key)}`), {
      value,
      description,
    });
  }

  // --- слоты
  slots() {
    return httpResource<AdminSlot[]>(() => this.u('/slots'), { defaultValue: [] });
  }
  createSlot(starts_at: string, ends_at: string): Observable<AdminSlot> {
    return this.http.post<AdminSlot>(this.u('/slots'), { starts_at, ends_at, is_open: true });
  }
  deleteSlot(id: number): Observable<void> {
    return this.http.delete<void>(this.u(`/slots/${id}`));
  }

  // --- заявки
  requests(status: () => RequestStatus | '') {
    return httpResource<RequestResult[]>(
      () => {
        const s = status();
        const params: Record<string, string> = s ? { status: s } : {};
        return { url: this.u('/requests'), params };
      },
      { defaultValue: [] },
    );
  }
  setStatus(id: number, status: RequestStatus): Observable<RequestResult> {
    return this.http.patch<RequestResult>(this.u(`/requests/${id}`), { status });
  }
  exportCsv(): Observable<Blob> {
    return this.http.get(this.u('/requests/export.csv'), { responseType: 'blob' });
  }

  // --- сотрудники
  users() {
    return httpResource<AdminUser[]>(() => this.u('/users'), { defaultValue: [] });
  }
  createUser(email: string, name: string, password: string): Observable<AdminUser> {
    return this.http.post<AdminUser>(this.u('/users'), { email, name, password });
  }
  setUserActive(id: number, active: boolean): Observable<AdminUser> {
    return this.http.patch<AdminUser>(this.u(`/users/${id}/active`), null, { params: { active } });
  }
  changePassword(current_password: string, new_password: string): Observable<void> {
    return this.http.post<void>(this.u('/me/password'), { current_password, new_password });
  }
}

/** Текст ошибки для показа сотруднику. */
export function errorText(
  e: unknown,
  fallback = 'Что-то пошло не так. Попробуйте ещё раз.',
): string {
  const err = e as { status?: number; error?: { detail?: unknown } };
  const d = err.error?.detail;
  if (typeof d === 'string') return d;
  if (Array.isArray(d) && d.length) return 'Проверьте заполнение полей.';
  if (err.status === 0) return 'Нет связи с сервером.';
  return fallback;
}
