/// <reference lib="webworker" />
import { env, pipeline, type FeatureExtractionPipeline } from '@huggingface/transformers';
import { semanticAssetRoot, semanticCacheName, runtimeRoot, wasmFile, type PictogramSearchPackage } from './pictogram-semantic-assets';
import { PictogramVectorIndex, pictogramMeaning } from './pictogram-vector-index';

export type SemanticRequest = { id: number; value: PictogramSearchPackage } & (
  { type: 'prepare' } | { type: 'search'; query: string; allowed: number[] }
);
export type SemanticResponse = { id: number; ids: number[] } | { id: number; error: string };

let encoder: { revision: string; model: string; promise: Promise<FeatureExtractionPipeline> } | undefined;
let indexed: { version: string; promise: Promise<PictogramVectorIndex> } | undefined;

async function loadEncoder(value: PictogramSearchPackage): Promise<FeatureExtractionPipeline> {
  const cache = await caches.open(semanticCacheName);
  const runtime = await cache.match(runtimeRoot + wasmFile);
  if (!runtime) throw new Error('Missing semantic runtime');
  env.useBrowserCache = false;
  env.useCustomCache = true;
  env.customCache = cache;
  env.allowLocalModels = true;
  env.allowRemoteModels = false;
  const wasm = env.backends.onnx.wasm;
  if (wasm) {
    wasm.numThreads = 1;
    wasm.wasmPaths = new URL(runtimeRoot, self.location.origin).href;
    if (!wasm.wasmBinary) wasm.wasmBinary = await runtime.arrayBuffer();
  }
  return pipeline<'feature-extraction'>('feature-extraction', value.model, {
    revision: value.revision, device: 'wasm', dtype: 'q8', local_files_only: true,
  });
}

async function loadIndex(value: PictogramSearchPackage): Promise<PictogramVectorIndex> {
  const cache = await caches.open(semanticCacheName);
  const resource = await cache.match(semanticAssetRoot + value.index);
  if (!resource) throw new Error('Missing pictogram index');
  return new PictogramVectorIndex(await resource.arrayBuffer(), value.dimension, value.count);
}

// Run requests in sequence so an update can safely replace the model in memory.
let queue: Promise<void> = Promise.resolve();
self.addEventListener('message', ({ data }: MessageEvent<SemanticRequest>) => {
  queue = queue.then(async () => {
    const { id, value } = data;
    try {
      if (encoder?.revision !== value.revision || encoder.model !== value.model) {
        if (encoder) await (await encoder.promise).dispose();
        encoder = { revision: value.revision, model: value.model, promise: loadEncoder(value) };
      }
      if (indexed?.version !== value.version) indexed = { version: value.version, promise: loadIndex(value) };
      const [model, index] = await Promise.all([encoder.promise, indexed.promise]);
      let ids: number[] = [];
      if (data.type === 'search') {
        const meaning = pictogramMeaning(data.query);
        const query = await model(`query: ${meaning.text}`, { pooling: 'mean', normalize: true });
        ids = index.search(query.data as Float32Array, new Set(data.allowed), meaning.preferred);
      }
      self.postMessage({ id, ids } satisfies SemanticResponse);
    } catch (error) {
      if (encoder) await encoder.promise.then((model) => model.dispose()).catch(() => undefined);
      encoder = undefined;
      indexed = undefined;
      self.postMessage({ id, error: error instanceof Error ? error.message : String(error) } satisfies SemanticResponse);
    }
  });
});
