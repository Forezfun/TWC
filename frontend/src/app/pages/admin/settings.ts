import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { AdminApi, errorText } from '../../core/admin-api';

@Component({
  imports: [FormsModule],
  template: `
    <p class="muted">
      Тексты, ссылки и контакты, которые показывает сайт. Сохраняется каждая строка отдельно.
    </p>
    @if (message()) {
      <p [class]="'notice ' + (messageOk() ? 'notice--ok' : 'notice--err')">{{ message() }}</p>
    }
    <div class="stack">
      @for (s of list.value(); track s.key) {
        <div class="card form-grid">
          <div>
            <strong>{{ s.key }}</strong>
            <p class="muted" style="font-size:.9rem">{{ s.description || hints[s.key] || '' }}</p>
          </div>
          <div class="stack">
            @if (s.key === 'registration_open') {
              <select
                class="input"
                [ngModel]="s.value"
                (ngModelChange)="save(s.key, $event)"
                [attr.aria-label]="s.key"
              >
                <option value="true">Запись открыта</option>
                <option value="false">Запись закрыта</option>
              </select>
            } @else {
              <textarea
                class="input"
                rows="2"
                [ngModel]="s.value"
                #t
                [attr.aria-label]="s.key"
              ></textarea>
              <button
                type="button"
                class="btn btn--secondary btn--sm"
                (click)="save(s.key, t.value)"
              >
                Сохранить
              </button>
            }
          </div>
        </div>
      }
      <form
        class="card form-grid"
        (ngSubmit)="save(newKey, newValue, newDesc); newKey = ''; newValue = ''; newDesc = ''"
        novalidate
      >
        <label class="field"
          ><span>Новый ключ</span
          ><input
            class="input"
            [(ngModel)]="newKey"
            name="key"
            pattern="[a-z0-9_]+"
            placeholder="например, phone"
        /></label>
        <label class="field"
          ><span>Описание</span><input class="input" [(ngModel)]="newDesc" name="desc"
        /></label>
        <label class="field span2"
          ><span>Значение</span
          ><textarea class="input" rows="2" [(ngModel)]="newValue" name="value"></textarea>
        </label>
        <button type="submit" class="btn btn--primary" [disabled]="!newKey">
          Добавить настройку
        </button>
      </form>
    </div>
  `,
})
export class AdminSettings {
  private readonly api = inject(AdminApi);
  protected readonly list = this.api.settings();
  protected readonly message = signal<string | null>(null);
  protected readonly messageOk = signal(true);
  protected newKey = '';
  protected newValue = '';
  protected newDesc = '';
  protected readonly hints: Record<string, string> = {
    welcome_text: 'Приветствие на главном экране',
    donate_url: 'Ссылка на страницу пожертвований',
    donate_message: 'Сообщение перед переходом к пожертвованию',
    coordinator_contact: 'Контакт координатора (телефон, Telegram)',
    registration_open: 'Открыта ли запись на консультацию',
  };

  protected save(key: string, value: string, description?: string): void {
    if (!key) return;
    this.api.saveSetting(key, value, description || undefined).subscribe({
      next: () => {
        this.message.set(`Сохранено: ${key}`);
        this.messageOk.set(true);
        this.list.reload();
      },
      error: (e: unknown) => {
        this.message.set(errorText(e));
        this.messageOk.set(false);
      },
    });
  }
}
