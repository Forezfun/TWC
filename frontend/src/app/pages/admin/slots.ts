import { Component, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { AdminApi, errorText } from '../../core/admin-api';

@Component({
  imports: [DatePipe, ReactiveFormsModule],
  template: `
    <form class="card toolbar" [formGroup]="form" (ngSubmit)="add()" novalidate>
      <label class="field"
        ><span>Дата</span><input class="input" type="date" formControlName="date"
      /></label>
      <label class="field"
        ><span>Время</span><input class="input" type="time" formControlName="time" step="300"
      /></label>
      <label class="field">
        <span>Длительность</span>
        <select class="input" formControlName="minutes">
          <option [value]="30">30 минут</option>
          <option [value]="45">45 минут</option>
          <option [value]="60">1 час</option>
          <option [value]="90">1,5 часа</option>
        </select>
      </label>
      <button type="submit" class="btn btn--primary" [disabled]="form.invalid || busy()">
        Добавить слот
      </button>
    </form>
    @if (message()) {
      <p [class]="'notice ' + (messageOk() ? 'notice--ok' : 'notice--err')">{{ message() }}</p>
    }
    <div class="table-wrap">
      <table class="table">
        <thead>
          <tr>
            <th>Начало</th>
            <th>Конец</th>
            <th>Состояние</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          @for (s of list.value(); track s.id) {
            <tr>
              <td class="nowrap">
                {{ s.starts_at | date: 'EEEE, d MMMM HH:mm' : undefined : 'ru' }}
              </td>
              <td class="nowrap">{{ s.ends_at | date: 'HH:mm' }}</td>
              <td>
                @if (s.is_booked) {
                  <span class="badge badge--confirmed">Занят</span>
                } @else if (!s.is_open) {
                  <span class="badge badge--off">Закрыт</span>
                } @else {
                  <span class="badge badge--done">Свободен</span>
                }
              </td>
              <td>
                <button
                  type="button"
                  class="btn btn--danger btn--sm"
                  (click)="remove(s.id, s.is_booked)"
                >
                  Удалить
                </button>
              </td>
            </tr>
          } @empty {
            <tr>
              <td colspan="4" class="muted">
                {{ list.isLoading() ? 'Загружаем…' : 'Слотов нет. Добавьте свободное время выше.' }}
              </td>
            </tr>
          }
        </tbody>
      </table>
    </div>
  `,
})
export class AdminSlots {
  private readonly api = inject(AdminApi);
  protected readonly list = this.api.slots();
  protected readonly busy = signal(false);
  protected readonly message = signal<string | null>(null);
  protected readonly messageOk = signal(true);
  protected readonly form = new FormGroup({
    date: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
    time: new FormControl('10:00', { nonNullable: true, validators: [Validators.required] }),
    minutes: new FormControl(30, { nonNullable: true }),
  });

  protected add(): void {
    const { date, time, minutes } = this.form.getRawValue();
    const start = new Date(`${date}T${time}:00`);
    const end = new Date(start.getTime() + Number(minutes) * 60_000);
    this.busy.set(true);
    this.api.createSlot(start.toISOString(), end.toISOString()).subscribe({
      next: () => {
        this.busy.set(false);
        this.notify('Слот добавлен', true);
        this.list.reload();
      },
      error: (e: unknown) => {
        this.busy.set(false);
        this.notify(errorText(e), false);
      },
    });
  }

  protected remove(id: number, booked: boolean): void {
    if (booked && !confirm('На этот слот есть заявка. Удалить слот? Заявка останется без времени.'))
      return;
    this.api.deleteSlot(id).subscribe({
      next: () => {
        this.notify('Слот удалён', true);
        this.list.reload();
      },
      error: (e: unknown) => this.notify(errorText(e), false),
    });
  }

  private notify(text: string, ok: boolean): void {
    this.message.set(text);
    this.messageOk.set(ok);
  }
}
