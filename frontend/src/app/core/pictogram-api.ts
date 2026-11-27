import { HttpClient, httpResource } from '@angular/common/http';
import { Service, computed, inject } from '@angular/core';
import { Api } from './api';
import { PictogramLibrary, PictogramSelection } from './pictogram-catalog';

export type PictogramScope = 'all' | 'light' | 'selected';
import { ImportedPictograms } from './pictogram-import';

@Service()
export class PictogramApi {
  private readonly http = inject(HttpClient);
  private readonly url = inject(Api).url('/admin/pictograms');

  /**
   * `selected` — только отмеченные пиктограммы (редактор сценариев);
   * `light` — без большого каталога ARASAAC, пока он не выбран; `all` — всё.
   */
  library(enabled: () => boolean, scope: () => PictogramScope = () => 'all') {
    const request = computed(() => {
      if (!enabled()) return undefined;
      const value = scope();
      return value === 'all' ? this.url : `${this.url}?scope=${value}`;
    });
    return httpResource<PictogramLibrary>(() => request());
  }

  save(selection: PictogramSelection) {
    return this.http.put<PictogramSelection>(this.url, selection);
  }

  importBundle(bundle: Blob) {
    return this.http.post<ImportedPictograms>(this.url + '/import', bundle, {
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
