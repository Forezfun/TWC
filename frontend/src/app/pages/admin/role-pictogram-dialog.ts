import { Component, ElementRef, computed, inject, linkedSignal, output, signal, viewChild } from '@angular/core';
import { PictogramApi } from '../../core/pictogram-api';
import { PictogramThumbnail } from '../../ui/pictogram-thumbnail';
import { PictogramPages } from './pictogram-pages';
import { pictogramSearch } from './pictogram-search';

@Component({
  selector: 'twc-role-pictogram-dialog',
  imports: [PictogramThumbnail, PictogramPages],
  template: `
    <dialog #picker class="stack" aria-labelledby="role-pictogram-title" (close)="opened.set(false)">
      <h3 id="role-pictogram-title">Пиктограмма роли</h3>
      @if (library.error()) {
        <p role="alert">Не удалось загрузить пиктограммы.</p>
        <button type="button" class="btn btn--secondary btn--sm" (click)="library.reload()">Повторить</button>
      } @else if (library.isLoading()) {
        <p role="status">Загружаем пиктограммы…</p>
      } @else {
        <label class="field">Искать в подборке
          <input class="input" type="search" [value]="query()" (input)="query.set($event.target.value)" />
        </label>
        <div class="icon-options">
          @for (symbol of pageSymbols(); track symbol.id) {
            <button type="button" class="btn btn--secondary btn--sm" [attr.aria-pressed]="selected() === symbol.url"
              (click)="choose(symbol.url)">
              <twc-pictogram-thumbnail [url]="symbol.url" [size]="36" />
              <span>{{ symbol.title }}</span>
            </button>
          } @empty { <p>Пиктограммы не найдены.</p> }
        </div>
        @if (matches().length > pageSize) {
          <twc-pictogram-pages [(page)]="page" [total]="matches().length" [pageSize]="pageSize" />
        }
      }
      <div class="actions">
        <button type="button" class="btn btn--secondary btn--sm" (click)="choose(null)">Значок по умолчанию</button>
        <button type="button" class="btn btn--ghost btn--sm" (click)="picker.close()">Закрыть</button>
      </div>
    </dialog>
  `,
  styles: [`
    dialog { width: min(700px, calc(100% - 24px)); max-height: 85dvh; padding: 18px;
      border: 1px solid var(--line); border-radius: var(--radius); }
    dialog::backdrop { background: #12232d66; }
    .icon-options { display: grid; grid-template-columns: repeat(auto-fill, minmax(min(100%, 8rem), 1fr)); gap: 8px; }
    .icon-options button { display: grid; grid-template-columns: minmax(0, 1fr); min-inline-size: 0;
      justify-items: center; gap: 4px; white-space: normal; overflow-wrap: anywhere; }
    .icon-options button span { max-inline-size: 100%; }
    .icon-options button[aria-pressed='true'] { background: var(--card); }
    .actions { display: flex; flex-wrap: wrap; gap: 8px; }
  `],
})
export class RolePictogramDialog {
  private readonly picker = viewChild.required<ElementRef<HTMLDialogElement>>('picker');
  readonly chosen = output<string | null>();
  protected readonly opened = signal(false);
  protected readonly selected = signal<string | null>(null);
  protected readonly query = signal('');
  protected readonly library = inject(PictogramApi).library(this.opened);
  private readonly symbols = computed(() => {
    if (!this.library.hasValue()) return [];
    const { pictograms, selection } = this.library.value();
    const ids = new Set(selection.pictogram_ids);
    return pictograms.filter((symbol) => ids.has(symbol.id));
  });
  protected readonly matches = pictogramSearch(this.symbols, this.query);
  protected readonly page = linkedSignal({ source: this.matches, computation: () => 0 });
  protected readonly pageSize = 24;
  protected readonly pageSymbols = computed(() => {
    const start = this.page() * this.pageSize;
    return this.matches().slice(start, start + this.pageSize);
  });

  open(url?: string | null): void {
    this.query.set('');
    this.selected.set(url ?? null);
    this.opened.set(true);
    this.picker().nativeElement.showModal();
  }

  protected choose(url: string | null): void {
    this.chosen.emit(url);
    this.picker().nativeElement.close();
  }
}
