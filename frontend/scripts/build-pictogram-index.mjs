import { createHash } from 'node:crypto';
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { env, pipeline } from '@huggingface/transformers';

const model = 'Xenova/multilingual-e5-small';
const revision = '761b726dd34fb83930e26aab4e9ac3899aa1fa78';
const dimension = 384;
const output = new URL('../public/kolibri/pictogram-search/', import.meta.url);
const read = async (name) => JSON.parse(await readFile(new URL(`../../shared/pictograms/${name}.json`, import.meta.url)));
const catalog = await read('arasaac-index');
const basic = new Map((await read('arasaac-basic')).map((item) => [item[0], item]));
const entries = new Map(catalog.map((item) => [item[0], item]));
for (const [id, item] of basic) if (!entries.has(id)) entries.set(id, item);
const items = [...entries.values()].sort(([a], [b]) => a - b);
const rows = Buffer.alloc(items.length * (4 + dimension));
const vectors = new Int8Array(rows.buffer, rows.byteOffset + items.length * 4, items.length * dimension);

env.cacheDir = process.env.TWC_EMBEDDING_CACHE ?? join(tmpdir(), 'twc-embedding-models');
const encode = await pipeline('feature-extraction', model, {
  revision, dtype: 'q8', device: 'cpu',
  session_options: { intraOpNumThreads: 4, interOpNumThreads: 1 },
});
const batchSize = 48;
for (let start = 0; start < items.length; start += batchSize) {
  const batch = items.slice(start, start + batchSize);
  const passages = batch.map(([id, title, category, aliases], row) => {
    rows.writeUInt32LE(id, (start + row) * 4);
    const custom = basic.get(id);
    const keywords = [...new Set([custom?.[1], title, ...(custom?.[3] ?? []), ...aliases])]
      .filter((value) => value && !/^\d+$/u.test(value));
    return `passage: ${keywords.join(', ')}${category === 'Другое' ? '' : `. Категория: ${category}`}`;
  });
  const embedding = await encode(passages, { pooling: 'mean', normalize: true });
  if (embedding.dims.at(-1) !== dimension || embedding.data.length !== batch.length * dimension) {
    throw new Error('Unexpected embedding shape');
  }
  for (let position = 0; position < embedding.data.length; position++) {
    vectors[start * dimension + position] = Math.round(embedding.data[position] * 127);
  }
  if (start % (batchSize * 10) === 0) console.log(`${start + batch.length}/${items.length}`);
}

const hash = createHash('sha256').update(rows).digest('hex');
const index = `arasaac-${hash.slice(0, 12)}.bin`;
const modelFiles = ['config.json', 'tokenizer.json', 'tokenizer_config.json', 'onnx/model_quantized.onnx'];
const wasm = 'ort-wasm-simd-threaded.jsep.wasm';
const fileSizes = Object.fromEntries(await Promise.all([
  ...modelFiles.map(async (name) => [name, (await stat(join(env.cacheDir, model, revision, name))).size]),
  [wasm, (await stat(new URL(`../node_modules/@huggingface/transformers/dist/${wasm}`, import.meta.url))).size],
]));
await mkdir(output, { recursive: true });
await writeFile(new URL(index, output), rows);
await writeFile(new URL('manifest.json', output), JSON.stringify({
  schema: 1, version: `${revision.slice(0, 12)}-${hash.slice(0, 12)}`, model, revision,
  index, dimension, count: items.length, indexBytes: rows.length, fileSizes,
}, null, 2) + '\n');
console.log(`Saved ${items.length} ARASAAC vectors to ${index}.`);
