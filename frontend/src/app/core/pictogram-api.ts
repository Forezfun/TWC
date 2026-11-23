import { HttpClient, httpResource } from '@angular/common/http';
import { Service, computed, inject } from '@angular/core';
import { Api } from './api';
import { PictogramLibrary, PictogramSelection } from './pictogram-catalog';
import { ImportedPictograms } from './pictogram-import';

@Service()
export class PictogramApi {
  private readonly http = inject(HttpClient);
  private readonly url = inject(Api).url('/admin/pictograms');

  library(enabled: () => boolean) {
    const isEnabled = computed(enabled);
    return httpResource<PictogramLibrary>(() => isEnabled() ? this.url : undefined);
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
