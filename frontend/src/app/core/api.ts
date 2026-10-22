import { HttpClient, httpResource } from '@angular/common/http';
import { Injectable, PLATFORM_ID, inject } from '@angular/core';
import { isPlatformServer } from '@angular/common';
import { Observable } from 'rxjs';

export type Audience = 'parents' | 'specialists' | 'self';
export type NodeKind = 'menu' | 'answer' | 'consult' | 'donate' | 'volunteer' | 'link';

export interface ScenarioNode {
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
  children: ScenarioNode[];
}

export interface Slot {
  id: number;
  starts_at: string;
  ends_at: string;
  is_open: boolean;
}

export interface RequestPayload {
  name: string;
  contact: string;
  audience: Audience | null;
  comment: string | null;
  preferred_time: string | null;
  slot_id: number | null;
}

export interface RequestResult extends RequestPayload {
  id: number;
  status: string;
  slot: Slot | null;
  created_at: string;
  updated_at: string;
}

export const AUDIENCES: { key: Audience; label: string; hint: string }[] = [
  { key: 'self', label: 'Для себя', hint: 'Повседневные дела, общение, безопасность' },
  {
    key: 'parents',
    label: 'Для родителей и близких',
    hint: 'Обучение, поведение, помощь, поддержка',
  },
  { key: 'specialists', label: 'Для специалистов', hint: 'Методики, адаптация занятий, общение' },
];

export function isAudience(value: string | null | undefined): value is Audience {
  return value === 'parents' || value === 'specialists' || value === 'self';
}

export function audienceLabel(a: Audience | null): string {
  return AUDIENCES.find((x) => x.key === a)?.label ?? '';
}

/** На сервере относительный /api не резолвится, ходим напрямую в бэкенд (API_BASE_URL из окружения). */
function serverApiBase(): string {
  const env = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process
    ?.env;
  return env?.['API_BASE_URL'] ?? 'http://127.0.0.1:3000';
}

@Injectable({ providedIn: 'root' })
export class Api {
  private readonly http = inject(HttpClient);
  private readonly base = isPlatformServer(inject(PLATFORM_ID)) ? serverApiBase() : '';

  url(path: string): string {
    return `${this.base}/api${path}`;
  }

  scenarios(audience: () => Audience | null) {
    return httpResource<ScenarioNode[]>(() => {
      const a = audience();
      return a ? this.url(`/scenarios/${a}`) : undefined;
    });
  }

  settings() {
    return httpResource<Record<string, string>>(() => this.url('/settings'), {
      defaultValue: {},
    });
  }

  slots() {
    return httpResource<Slot[]>(() => this.url('/slots'), { defaultValue: [] });
  }

  createRequest(payload: RequestPayload): Observable<RequestResult> {
    return this.http.post<RequestResult>(this.url('/requests'), payload);
  }
}

/** Плоский индекс дерева: id → узел, плюс список корней. */
export function indexTree(roots: ScenarioNode[]): Map<number, ScenarioNode> {
  const map = new Map<number, ScenarioNode>();
  const walk = (n: ScenarioNode) => {
    map.set(n.id, n);
    n.children.forEach(walk);
  };
  roots.forEach(walk);
  return map;
}
