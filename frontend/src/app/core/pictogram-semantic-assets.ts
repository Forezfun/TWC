export interface PictogramSearchPackage {
  schema: 1;
  version: string;
  model: string;
  revision: string;
  index: string;
  dimension: number;
  count: number;
  indexBytes: number;
  fileSizes?: Record<string, number>;
}

export const semanticAssetRoot = '/kolibri/pictogram-search/';
export const semanticCacheName = 'twc-pictogram-search-v1';
export const installedPackageUrl = `${semanticAssetRoot}installed-package`;
export const runtimeRoot = `${semanticAssetRoot}runtime-3.8.1/`;
export const wasmFile = 'ort-wasm-simd-threaded.jsep.wasm';
const modelFiles = ['config.json', 'tokenizer.json', 'tokenizer_config.json', 'onnx/model_quantized.onnx'];

export function parseSearchPackage(input: unknown): PictogramSearchPackage {
  const value = input as PictogramSearchPackage | null;
  if (!value || value.schema !== 1 || typeof value.version !== 'string' || !/^[a-z0-9-]{1,64}$/.test(value.version)
    || !/^[\w-]+\/\w[\w.-]*$/.test(value.model) || !/^[a-f0-9]{40}$/.test(value.revision)
    || !/^arasaac-[a-f0-9]{12}\.bin$/.test(value.index)
    || !Number.isInteger(value.dimension) || value.dimension < 1 || value.dimension > 2048
    || !Number.isInteger(value.count) || value.count < 1 || value.count > 100_000
    || value.indexBytes !== value.count * (4 + value.dimension)) {
    throw new Error('Invalid semantic search package');
  }
  if (value.fileSizes && [...modelFiles, wasmFile].some((name) =>
    !Number.isSafeInteger(value.fileSizes?.[name]) || value.fileSizes![name] <= 0)) {
    throw new Error('Invalid semantic search file sizes');
  }
  return value;
}

export function searchPackageFiles(value: PictogramSearchPackage): { url: string; bytes?: number }[] {
  const modelUrl = `https://huggingface.co/${value.model}/resolve/${value.revision}/`;
  return [
    ...modelFiles.map((name) => ({ url: modelUrl + name, bytes: value.fileSizes?.[name] })),
    { url: runtimeRoot + wasmFile, bytes: value.fileSizes?.[wasmFile] },
    { url: semanticAssetRoot + value.index, bytes: value.indexBytes },
  ];
}
