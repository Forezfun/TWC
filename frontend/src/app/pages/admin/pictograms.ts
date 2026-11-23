import { Component, computed, inject, linkedSignal, signal } from '@angular/core';
import { errorText } from '../../core/admin-api';
import { PictogramApi } from '../../core/pictogram-api';
import { ARASAAC_SET_ID, PICTOGRAM_CATEGORIES, PictogramCategory, PictogramSelection } from '../../core/pictogram-catalog';
import { ImportedPictograms } from '../../core/pictogram-import';
import { ArasaacCredit } from '../../ui/arasaac-credit';
import { PictogramThumbnail } from '../../ui/pictogram-thumbnail';
import { PictogramImport } from './pictogram-import';
import { PictogramPages } from './pictogram-pages';
import { pictogramSearch } from './pictogram-search';

@Component({
  imports: [ArasaacCredit, PictogramImport, PictogramPages, PictogramThumbnail],
  templateUrl: './pictograms.html',
  styleUrl: './pictograms.scss',
})
export class AdminPictograms {
  private readonly api = inject(PictogramApi);
  protected readonly library = this.api.library(() => true);
  protected readonly query = signal('');
  protected readonly categoryFilter = signal<ReadonlySet<PictogramCategory> | null>(null);
  protected readonly busy = signal(false);
  protected readonly importMessage = signal('');
  protected readonly savedMessage = signal('');
  protected readonly saveError = signal('');
  protected readonly selection = linkedSignal(() => this.library.hasValue() ? this.library.value().selection : null);
  protected readonly selectedIds = computed(() => new Set(this.selection()?.pictogram_ids));
  protected readonly arasaacSetId = ARASAAC_SET_ID;
  protected readonly activeSet = computed(() => {
    const setId = this.selection()?.set_id;
    if (!this.library.hasValue()) return undefined;
    return this.library.value().sets.find((set) => set.id === setId);
  });
  private readonly setPictograms = computed(() => {
    if (!this.library.hasValue()) return [];
    const available = new Set(this.activeSet()?.pictogram_ids);
    return this.library.value().pictograms.filter(({ id }) => available.has(id));
  });
  protected readonly categories = computed(() => {
    const available = new Set(this.setPictograms().map(({ category }) => category));
    return PICTOGRAM_CATEGORIES.filter((category) => available.has(category));
  });
  private readonly candidates = computed(() => {
    const categories = this.categoryFilter();
    const items = this.setPictograms();
    return categories ? items.filter(({ category }) => categories.has(category)) : items;
  });
  protected readonly visible = pictogramSearch(this.candidates, this.query);
  protected readonly pageSize = 60;
  protected readonly page = linkedSignal({ source: this.visible, computation: () => 0 });
  protected readonly pagePictograms = computed(() => {
    const start = this.page() * this.pageSize;
    return this.visible().slice(start, start + this.pageSize);
  });
  protected readonly hasChanges = computed(() => {
    const selection = this.selection();
    if (!this.library.hasValue() || !selection) return false;
    const saved = this.library.value().selection;
    const ids = this.selectedIds();
    return saved.set_id !== selection.set_id
      || saved.pictogram_ids.length !== ids.size
      || saved.pictogram_ids.some((id) => !ids.has(id));
  });

  protected chooseSet(id: string): void {
    if (!this.library.hasValue()) return;
    const { sets, selection } = this.library.value();
    const set = sets.find((candidate) => candidate.id === id);
    if (!set) return;
    this.changeSelection(id === selection.set_id ? selection : { set_id: id, pictogram_ids: set.pictogram_ids });
    this.query.set('');
    this.selectAllCategories();
  }

  protected selectAllCategories(): void {
    this.categoryFilter.set(null);
  }

  protected finishImport({ set, pictograms }: ImportedPictograms): void {
    this.importMessage.set(`Набор «${set.title}» загружен. Чтобы использовать его в редакторе, сохраните подборку.`);
    if (!this.library.hasValue()) {
      this.library.reload();
      return;
    }
    const draft = this.selection();
    const keepDraft = this.hasChanges();
    const library = this.library.value();
    if (!library.sets.some(({ id }) => id === set.id)) {
      this.library.value.set({
        ...library, sets: [...library.sets, set], pictograms: [...library.pictograms, ...pictograms],
      });
    }
    if (keepDraft && draft) {
      this.changeSelection(draft);
      return;
    }
    this.chooseSet(set.id);
  }

  protected toggleCategory(category: PictogramCategory, checked: boolean): void {
    const categories = new Set(this.categoryFilter() ?? this.categories());
    if (checked) categories.add(category);
    else categories.delete(category);
    this.categoryFilter.set(categories);
  }

  protected toggle(id: string, checked: boolean): void {
    const selection = this.selection();
    if (!selection) return;
    const ids = new Set(selection.pictogram_ids);
    if (checked) ids.add(id);
    else ids.delete(id);
    this.changeSelection({ ...selection, pictogram_ids: [...ids] });
  }

  protected save(): void {
    const selection = this.selection();
    if (this.busy() || !this.hasChanges() || !this.library.hasValue() || !selection) return;
    this.savedMessage.set('');
    this.saveError.set('');
    this.busy.set(true);
    this.api.save(selection).subscribe({
      next: (saved) => {
        this.library.value.update((library) => library && { ...library, selection: saved });
        this.savedMessage.set('Подборка сохранена. Редактор использует выбранные пиктограммы.');
        this.busy.set(false);
      },
      error: (error: unknown) => {
        this.saveError.set(errorText(error, 'Не удалось сохранить подборку. Попробуйте ещё раз.'));
        this.busy.set(false);
      },
    });
  }

  private changeSelection(selection: PictogramSelection): void {
    this.selection.set(selection);
    this.savedMessage.set('');
    this.saveError.set('');
  }
}
