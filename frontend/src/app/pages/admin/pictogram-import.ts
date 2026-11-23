import { DOCUMENT, ElementRef, Component, computed, inject, output, signal, viewChild } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { errorText } from '../../core/admin-api';
import { PictogramApi } from '../../core/pictogram-api';
import { PICTOGRAM_CATEGORIES, PictogramCategory } from '../../core/pictogram-catalog';
import {
  ImportedPictograms, PICTOGRAM_BUNDLE_BYTES, PICTOGRAM_IMAGE_BYTES, PICTOGRAM_IMAGE_TYPES,
  PICTOGRAM_SET_LIMIT, PictogramBundle, PictogramImageType,
} from '../../core/pictogram-import';

type LocalPictogram = {
  file: File;
  mime: PictogramImageType;
  title: string;
  category: PictogramCategory;
  aliases: string;
};

const typesByExtension: Record<string, PictogramImageType> = {
  png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp',
};

function encodeImage(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(',', 2)[1] ?? '');
    reader.onerror = () => reject(new Error(`Не удалось прочитать «${file.name}».`));
    reader.readAsDataURL(file);
  });
}

@Component({
  selector: 'twc-pictogram-import',
  templateUrl: './pictogram-import.html',
  styleUrl: './pictogram-import.scss',
})
export class PictogramImport {
  private readonly api = inject(PictogramApi);
  private readonly document = inject(DOCUMENT);
  private readonly dialog = viewChild.required<ElementRef<HTMLDialogElement>>('dialog');
  protected readonly mode = signal<'manual' | 'json'>('manual');
  protected readonly title = signal('');
  protected readonly items = signal<readonly LocalPictogram[]>([]);
  protected readonly bundleFile = signal<File | null>(null);
  protected readonly busy = signal(false);
  protected readonly problem = signal('');
  protected readonly copyMessage = signal('');
  protected readonly showPrompt = signal(false);
  protected readonly categories = PICTOGRAM_CATEGORIES;
  protected readonly accept = PICTOGRAM_IMAGE_TYPES.join(',') + ',.png,.jpg,.jpeg,.webp';
  readonly imported = output<ImportedPictograms>();
  protected readonly canSubmit = computed(() => {
    if (this.busy()) return false;
    if (this.mode() === 'json') {
      const size = this.bundleFile()?.size ?? 0;
      return size > 0 && size <= PICTOGRAM_BUNDLE_BYTES;
    }
    return Boolean(this.title().trim() && this.items().length && this.items().every(({ title }) => title.trim()));
  });
  protected readonly prompt = `Добавь новый набор пиктограмм в админ-панель «Колибри» без изменения кода и повторного развёртывания.

1. Возьми предоставленные мной изображения. Для каждого укажи понятное название на русском, категорию и ключевые слова для поиска. Используй изображения, на публикацию которых есть разрешение. PNG, JPEG или WebP, максимум 512 КиБ на изображение. SVG сначала преобразуй в PNG или WebP.
2. Подготовь JSON в UTF-8. У набора должно быть уникальное название, не более 250 картинок и общий размер JSON до 16 МиБ. Названия до 120 символов, до 20 ключевых слов на картинку, каждое до 80 символов. Категории: ${PICTOGRAM_CATEGORIES.join(', ')}.
3. Формат: {"version":1,"title":"Название набора","pictograms":[{"title":"Остановиться","category":"Действия","aliases":["стоп","подождать"],"image":{"mime_type":"image/png","base64":"<байты изображения в стандартном base64 без префикса data:>"}}]}. Подставь реальные данные всех картинок.
4. В открытой авторизованной админ-панели перейди в «Пиктограммы» → «Загрузить пиктограммы» → «Из JSON», выбери подготовленный файл и нажми «Загрузить набор». Если у тебя уже есть авторизованный доступ к API, можно отправить тот же JSON методом POST на /api/admin/pictograms/import с Content-Type: application/json и Authorization: Bearer <токен из авторизованного окружения>. Не выводи токен в чате, файлах и логах. При 201 набор создан, при 200 тот же набор уже существует. Проверь, что набор появился в списке.
5. Если я прошу активировать набор в редакторе, выбери его и нажми «Сохранить подборку». Через API для этого отправь PUT /api/admin/pictograms с JSON {"set_id":"<set.id из ответа импорта>","pictogram_ids":["<идентификаторы из set.pictogram_ids>"]}.`;

  open(): void {
    this.dialog().nativeElement.showModal();
  }

  protected close(): void {
    if (!this.busy()) this.dialog().nativeElement.close();
  }

  protected chooseMode(mode: 'manual' | 'json'): void {
    this.mode.set(mode);
    this.problem.set('');
  }

