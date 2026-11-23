import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { PictogramApi } from './pictogram-api';

it('загружает пиктограммы при открытии редактора и не запрашивает их заново при вводе текста', async () => {
  TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
  const http = TestBed.inject(HttpTestingController);
  const draft = signal<{ title: string } | null>(null);
  const library = TestBed.runInInjectionContext(() => TestBed.inject(PictogramApi).library(() => draft() !== null));
  TestBed.tick();
  http.expectNone('/api/admin/pictograms');

  draft.set({ title: '' });
  TestBed.tick();
  http.expectOne('/api/admin/pictograms').flush({ pictograms: [], sets: [], selection: { set_id: 'kolibri-all', pictogram_ids: [] } });
  await new Promise((resolve) => setTimeout(resolve, 0));

  for (const title of ['С', 'Сц', 'Сценарий']) {
    draft.set({ title });
    TestBed.tick();
    http.expectNone('/api/admin/pictograms');
    expect(library.isLoading()).toBe(false);
  }

  draft.set(null);
  TestBed.tick();
  draft.set({ title: 'Новый сценарий' });
  TestBed.tick();
  http.expectOne('/api/admin/pictograms').flush({ pictograms: [], sets: [], selection: { set_id: 'kolibri-all', pictogram_ids: [] } });
  http.verify();
});
