import { Component, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { AdminApi, RequestStatus, STATUS_LABELS, errorText } from '../../core/admin-api';
import { audienceLabel } from '../../core/api';

@Component({
  imports: [DatePipe],
  template: `
    <div class="toolbar">
      <label class="field">
        <span>Статус</span>
        <select class="input" [value]="status()" (change)="status.set($any($event.target).value)">
          <option value="">Все</option>
          @for (s of statuses; track s) {
            <option [value]="s">{{ labels[s] }}</option>
          }
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
    </div>
    @if (message()) {
      <p class="notice" [class]="'notice ' + (messageOk() ? 'notice--ok' : 'notice--err')">
        {{ message() }}
      </p>
    }
    <div class="table-wrap">
      <table class="table">
        <thead>
          <tr>
            <th>#</th>
            <th>Создана</th>
            <th>Имя</th>
            <th>Контакт</th>
            <th>Для кого</th>
            <th>Время</th>
            <th>Тема</th>
            <th>Статус</th>
          </tr>
        </thead>
        <tbody>
          @for (r of list.value(); track r.id) {
            <tr>
              <td>{{ r.id }}</td>
              <td class="nowrap">{{ r.created_at | date: 'dd.MM.yy HH:mm' }}</td>
              <td>{{ r.name }}</td>
              <td>{{ r.contact }}</td>
              <td>{{ audienceLabel(r.audience) || '—' }}</td>
              <td class="nowrap">
                @if (r.slot) {
                  {{ r.slot.starts_at | date: 'dd.MM HH:mm' }}
                } @else {
                  {{ r.preferred_time || '—' }}
                }
              </td>
              <td>{{ r.comment || '—' }}</td>
              <td>
                <select
                  class="input"
                  [value]="r.status"
                  (change)="setStatus(r.id, $any($event.target).value)"
                  [attr.aria-label]="'Статус заявки ' + r.id"
                >
                  @for (s of statuses; track s) {
                    <option [value]="s">{{ labels[s] }}</option>
                  }
                </select>
              </td>
            </tr>
          } @empty {
            <tr>
              <td colspan="8" class="muted">
                {{ list.isLoading() ? 'Загружаем…' : 'Заявок нет' }}
              </td>
            </tr>
          }
        </tbody>
      </table>
    </div>
  `,
})
export class AdminRequests {
  private readonly api = inject(AdminApi);
  protected readonly statuses: RequestStatus[] = ['new', 'confirmed', 'done', 'cancelled'];
  protected readonly labels = STATUS_LABELS;
  protected readonly audienceLabel = audienceLabel;
  protected readonly status = signal<RequestStatus | ''>('');
  protected readonly list = this.api.requests(this.status);
  protected readonly message = signal<string | null>(null);
  protected readonly messageOk = signal(true);
  protected readonly exporting = signal(false);

  protected setStatus(id: number, status: RequestStatus): void {
    this.api.setStatus(id, status).subscribe({
      next: () => {
        this.notify(`Заявка ${id}: ${STATUS_LABELS[status]}`, true);
        this.list.reload();
      },
      error: (e: unknown) => this.notify(errorText(e), false),
    });
  }

  protected exportCsv(): void {
    this.exporting.set(true);
    this.api.exportCsv().subscribe({
      next: (blob) => {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'заявки.csv';
        a.click();
        URL.revokeObjectURL(url);
        this.exporting.set(false);
      },
      error: (e: unknown) => {
        this.exporting.set(false);
        this.notify(errorText(e, 'Не удалось выгрузить CSV.'), false);
      },
    });
  }

  private notify(text: string, ok: boolean): void {
    this.message.set(text);
    this.messageOk.set(ok);
  }
}