  protected addFiles(input: HTMLInputElement): void {
    const files = Array.from(input.files ?? []);
    input.value = '';
    this.problem.set('');
    if (files.length + this.items().length > PICTOGRAM_SET_LIMIT) {
      this.problem.set('В наборе может быть не более 250 пиктограмм.');
      return;
    }
    const rows: LocalPictogram[] = [];
    for (const file of files) {
      const extension = file.name.split('.').at(-1)?.toLowerCase() ?? '';
      const mime = PICTOGRAM_IMAGE_TYPES.find((type) => type === file.type) ?? typesByExtension[extension];
      if (!mime || !file.size || file.size > PICTOGRAM_IMAGE_BYTES) {
        this.problem.set(`Проверьте «${file.name}». Допустимы PNG, JPEG и WebP до 512 КБ.`);
        return;
      }
      const title = file.name.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ').trim().slice(0, 120);
      rows.push({ file, mime, title, category: 'Другое', aliases: '' });
    }
    this.items.update((current) => [...current, ...rows]);
  }

  protected chooseBundle(input: HTMLInputElement): void {
    const file = input.files?.item(0) ?? null;
    this.bundleFile.set(file);
    this.problem.set(file && (!file.size || file.size > PICTOGRAM_BUNDLE_BYTES)
      ? 'Выберите непустой файл JSON размером до 16 МБ.' : '');
  }

  protected changeItem(index: number, patch: Partial<Pick<LocalPictogram, 'title' | 'category' | 'aliases'>>): void {
    this.items.update((items) => items.map((item, position) => position === index ? { ...item, ...patch } : item));
  }

  protected changeCategory(index: number, value: string): void {
    const category = this.categories.find((item) => item === value);
    if (category) this.changeItem(index, { category });
  }

  protected removeItem(index: number): void {
    this.items.update((items) => items.filter((_, position) => position !== index));
  }

  protected async copyPrompt(): Promise<void> {
    try {
      if (!navigator.clipboard) throw new Error('Clipboard unavailable');
      await navigator.clipboard.writeText(this.prompt);
      this.copyMessage.set('Промпт скопирован.');
    } catch {
      const field = this.document.createElement('textarea');
      field.value = this.prompt;
      field.setAttribute('readonly', '');
      field.style.cssText = 'position:fixed;top:0;left:0;opacity:0;pointer-events:none';
      const focused = this.document.activeElement;
      this.dialog().nativeElement.append(field);
      field.select();
      try {
        if (this.document.execCommand('copy')) {
          this.copyMessage.set('Промпт скопирован.');
          return;
        }
      } catch {
        // Some browsers disallow copying on HTTP or in a restricted window.
      } finally {
        field.remove();
        if (focused instanceof HTMLElement) focused.focus();
      }
      this.showPrompt.set(true);
      this.copyMessage.set('Выделите и скопируйте текст промпта.');
    }
  }

  protected async submit(event: SubmitEvent): Promise<void> {
    event.preventDefault();
    if (!this.canSubmit()) return;
    this.busy.set(true);
    this.problem.set('');
    try {
      const file = this.mode() === 'manual' ? await this.manualBundle() : this.bundleFile();
      if (!file?.size || file.size > PICTOGRAM_BUNDLE_BYTES) {
        this.problem.set('Выберите непустой файл JSON размером до 16 МБ.');
        return;
      }
      this.imported.emit(await firstValueFrom(this.api.importBundle(file)));
      this.title.set('');
      this.items.set([]);
      this.bundleFile.set(null);
      this.mode.set('manual');
      this.dialog().nativeElement.close();
    } catch (error) {
      this.problem.set(errorText(error, error instanceof Error && error.message
        ? error.message : 'Не удалось загрузить набор. Попробуйте ещё раз.'));
    } finally {
      this.busy.set(false);
    }
  }

  private async manualBundle(): Promise<Blob> {
    const rows = this.items();
    if (rows.reduce((size, { file }) => size + 4 * Math.ceil(file.size / 3), 0) > PICTOGRAM_BUNDLE_BYTES) {
      throw new Error('Набор должен занимать не более 16 МБ. Уменьшите изображения или число файлов.');
    }
    const metadata = rows.map(({ title, category, aliases }) => ({
      title: title.trim(), category, aliases: aliases.split(',').map((alias) => alias.trim()).filter(Boolean),
    }));
    if (metadata.some(({ aliases }) => aliases.length > 20 || aliases.some((alias) => alias.length > 80))) {
      throw new Error('Укажите до 20 ключевых слов на пиктограмму, каждое до 80 символов.');
    }
    const pictograms = await Promise.all(rows.map(async ({ file, mime }, index) => ({
      ...metadata[index], image: { mime_type: mime, base64: await encodeImage(file) },
    })));
    const bundle: PictogramBundle = { version: 1, title: this.title().trim(), pictograms };
    return new Blob([JSON.stringify(bundle)], { type: 'application/json' });
  }
}
