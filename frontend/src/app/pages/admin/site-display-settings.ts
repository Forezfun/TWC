import { Component, computed, inject, linkedSignal, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { errorText } from '../../core/admin-api';
import { INSTRUCTION_MEDIA_MAX_BYTES, InstructionApi } from '../../core/instruction-api';
import { localId } from '../../core/local-id';
import { DEFAULT_SITE_DISPLAY, SUPPORT_KINDS, SiteDisplay, SiteDisplayApi, SiteRole, SupportButton, SupportKind } from '../../core/site-display';
import { RolePictogram } from '../../ui/role-pictogram';
import { AudioPreview } from './audio-preview';
import { MicrophoneDialog } from './microphone-dialog';
import { RolePictogramDialog } from './role-pictogram-dialog';

type RoleAudioField = 'audio_url' | 'hint_audio_url';

@Component({
  selector: 'twc-site-display-settings',
  imports: [FormsModule, AudioPreview, MicrophoneDialog, RolePictogram, RolePictogramDialog],
  templateUrl: './site-display-settings.html',
  styles: [`
    .display-settings { margin-block: 20px 28px; }
    h3.section-title { margin-block-start: 32px; }
    .role-editor + .role-editor { margin-block-start: 12px; }
    .role-editor + .display-actions { margin-block-start: 12px; }
    .role-editor, .button-editor { margin: 0; border: 1px solid var(--line); border-radius: var(--radius);
      padding: 16px 18px; min-inline-size: 0; background: var(--white); }
    .editor-head { display: flex; flex-wrap: wrap; align-items: center; gap: 8px 12px; margin-block-end: 14px; }
    .editor-heading { display: grid; gap: 1px; min-inline-size: 0; justify-items: start; }
    .editor-head__actions { display: flex; gap: 4px; margin-inline-start: auto; }
    .editor-title { font-size: 1.05rem; font-weight: 650; color: var(--heading); overflow-wrap: anywhere; }
    .display-actions { display: flex; flex-wrap: wrap; align-items: center; gap: 8px 10px; }
    .display-actions p { margin: 0; }
    .link-btn { display: inline-flex; align-items: center; min-block-size: 32px; padding: 2px 8px; border: 0; border-radius: 6px;
      background: none; color: var(--primary); font: inherit; font-size: .87rem; font-weight: 600; cursor: pointer; }
    .link-btn:hover { background: var(--card); }
    .link-btn:focus-visible { outline: 2px solid var(--focus); outline-offset: 1px; }
    .link-btn--danger { color: var(--danger); }
    .link-btn--danger:hover { background: var(--danger-bg); }
    .editor-heading .link-btn { min-block-size: 24px; padding: 0; font-weight: 500; }
    .editor-heading .link-btn:hover { background: none; text-decoration: underline; }
    .role-fields { display: grid; gap: 14px 24px; grid-template-columns: repeat(auto-fit, minmax(min(100%, 22rem), 1fr)); }
    .role-field { display: grid; gap: 4px; align-content: start; min-inline-size: 0; }
    .role-field__head { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 0 12px; }
    .role-field__head > label { font-size: .9rem; font-weight: 600; color: var(--heading); }
    .audio-links { display: flex; flex-wrap: wrap; align-items: center; gap: 0 2px; margin-inline-end: -8px; }
    .audio-links__label { font-size: .85rem; color: var(--muted); margin-inline-end: 2px; }
    .button-editors { display: grid; gap: 16px; grid-template-columns: repeat(auto-fit, minmax(min(100%, 26rem), 1fr)); margin-block-start: 12px; }
    .button-editors > * { margin-block-start: 0; }
    .role-visibility { margin: 14px 0 0; padding: 0; border: 0; min-inline-size: 0; }
    .role-visibility legend { font-size: .9rem; font-weight: 600; margin-block-end: 8px; }
    .role-options { display: grid; gap: 8px; grid-template-columns: repeat(auto-fit, minmax(min(100%, 13rem), 1fr)); }
    .role-choice { display: grid; grid-template-columns: auto minmax(0, 1fr) auto; align-items: center;
      gap: 9px; padding: 6px 10px; min-height: 46px; border: 1px solid var(--line);
      border-radius: 10px; cursor: pointer; font-weight: 600; overflow-wrap: anywhere; }
    .role-choice.selected { border-color: var(--primary); color: var(--primary); background: var(--card); }
    .role-choice:focus-within { outline: 2px solid var(--focus); outline-offset: 2px; }
    .role-choice input { inline-size: 18px; block-size: 18px; accent-color: var(--primary); }
    .role-icon { display: grid; place-items: center; flex: none; inline-size: 44px; block-size: 44px;
      border-radius: 10px; background: var(--card); color: var(--primary); }
    .role-icon--button { padding: 0; border: 1px solid transparent; cursor: pointer; }
    .role-icon--button:hover { border-color: var(--primary); }
    .role-icon--button:focus-visible { outline: 2px solid var(--focus); outline-offset: 2px; }
    .role-choice .role-icon { inline-size: 32px; block-size: 32px; background: var(--bg); }
    .save-bar { position: sticky; inset-block-end: 0; z-index: 2; margin-block-start: 20px; padding-block: 12px;
      background: var(--bg); border-block-start: 1px solid var(--line); }
    .file-button { cursor: pointer; }
    .file-button:focus-within { outline: 2px solid var(--focus); outline-offset: 2px; }
  `],
})
export class SiteDisplaySettings {
  private readonly api = inject(SiteDisplayApi);
  private readonly media = inject(InstructionApi);
  protected readonly resource = this.api.adminResource();
  protected readonly draft = linkedSignal<SiteDisplay, SiteDisplay>({
    source: () => this.resource.hasValue() ? this.resource.value() : DEFAULT_SITE_DISPLAY,
    computation: (saved, previous) =>
      previous && previous.value !== previous.source ? previous.value : saved,
  });
  protected readonly kinds = SUPPORT_KINDS;
  protected readonly names = { donate: 'Кнопка пожертвований', volunteer: 'Кнопка для волонтёров' };
  private readonly savedKeys = computed(() =>
    new Set(this.resource.hasValue() ? this.resource.value().roles.map(({ key }) => key) : []));
  protected readonly busy = signal(false);
  protected readonly pictogramRole = signal<string | null>(null);
  protected readonly hasNewRole = computed(() => this.draft().roles.some((role) => !this.savedKeys().has(role.key)));
  protected readonly roleFields = [
    { text: 'title', audio: 'audio_url', label: 'Название роли', audioLabel: 'Озвучка названия', limit: 120 },
    { text: 'hint', audio: 'hint_audio_url', label: 'Короткое описание', audioLabel: 'Озвучка описания', limit: 200 },
  ] as const;
  protected readonly recordingTarget = signal<{ key: string; field: RoleAudioField } | null>(null);
  protected readonly message = signal('');
  protected readonly failed = signal(false);
  protected readonly canSave = computed(() => {
    const { roles, donate, volunteer } = this.draft();
    const titles = roles.map(({ title }) => title.trim().toLocaleLowerCase('ru'));
    return !this.busy() && !!donate.label.trim() && !!volunteer.label.trim()
      && titles.every(Boolean) && new Set(titles).size === titles.length;
  });

  protected addRole(): void {
    this.message.set('');
    this.draft.update((display) => ({
      ...display, roles: [...display.roles, { key: 'role-' + localId(), title: '', hint: '', audio_url: null }],
    }));
  }

  protected removeRole(role: SiteRole): void {
    const saved = this.savedKeys().has(role.key);
    if (saved && !window.confirm(
      `Удалить роль «${role.title}»? После сохранения её сценарии останутся в черновиках.`,
    )) return;
    const key = role.key;
    this.draft.update((display) => ({
      ...display, roles: display.roles.filter((role) => role.key !== key),
      donate: { ...display.donate, role_keys: display.donate.role_keys.filter((role) => role !== key) },
      volunteer: { ...display.volunteer, role_keys: display.volunteer.role_keys.filter((role) => role !== key) },
    }));
    this.notify(saved ? 'Сохраните изменения, чтобы удалить роль.' : '', true);
  }

  protected toggleVisibility(role: SiteRole): void {
    this.editRole(role.key, 'is_hidden', !role.is_hidden);
    this.notify('Сохраните изменения, чтобы обновить видимость роли.', true);
  }

  protected editRole<Field extends keyof Omit<SiteRole, 'key'>>(key: string, field: Field, value: SiteRole[Field]): void {
    this.message.set('');
    this.draft.update((display) => ({
      ...display, roles: display.roles.map((role) => role.key === key ? { ...role, [field]: value } : role),
    }));
  }

  protected editButton(kind: SupportKind, patch: Partial<SupportButton>): void {
    this.message.set('');
    this.draft.update((display) => ({ ...display, [kind]: { ...display[kind], ...patch } }));
  }

  protected toggleRole(kind: SupportKind, key: string, checked: boolean): void {
    const keys = new Set(this.draft()[kind].role_keys);
    if (checked) keys.add(key);
    else keys.delete(key);
    this.editButton(kind, { role_keys: [...keys] });
  }

  protected usePictogram(url: string | null): void {
    const key = this.pictogramRole();
    if (key) this.editRole(key, 'icon_url', url);
  }

  protected upload(key: string, field: RoleAudioField, input: HTMLInputElement): void {
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    if ((!file.type.startsWith('audio/') && file.type !== 'video/mp4') || file.size > INSTRUCTION_MEDIA_MAX_BYTES) {
      this.notify('Выберите аудиофайл размером до 8 МБ.', false);
      return;
    }
    const audio = ['video/mp4', 'audio/x-m4a'].includes(file.type)
      ? file.slice(0, file.size, 'audio/mp4') : file;
    this.busy.set(true);
    this.media.uploadMedia(audio).subscribe({
      next: ({ url }) => {
        this.editRole(key, field, url);
        this.busy.set(false);
        this.notify('Запись добавлена. Сохраните настройки, чтобы применить её.', true);
      },
      error: (error: unknown) => {
        this.busy.set(false);
        this.notify(errorText(error, 'Не удалось загрузить запись.'), false);
      },
    });
  }

  protected useRecording(url: string): void {
    const target = this.recordingTarget();
    if (!target) return;
    this.editRole(target.key, target.field, url);
    this.notify('Запись добавлена. Сохраните настройки, чтобы применить её.', true);
  }

  protected save(): void {
    if (!this.canSave()) return;
    this.busy.set(true);
    this.api.save(this.draft()).subscribe({
      next: (saved) => {
        this.draft.set(saved);
        this.busy.set(false);
        this.notify('Роли и кнопки сохранены.', true);
      },
      error: (error: unknown) => {
        this.busy.set(false);
        this.notify(errorText(error, 'Не удалось сохранить роли и кнопки.'), false);
      },
    });
  }

  private notify(message: string, ok: boolean): void {
    this.message.set(message);
    this.failed.set(!ok);
  }
}
