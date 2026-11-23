import { Component, computed, input, model } from '@angular/core';

@Component({
  selector: 'twc-pictogram-pages',
  host: { role: 'group', 'aria-label': 'Страницы пиктограмм' },
  styles: `:host { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; }`,
  template: `
    <button type="button" class="btn btn--secondary btn--sm" [disabled]="page() === 0"
      (click)="page.update(previous)">Назад</button>
    <span role="status">Страница {{ page() + 1 }} из {{ pageCount() }}</span>
    <button type="button" class="btn btn--secondary btn--sm" [disabled]="page() + 1 >= pageCount()"
      (click)="page.update(next)">Дальше</button>
  `,
})
export class PictogramPages {
  readonly page = model.required<number>();
  readonly total = input.required<number>();
  readonly pageSize = input.required<number>();
  protected readonly pageCount = computed(() => Math.ceil(this.total() / this.pageSize()));
  protected readonly previous = (page: number) => page - 1;
  protected readonly next = (page: number) => page + 1;
}
