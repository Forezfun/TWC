import { Component, DestroyRef, ElementRef, Injector, afterNextRender, computed, inject, signal, viewChild } from '@angular/core';
import { DatePipe, formatDate } from '@angular/common';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { Observable } from 'rxjs';
import { AdminApi, RequestChange, RequestStatus, STATUS_LABELS, errorText } from '../../core/admin-api';
import { AUDIENCES, RequestResult, audienceLabel } from '../../core/api';
import { SiteDisplayApi } from '../../core/site-display';
import { RequestVoiceAnswers } from './request-voice-answers';

@Component({
  imports: [DatePipe, ReactiveFormsModule, RequestVoiceAnswers],
  host: {
    '(document:pointerdown)': 'dismissStatusFilter($event)',
    '(document:click)': 'dismissStatusFilter($event)',
  },
  styles: [`
    .status-filter { position: relative; flex: 0 1 240px; }
    .status-filter summary { display: flex; align-items: center; justify-content: space-between; gap: 10px; cursor: pointer; }
    .status-filter summary::-webkit-details-marker { display: none; }
    .status-filter summary svg { width: 16px; height: 16px; }
    .status-filter[open] summary svg { rotate: 180deg; }
    .status-options { position: absolute; inset-inline-start: 0; top: calc(100% + 6px); z-index: 3;
      width: min(19rem, calc(100vw - 3rem)); padding: 8px; background: var(--white); color: var(--text);
      border: 1px solid var(--line); border-radius: 12px; box-shadow: 0 8px 24px #12232d24; }
    .status-options label { display: flex; gap: 8px; align-items: center; min-height: 40px; padding: 5px 8px; cursor: pointer; }
    .status-options input { inline-size: 18px; block-size: 18px; accent-color: var(--primary); }
    .history-changes { margin-block: 6px 12px; padding-inline-start: 18px; }
    .request-actions { display: flex; min-inline-size: 13rem; flex-wrap: wrap; gap: 6px; }
    .appointment-fields {
      display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 210px), 1fr));
      align-items: end; gap: 12px;
    }
    .meeting-time { min-inline-size: 0; margin: 0; padding: 0; border: 0; }
    .meeting-time legend { margin: 0 0 .35rem; padding: 0; font-weight: 600; }
    .meeting-time select { min-inline-size: 0; }
    .time-selects { display: grid; grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr); align-items: center; gap: 6px; }
    .editor-actions { display: flex; flex-wrap: wrap; gap: 8px; }
    .history-dialog { width: min(680px, calc(100% - 24px)); max-height: 85dvh; border: 1px solid var(--line); border-radius: var(--radius); padding: 20px; }
    .history-dialog::backdrop { background: #12232d66; }
    .history-dialog ol { padding-inline-start: 24px; }
    .history-dialog header { display: flex; align-items: center; justify-content: space-between; gap: 16px; }
  `],
  template: `
    <div class="toolbar">
      <details #statusFilter class="field status-filter"
        (keydown.escape)="statusFilter.open = false; statusSummary.focus()">
        <summary #statusSummary class="input">
          <span>{{ selectedStatuses().length ? 'Статусы · ' + selectedStatuses().length : 'Все статусы' }}</span>
          <svg viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="m4 6 4 4 4-4" stroke="currentColor" stroke-width="1.5" /></svg>
        </summary>
        <div class="status-options" role="group" aria-label="Статусы заявок">
          @for (s of statuses; track s) {
            <label><input type="checkbox" [checked]="selectedStatuses().includes(s)"
              (change)="toggleStatus(s, $event.target.checked)" />{{ labels[s] }}</label>
          }
          <button type="button" class="btn btn--ghost btn--sm" [disabled]="!selectedStatuses().length"
            (click)="selectedStatuses.set([])">Сбросить</button>
        </div>
      </details>
      <label class="field">
        <span>Специалист</span>
        <select #scope class="input" [value]="mine() ? 'mine' : 'all'" (change)="mine.set(scope.value === 'mine')">
          <option value="all">Все заявки</option>
          <option value="mine">Записи ко мне</option>
        </select>
      </label>
      <button type="button" class="btn btn--secondary" (click)="list.reload()">Обновить</button>
      <button
        type="button"
        class="btn btn--secondary"
        (click)="exportCsv()"
        [disabled]="exporting()"
      >
        Выгрузить CSV
      </button>
      <button type="button" class="btn btn--secondary" (click)="exportCalendar()" [disabled]="exporting()">
        Скачать мои записи в календарь
      </button>
    </div>
    @if (message()) {
      <p class="notice" [class]="'notice ' + (messageOk() ? 'notice--ok' : 'notice--err')"
        [attr.role]="messageOk() ? 'status' : 'alert'">
        {{ message() }}
      </p>
    }
    <div class="table-wrap">
      <table class="table" aria-label="Заявки">
        <thead>
          <tr>
            <th>#</th>
            <th>Создана</th>
            <th>Контакт</th>
            <th>Для кого</th>
            <th>Время</th>
            <th>Специалист</th>
            <th>Тема</th>
            <th>Статус</th>
            <th>Действия</th>
          </tr>
        </thead>
        <tbody>
          @for (r of list.hasValue() ? list.value() : []; track r.id) {
            <tr>
              <td>{{ r.id }}</td>
              <td class="nowrap">{{ r.created_at | date: 'dd.MM.yy HH:mm' }}</td>
              <td>
                @if (phoneLink(r.contact); as phone) {
                  <a [href]="phone">{{ r.contact }}</a>
                } @else {
                  {{ r.contact }}
                }
              </td>
              <td>{{ audienceLabel(r.audience) || '—' }}</td>
              <td class="nowrap">
                @if (r.slot) {
                  {{ r.slot.starts_at | date: 'dd.MM HH:mm' : '+0300' }}
                } @else {
                  {{ r.preferred_time || '—' }}
                }
              </td>
              <td>{{ r.specialist_name || 'Не назначен' }}</td>
              <td>{{ r.comment || '—' }}
                @if (r.voice_fields?.length) { <twc-request-voice-answers [requestId]="r.id" [fields]="r.voice_fields!" /> }
              </td>
              <td>
                {{ statusLabel(r.status) }}
                @if (r.closure_reason) {
                  <div class="muted">{{ r.closure_reason }}</div>
                }
              </td>
              <td>
                <div class="request-actions" role="group" [attr.aria-label]="'Действия по заявке №' + r.id">
                  @switch (r.status) {
                    @case ('new') {
                      <button type="button" class="btn btn--primary btn--sm" [disabled]="pending().has(r.id)"
                        (click)="change(r, { action: 'clarify' })">Уточнить данные у клиента</button>
                    }
                    @case ('confirmed') {
                      <button type="button" class="btn btn--secondary btn--sm" [disabled]="pending().has(r.id)"
                        (click)="openEdit(r, editor)">Изменить данные</button>
                      <button type="button" class="btn btn--primary btn--sm" [disabled]="pending().has(r.id)"
                        (click)="change(r, { action: 'complete' })">Консультация состоялась</button>
                    }
                    @case ('cancelled') {
                      <button type="button" class="btn btn--primary btn--sm" [disabled]="pending().has(r.id)"
                        (click)="change(r, { action: 'restore' })">Вернуть заявку</button>
                    }
                    @case ('done') {
                      <button type="button" class="btn btn--primary btn--sm" [disabled]="pending().has(r.id)"
                        (click)="change(r, { action: 'restore' })">Вернуть заявку</button>
                    }
                  }
                  @if (r.status === 'clarifying' || r.status === 'matched') {
                    <button type="button" class="btn btn--primary btn--sm" [disabled]="pending().has(r.id)"
                      (click)="openEdit(r, editor, true)">Принять заявку</button>
                    <button type="button" class="btn btn--secondary btn--sm" [disabled]="pending().has(r.id)"
                      (click)="change(r, { action: 'no_consultation' })">Клиенту не нужна консультация</button>
                  }
                  @if (r.status !== 'new') {
                    @if (r.status !== 'cancelled' && r.status !== 'done') {
                      <button type="button" class="btn btn--danger btn--sm" [disabled]="pending().has(r.id)"
                        (click)="change(r, { action: 'cancel' })">{{ r.status === 'confirmed' ? 'Отменить встречу' : 'Отменить заявку' }}</button>
                    }
                    <button type="button" class="btn btn--secondary btn--sm"
                      [attr.aria-label]="'История заявки ' + r.id" (click)="openHistory(r.id, log)">История</button>
                  }
                </div>
              </td>
            </tr>
          } @empty {
            <tr>
              <td colspan="9" class="muted">
                {{ list.isLoading() ? 'Загружаем…' : list.error() ? 'Не удалось загрузить заявки' : mine() ? 'Записей к вам пока нет' : 'Заявок нет' }}
              </td>
            </tr>
          }
        </tbody>
      </table>
    </div>
    <dialog #editor class="history-dialog" aria-labelledby="request-edit-title" (close)="editing.set(null)"
      (cancel)="editPending() && $event.preventDefault()">
      @if (editing(); as request) {
        <h3 id="request-edit-title">{{ accepting() ? 'Принять заявку' : 'Изменить данные заявки' }} №{{ request.id }}</h3>
        <form class="stack" [formGroup]="editForm" (ngSubmit)="saveEdit(request, editor)">
          <fieldset class="stack" [disabled]="editPending()" aria-label="Данные заявки">
            <label class="field">Контакт
              <input class="input" formControlName="contact" minlength="3" maxlength="200" required />
            </label>
            <label class="field">Для кого
              <select class="input" formControlName="audience" required>
                <option value="" disabled>Выберите, для кого</option>
                @for (role of roleOptions; track role.key) {
                  <option [value]="role.key">{{ role.label }}</option>
                }
              </select>
            </label>
            <div class="appointment-fields">
              <label class="field">
                <span>Дата встречи</span>
                <input class="input" type="date" formControlName="meeting_date" required />
              </label>
              <fieldset class="meeting-time">
                <legend>Время встречи (МСК)</legend>
                <div class="time-selects">
                  <select class="input" aria-label="Часы" formControlName="meeting_hour" required>
                    <option value="" disabled>Часы</option>
                    @for (hour of hours; track hour) { <option [value]="hour">{{ hour }}</option> }
                  </select>
                  <span aria-hidden="true">:</span>
                  <select class="input" aria-label="Минуты" formControlName="meeting_minute" required>
                    <option value="" disabled>Минуты</option>
                    @for (minute of minutes; track minute) { <option [value]="minute">{{ minute }}</option> }
                  </select>
                </div>
              </fieldset>
            </div>
            <label class="field">Специалист
              <select class="input" formControlName="specialist_id" required>
                <option [ngValue]="null" disabled>Выберите специалиста</option>
                @for (employee of specialists(); track employee.id) {
                  <option [ngValue]="employee.id">{{ employee.name || employee.email }}</option>
                }
              </select>
            </label>
            @if (staff.error()) {
              <button type="button" class="btn btn--secondary btn--sm" (click)="staff.reload()">
                Повторить загрузку списка специалистов
              </button>
            }
            <label class="field">Тема консультации (необязательно)
              <textarea class="input" formControlName="comment" rows="3"></textarea>
            </label>
          </fieldset>
          @if (editError()) { <p class="notice notice--err" role="alert">{{ editError() }}</p> }
          <div class="editor-actions">
            <button type="submit" class="btn btn--primary" [disabled]="editForm.invalid || editPending() || staff.isLoading() || !!staff.error()">
              {{ accepting() ? 'Подтвердить приём' : 'Сохранить данные' }}
            </button>
            <button type="button" class="btn btn--secondary" [disabled]="editPending()" (click)="editor.close()">Закрыть</button>
          </div>
        </form>
      }
    </dialog>
    <dialog #log class="history-dialog" aria-labelledby="request-history-title" (close)="historyId.set(null)">
      <header>
        <h3 id="request-history-title">История заявки №{{ historyId() }}</h3>
        <button type="button" class="btn btn--secondary btn--sm" (click)="log.close()">Закрыть</button>
      </header>
      @if (history.isLoading() || history.status() === 'idle') {
        <p role="status">Загружаем историю…</p>
      } @else if (history.error()) {
        <p role="alert">Не удалось загрузить историю заявки.</p>
        <button type="button" class="btn btn--secondary btn--sm" (click)="history.reload()">Повторить</button>
      } @else {
        <ol class="stack">
          @for (entry of history.value(); track entry.id) {
            <li>
              <time [attr.datetime]="entry.occurred_at">{{ entry.occurred_at | date: 'dd.MM.yyyy HH:mm' }}</time>
              <strong> · {{ labels[entry.status] }}</strong>
              <div>{{ eventLabels[entry.kind] }} · {{ entry.actor_name || (entry.kind === 'created' ? 'Заявитель' : 'Автор неизвестен') }}</div>
              @if (entry.changes?.length) {
                <ul class="history-changes">
                  @for (item of entry.changes; track item.field) {
                    <li><strong>{{ historyLabel(item.field) }}</strong>
                      @if (item.field !== 'closure_reason') { {{ historyValue(item.field, item.before) }} → }
                      {{ historyValue(item.field, item.after) }}
                    </li>
                  }
                </ul>
              }
            </li>
          } @empty { <li>История пока пуста.</li> }
        </ol>
      }
    </dialog>
  `,
})
export class AdminRequests {
  private readonly api = inject(AdminApi);
  private readonly roles = inject(SiteDisplayApi);
  private readonly injector = inject(Injector);
  private readonly destroyRef = inject(DestroyRef);
  private readonly statusFilter = viewChild<ElementRef<HTMLDetailsElement>>('statusFilter');
  protected readonly hours = Array.from({ length: 24 }, (_, hour) => String(hour).padStart(2, '0'));
  protected readonly minutes = Array.from({ length: 60 }, (_, minute) => String(minute).padStart(2, '0'));
  protected readonly statuses = Object.keys(STATUS_LABELS) as RequestStatus[];
  protected readonly labels = STATUS_LABELS;
  protected readonly audienceLabel = (key: string | null) => this.roles.label(key);
  protected readonly roleOptions = AUDIENCES;
  private readonly historyLabels: Record<string, string> = {
    status: 'Статус', name: 'Имя', contact: 'Контакт', audience: 'Для кого',
    time: 'Время', specialist: 'Специалист', comment: 'Тема', closure_reason: 'Причина закрытия',
  };
  protected readonly staff = this.api.users();
  protected readonly specialists = computed(() => this.staff.hasValue()
    ? this.staff.value().filter((user) => user.is_active) : []);
  protected readonly activeIds = computed(() => new Set(this.specialists().map(({ id }) => id)));
  protected readonly pending = signal<ReadonlySet<number>>(new Set());
  protected readonly historyId = signal<number | null>(null);
  protected readonly history = this.api.requestHistory(this.historyId);
  protected readonly eventLabels = {
    created: 'Создание заявки', snapshot: 'Последний известный статус', status: 'Статус изменён',
    assignment: 'Назначение специалиста', updated: 'Статус и специалист изменены',
    edited: 'Данные заявки изменены', restored: 'Заявка восстановлена',
  };
  protected readonly editing = signal<RequestResult | null>(null);
  protected readonly accepting = signal(false);
  protected readonly editError = signal('');
  protected readonly editPending = computed(() => this.pending().has(this.editing()?.id ?? 0));
  protected readonly editForm = new FormGroup({
    contact: new FormControl('', { nonNullable: true, validators: [Validators.required, Validators.minLength(3)] }),
    audience: new FormControl('', { nonNullable: true, validators: Validators.required }),
    meeting_date: new FormControl('', { nonNullable: true, validators: Validators.required }),
    meeting_hour: new FormControl('', { nonNullable: true, validators: Validators.required }),
    meeting_minute: new FormControl('', { nonNullable: true, validators: Validators.required }),
    specialist_id: new FormControl<number | null>(null, Validators.required),
    comment: new FormControl('', { nonNullable: true }),
  });
  protected readonly selectedStatuses = signal<readonly RequestStatus[]>([]);
  protected readonly mine = signal(false);
  protected readonly list = this.api.requests(this.selectedStatuses, this.mine);
  protected readonly message = signal<string | null>(null);
  protected readonly messageOk = signal(true);
  protected readonly exporting = signal(false);
  private messageTimer: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    this.roles.adminResource();
    this.destroyRef.onDestroy(() => {
      if (this.messageTimer !== null) clearTimeout(this.messageTimer);
    });
  }

  protected toggleStatus(status: RequestStatus, checked: boolean): void {
    this.selectedStatuses.update((selected) => this.statuses.filter((candidate) =>
      candidate === status ? checked : selected.includes(candidate)));
  }

  protected dismissStatusFilter(event: Event): void {
    const filter = this.statusFilter()?.nativeElement;
    if (filter?.open && !event.composedPath().includes(filter)) filter.open = false;
  }

  protected openHistory(id: number, dialog: HTMLDialogElement): void {
    this.historyId.set(id);
    dialog.showModal();
  }

  protected statusLabel(value: string): string {
    const status = this.statuses.find((candidate) => candidate === value);
    return status ? this.labels[status] : value;
  }

  protected historyLabel(field: string): string {
    return this.historyLabels[field] ?? field;
  }

  protected phoneLink(contact: string): string | null {
    const phone = contact.replace(/[()\s-]/g, '');
    return /^\+?\d{10,15}$/.test(phone) ? 'tel:' + phone : null;
  }

  protected historyValue(field: string, value: string | null): string {
    if (value === null) return '—';
    if (field === 'status') return this.statusLabel(value);
    if (field === 'audience') return audienceLabel(value) || value;
    if (field === 'time' && /^\d{4}-\d{2}-\d{2}T/.test(value) && Number.isFinite(Date.parse(value))) {
      return formatDate(value, 'dd.MM.yyyy HH:mm', 'en-US', '+0300');
    }
    return value;
  }

  protected openEdit(request: RequestResult, dialog: HTMLDialogElement, accept = false): void {
    this.editing.set(request);
    this.accepting.set(accept);
    this.editError.set('');
    const [date = '', hour = '', minute = ''] = request.slot
      ? formatDate(request.slot.starts_at, 'yyyy-MM-dd HH:mm', 'en-US', '+0300').split(/[ :]/)
      : [];
    this.editForm.reset({
      contact: request.contact,
      audience: this.roleOptions.find((role) => role.key === request.audience)?.key ?? '',
      meeting_date: date,
      meeting_hour: hour,
      meeting_minute: minute,
      specialist_id: this.staff.hasValue() && !this.activeIds().has(request.specialist_id ?? 0)
        ? null : request.specialist_id ?? null,
      comment: request.comment ?? '',
    });
    afterNextRender(() => dialog.showModal(), { injector: this.injector });
  }

  protected saveEdit(request: RequestResult, dialog: HTMLDialogElement): void {
    if (this.editForm.invalid || this.editPending()) return;
    const { contact, audience, comment, meeting_date, meeting_hour, meeting_minute, specialist_id } = this.editForm.getRawValue();
    if (contact.trim().length < 3 || specialist_id === null) {
      this.editError.set('Проверьте контакт и специалиста.');
      return;
    }
    const start = new Date(`${meeting_date}T${meeting_hour}:${meeting_minute}:00+03:00`);
    if (!Number.isFinite(start.getTime())) {
      this.editError.set('Укажите дату и время встречи.');
      return;
    }
    this.editError.set('');
    this.change(request, {
      ...(this.accepting() ? { action: 'accept' } as const : {}),
      details: {
        contact: contact.trim(), audience, comment: comment.trim() || null,
        expected_updated_at: request.updated_at,
        appointment: { starts_at: start.toISOString(), specialist_id },
      },
    }, {
      saved: () => dialog.close(),
      failed: (error) => this.editError.set(errorText(error)),
    });
  }

  protected change(request: RequestResult, change: RequestChange, callbacks?: {
    saved?: () => void; failed?: (error: unknown) => void;
  }): void {
    const { id } = request;
    if (this.pending().has(id)) return;
    this.pending.update((ids) => new Set([...ids, id]));
    this.api.changeRequest(id, change).subscribe({
      next: (saved) => {
        const restoredWithoutSlot = 'action' in change && change.action === 'restore'
          && request.slot_id != null && saved.slot_id == null;
        this.notify(restoredWithoutSlot
          ? `Заявка №${id} возвращена. Прежнее время недоступно.`
          : `Заявка №${id} обновлена.`, true);
        if (this.list.hasValue()) this.list.value.update((rows) => rows.map((row) => row.id === id ? saved : row));
        this.finishUpdate(id);
        callbacks?.saved?.();
        this.list.reload();
      },
      error: (e: unknown) => {
        callbacks?.failed?.(e);
        this.finishUpdate(id);
        if (!('details' in change)) this.notify(errorText(e), false);
        if ((e as { status?: number }).status === 409) this.list.reload();
      },
    });
  }

  private finishUpdate(id: number): void {
    this.pending.update((ids) => {
      const next = new Set(ids);
      next.delete(id);
      return next;
    });
  }

  protected exportCsv(): void {
    this.download(this.api.exportCsv(), 'заявки.csv');
  }

  protected exportCalendar(): void {
    this.download(this.api.exportCalendar(this.selectedStatuses()), 'kolibri.ics');
  }

  private download(source: Observable<Blob>, fileName: string): void {
    this.exporting.set(true);
    source.subscribe({
      next: (blob) => {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = fileName;
        a.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
        this.exporting.set(false);
      },
      error: (e: unknown) => {
        this.exporting.set(false);
        this.notify(fileName.endsWith('.ics') && (e as { status?: number }).status === 404
          ? 'У вас нет записей с выбранным временем для экспорта.'
          : errorText(e, 'Не удалось скачать файл.'), false);
      },
    });
  }

  private notify(text: string, ok: boolean): void {
    if (this.messageTimer !== null) clearTimeout(this.messageTimer);
    this.messageTimer = null;
    this.message.set(text);
    this.messageOk.set(ok);
    this.messageTimer = setTimeout(() => {
      this.message.set(null);
      this.messageTimer = null;
    }, 5000);
  }
}
