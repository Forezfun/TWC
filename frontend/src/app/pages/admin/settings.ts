import { Component, computed, inject, signal } from '@angular/core';
import { AdminApi, errorText } from '../../core/admin-api';
import { SiteDisplaySettings } from './site-display-settings';

const fields = [
  { key: 'welcome_text', label: 'Приветствие', hint: 'Показывается на экране выбора роли.' },
  { key: 'registration_open', label: 'Запись на консультацию', hint: 'Управляет доступом к форме записи.' },
] as const;

@Component({
  imports: [SiteDisplaySettings],
  template: `
    <h2>Настройки сайта</h2>
    @if (message()) {
      <p class="notice" [class.notice--ok]="!failed()" [class.notice--err]="failed()" [attr.role]="failed() ? 'alert' : 'status'">{{ message() }}</p>
    }
    <twc-site-display-settings />
    @if (list.isLoading()) {
      <p role="status">Загружаем настройки…</p>
    } @else if (list.error()) {
      <p role="alert">Не удалось загрузить настройки.</p>
      <button type="button" class="btn btn--secondary" (click)="list.reload()">Повторить</button>
    } @else {
      <div class="stack">
        @for (setting of settings(); track setting.key) {
          <div class="card form-grid">
            <div>
              <strong>{{ setting.label }}</strong>
              <p class="muted">{{ setting.hint }}</p>
            </div>
            <div class="stack">
              @if (setting.key === 'registration_open') {
                <select #value class="input" [value]="setting.value" [attr.aria-label]="setting.label"
                  [disabled]="saving()" (change)="save(setting.key, value.value)">
                  <option value="true" [selected]="setting.value === 'true'">Запись открыта</option>
                  <option value="false" [selected]="setting.value === 'false'">Запись закрыта</option>
                </select>
              } @else {
                <textarea #value class="input" rows="2" [value]="setting.value" [attr.aria-label]="setting.label"
                  [disabled]="saving()"></textarea>
                <button type="button" class="btn btn--secondary btn--sm" [disabled]="saving()"
                  (click)="save(setting.key, value.value)">Сохранить</button>
              }
            </div>
          </div>
        }
      </div>
    }
  `,
})
export class AdminSettings {
  private readonly api = inject(AdminApi);
  protected readonly list = this.api.settings();
  protected readonly message = signal('');
  protected readonly failed = signal(false);
  protected readonly saving = signal(false);
  protected readonly settings = computed(() => fields.map((field) => {
    const saved = this.list.hasValue() ? this.list.value().find((item) => item.key === field.key) : undefined;
    return { ...field, value: saved?.value ?? (field.key === 'registration_open' ? 'true' : '') };
  }));

  protected save(key: string, value: string): void {
    if (this.saving()) return;
    this.saving.set(true);
    this.api.saveSetting(key, value).subscribe({
      next: () => {
        this.message.set('Настройка сохранена.');
        this.failed.set(false);
        this.saving.set(false);
        this.list.reload();
      },
      error: (error: unknown) => {
        this.message.set(errorText(error));
        this.failed.set(true);
        this.saving.set(false);
        this.list.reload();
      },
    });
  }
}
