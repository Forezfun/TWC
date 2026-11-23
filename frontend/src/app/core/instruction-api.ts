import { HttpClient, httpResource } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Api, Audience } from './api';
import { Instruction, InstructionInput, InstructionSummary, InstructionTopic } from './instructions';

export const INSTRUCTION_MEDIA_MAX_BYTES = 8 * 1024 * 1024;

export interface CallbackPayload {
  phone: string;
  consent: true;
  idempotency_key: string;
}

export interface CallbackReceipt {
  id: number;
  status: 'received';
  demo?: boolean;
}

@Injectable({ providedIn: 'root' })
export class InstructionApi {
  private readonly http = inject(HttpClient);
  private readonly api = inject(Api);

  topics(audience: () => Audience | null) {
    return httpResource<InstructionTopic[]>(() => {
      const value = audience();
      return { url: this.api.url('/instruction-topics'), params: value ? { audience: value } : undefined };
    }, { defaultValue: [] });
  }

  published(topicId: () => number | null, audience: () => Audience | null) {
    return httpResource<InstructionSummary[]>(() => {
      const id = topicId();
      if (id === null) return undefined;
      const value = audience();
      const params: Record<string, string | number> = { topic_id: id };
      if (value) params['audience'] = value;
      return { url: this.api.url('/instructions'), params };
    }, { defaultValue: [] });
  }

  get(id: () => number | null) {
    return httpResource<Instruction>(() => {
      const value = id();
      return value ? this.api.url('/instructions/' + value) : undefined;
    });
  }

  adminList() {
    return httpResource<Instruction[]>(() => this.api.url('/admin/instructions'), { defaultValue: [] });
  }

  adminTopics() {
    return httpResource<InstructionTopic[]>(() => this.api.url('/admin/instruction-topics'), { defaultValue: [] });
  }

  createTopic(title: string, description: string) {
    return this.http.post<InstructionTopic>(this.api.url('/admin/instruction-topics'), { title, description });
  }

  uploadMedia(file: Blob) {
    return this.http.post<{ url: string }>(this.api.url('/admin/instruction-media'), file);
  }

  save(payload: InstructionInput, id?: number) {
    return id
      ? this.http.put<Instruction>(this.api.url('/admin/instructions/' + id), payload)
      : this.http.post<Instruction>(this.api.url('/admin/instructions'), payload);
  }

  remove(id: number) {
    return this.http.delete<void>(this.api.url('/admin/instructions/' + id));
  }

  callback(payload: CallbackPayload) {
    return this.http.post<CallbackReceipt>(this.api.url('/callback-requests'), payload);
  }
}
