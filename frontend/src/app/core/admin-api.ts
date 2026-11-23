import { HttpClient, httpResource } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { Api, Audience, NodeKind, RequestPayload, RequestResult } from './api';
import { AdminUser } from './auth';
import type { RecordedField } from './voice-recordings';

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

export interface Setting {
  key: string;
  value: string;
  description: string | null;
}

export type RequestStatus = 'new' | 'clarifying' | 'matched' | 'confirmed' | 'done' | 'cancelled';

export const STATUS_LABELS: Record<RequestStatus, string> = {
  new: 'Создана заявителем',
  clarifying: 'В процессе уточнения',
  matched: 'Специалист подобран',
  confirmed: 'Ожидание встречи',
  done: 'Завершена',
  cancelled: 'Отменена',
};

export interface RequestEvent {
  id: number;
  kind: 'created' | 'snapshot' | 'status' | 'assignment' | 'updated' | 'edited' | 'restored';
  status: RequestStatus;
  actor_id: number | null;
  actor_name: string | null;
  specialist_name: string | null;
  changes?: { field: string; before: string | null; after: string | null }[] | null;
  occurred_at: string;
}

export type RequestAction = 'clarify' | 'complete' | 'no_consultation' | 'cancel' | 'restore';
export type RequestChange = { action: RequestAction } | {
  action?: 'accept';
  details: Pick<RequestPayload, 'contact' | 'audience' | 'comment'> & {
    expected_updated_at: string;
    appointment: { starts_at: string; specialist_id: number };
  };
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

  // --- заявки
  requests(statuses: () => readonly RequestStatus[], mine: () => boolean) {
    return httpResource<RequestResult[]>(
      () => {
        const params: Record<string, string | readonly string[]> = { status: statuses() };
        if (mine()) params['scope'] = 'mine';
        return { url: this.u('/requests'), params };
      },
      { defaultValue: [] },
    );
  }
  changeRequest(id: number, change: RequestChange): Observable<RequestResult> {
    return this.http.patch<RequestResult>(this.u(`/requests/${id}`), change);
  }
  requestHistory(id: () => number | null) {
    return httpResource<RequestEvent[]>(() => {
      const requestId = id();
      return requestId === null ? undefined : this.u(`/requests/${requestId}/history`);
    }, { defaultValue: [] });
  }
  exportCsv(): Observable<Blob> {
    return this.http.get(this.u('/requests/export.csv'), { responseType: 'blob' });
  }
  requestVoiceAnswer(id: number, field: RecordedField): Observable<Blob> {
    return this.http.get(this.u(`/requests/${id}/voice/${field}`), { responseType: 'blob' });
  }

  exportCalendar(statuses: readonly RequestStatus[]): Observable<Blob> {
    return this.http.get(this.u('/requests/calendar.ics'), {
      params: { status: statuses },
      responseType: 'blob',
    });
  }

  // --- сотрудники
  users(archived = false, enabled = () => true) {
    return httpResource<AdminUser[]>(() => enabled() ? {
      url: this.u('/users'), params: archived ? { archived: 'true' } : undefined,
    } : undefined, { defaultValue: [] });
  }
  createUser(email: string, name: string, password: string): Observable<AdminUser> {
    return this.http.post<AdminUser>(this.u('/users'), { email, name, password });
  }
  setUserActive(id: number, active: boolean): Observable<AdminUser> {
    return this.http.patch<AdminUser>(this.u(`/users/${id}/active`), null, { params: { active } });
  }
  setUserArchived(id: number, archived: boolean): Observable<AdminUser> {
    return this.http.patch<AdminUser>(this.u(`/users/${id}/archive`), null, { params: { archived } });
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
