import { TestBed } from '@angular/core/testing';
import { installedPackageUrl, searchPackageFiles, type PictogramSearchPackage } from './pictogram-semantic-assets';
import { PictogramSemanticSearch } from './pictogram-semantic-search';
import { PictogramVectorIndex, pictogramMeaning } from './pictogram-vector-index';

it('keeps the selected mode across reloads and reuses cached model files for an index update', async () => {
  const initial: PictogramSearchPackage = {
    schema: 1, version: 'demo-1', model: 'demo/test', revision: 'a'.repeat(40),
    index: 'arasaac-aaaaaaaaaaaa.bin', dimension: 2, count: 1, indexBytes: 6,
    fileSizes: {
      'config.json': 5, 'tokenizer.json': 5, 'tokenizer_config.json': 5,
      'onnx/model_quantized.onnx': 5, 'ort-wasm-simd-threaded.jsep.wasm': 5,
    },
  };
  const update = { ...initial, version: 'demo-2', index: 'arasaac-bbbbbbbbbbbb.bin' };
  let latest = initial;
  let failPreparation = true;
  const saved = new Map<string, Response>();
  const urlFor = (url: string) => new URL(url, window.location.origin).href;
  let firstFile: ReadableStreamDefaultController<Uint8Array> | undefined;
  const fetchAsset = vi.fn(async (url: string) => {
    if (url.endsWith('manifest.json')) return Response.json(latest);
    if (url === searchPackageFiles(initial)[0].url) {
      return new Response(new ReadableStream<Uint8Array>({ start: (controller) => { firstFile = controller; } }));
    }
    return new Response(url.endsWith('.bin') ? '123456' : 'asset');
  });
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  const modeKey = 'twc-pictogram-search-mode';
  const previousMode = localStorage.getItem(modeKey);
  localStorage.removeItem(modeKey);
  vi.stubGlobal('fetch', fetchAsset);
  vi.stubGlobal('caches', {
    open: async () => ({
      match: async (url: string) => saved.get(urlFor(url))?.clone(),
      put: async (url: string, response: Response) => {
        saved.set(urlFor(url), new Response(await response.arrayBuffer(), { headers: response.headers }));
      },
      keys: async () => [...saved.keys()].map((url) => ({ url })),
    }),
  });
  vi.stubGlobal('Worker', class extends EventTarget {
    postMessage({ id }: { id: number }) {
      queueMicrotask(() => this.dispatchEvent(new MessageEvent('message', {
        data: failPreparation ? { id, error: 'Cannot load' } : { id, ids: [] },
      })));
    }
    terminate() {}
  });
  try {
    const first = TestBed.inject(PictogramSemanticSearch);
    first.refresh();
    await vi.waitFor(() => expect(first.checked()).toBe(true));
    expect(first.installed()).toBeNull();
    first.selectMode('contextual');
    expect(first.mode()).toBe('exact');
    expect(first.contextualPackage()).toBeNull();
    const installation = first.install();
    await vi.waitFor(() => expect(firstFile).toBeDefined());
    firstFile!.enqueue(new Uint8Array(3));
    await vi.waitFor(() => expect(first.progress()).toEqual({ percent: 9, checking: false }));
    firstFile!.enqueue(new Uint8Array(2));
    firstFile!.close();
    await installation;
    expect(saved.has(urlFor(installedPackageUrl))).toBe(false);
    expect(first.message()).toContain('Не удалось');

    failPreparation = false;
    fetchAsset.mockClear();
    await first.install();
    expect(first.installed()?.version).toBe(initial.version);
    expect(first.mode()).toBe('contextual');
    expect(first.contextualPackage()?.version).toBe(initial.version);
    expect(fetchAsset).not.toHaveBeenCalled();
    first.selectMode('exact');
    expect(first.contextualPackage()).toBeNull();

    TestBed.resetTestingModule();
    latest = update;
    const reopened = TestBed.inject(PictogramSemanticSearch);
    reopened.refresh();
    await vi.waitFor(() => expect(reopened.checked()).toBe(true));
    expect(reopened.installed()?.version).toBe(initial.version);
    expect(reopened.updateAvailable()).toBe(true);
    expect(reopened.mode()).toBe('exact');
    expect(reopened.contextualPackage()).toBeNull();
    fetchAsset.mockClear();
    await reopened.install();
    expect(fetchAsset.mock.calls.map(([url]) => url)).toEqual([searchPackageFiles(update).at(-1)?.url]);
    expect(reopened.installed()?.version).toBe(update.version);
    expect(reopened.updateAvailable()).toBe(false);
    expect(reopened.mode()).toBe('exact');
    reopened.selectMode('contextual');
    expect(reopened.contextualPackage()?.version).toBe(update.version);
  } finally {
    TestBed.resetTestingModule();
    if (previousMode === null) localStorage.removeItem(modeKey);
    else localStorage.setItem(modeKey, previousMode);
    warn.mockRestore();
    vi.unstubAllGlobals();
  }
});

it('ranks similar vectors inside the selection and resolves the Russian repetition synonyms', () => {
  const bytes = new ArrayBuffer(18);
  new Uint32Array(bytes, 0, 3).set([11, 12, 13]);
  new Int8Array(bytes, 12).set([127, 0, 0, 127, 100, 75]);
  const index = new PictogramVectorIndex(bytes, 2, 3);
  const query = new Float32Array([1, 0]);
  expect(index.search(query, new Set([11, 12, 13]))).toEqual([11]);
  expect(index.search(query, new Set([12, 13]))).toEqual([13]);
  expect(pictogramMeaning('Снова!')).toEqual(pictogramMeaning('заново'));
  expect(pictogramMeaning('сначала')).toEqual(pictogramMeaning('заново'));
  expect(pictogramMeaning('сначала вымой руки').preferred).toEqual([]);
});
