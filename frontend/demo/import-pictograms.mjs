import { createHash, randomUUID } from 'node:crypto';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { PICTOGRAM_CATEGORIES } from '../src/app/core/pictogram-catalog.ts';
import {
  PICTOGRAM_IMAGE_BYTES, PICTOGRAM_IMAGE_TYPES, PICTOGRAM_SET_LIMIT,
} from '../src/app/core/pictogram-import.ts';

export const pictogramTitleKey = (title) => title.normalize('NFKC').toLowerCase();
const pngSignature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
const jpegSignature = Buffer.from([255, 216, 255]);

export function parsePictogramBundle(body) {
  const text = (value, length) => typeof value === 'string' && !!value.trim()
    && [...value.trim()].length <= length;
  const keys = (value, allowed) => value && typeof value === 'object' && !Array.isArray(value)
    && Object.keys(value).every((key) => allowed.includes(key));
  if (!keys(body, ['version', 'title', 'pictograms']) || body.version !== 1
    || !text(body.title, 120) || !Array.isArray(body.pictograms)
    || !body.pictograms.length || body.pictograms.length > PICTOGRAM_SET_LIMIT) {
    throw new Error('Укажите название набора и добавьте от 1 до 250 пиктограмм.');
  }
  const pictograms = body.pictograms.map((item, index) => {
    const category = item?.category === undefined ? 'Другое' : item.category;
    const aliases = item?.aliases === undefined ? [] : item.aliases;
    if (!keys(item, ['title', 'category', 'aliases', 'image']) || !text(item.title, 120)
      || !PICTOGRAM_CATEGORIES.includes(category) || !Array.isArray(aliases)
      || aliases.length > 20 || !aliases.every((alias) => text(alias, 80))) {
      throw new Error(`Проверьте название, категорию и ключевые слова пиктограммы №${index + 1}.`);
    }
    const { image } = item;
    const mime = image?.mime_type;
    if (!keys(image, ['mime_type', 'base64']) || !PICTOGRAM_IMAGE_TYPES.includes(mime)
      || typeof image.base64 !== 'string' || !image.base64
      || image.base64.length > 4 * Math.ceil(PICTOGRAM_IMAGE_BYTES / 3)) {
      throw new Error(`Проверьте формат и размер изображения №${index + 1}.`);
    }
    const bytes = Buffer.from(image.base64, 'base64');
    const matches = {
      'image/png': bytes.subarray(0, 8).equals(pngSignature),
      'image/jpeg': bytes.subarray(0, 3).equals(jpegSignature),
      'image/webp': bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP',
    };
    if (bytes.toString('base64') !== image.base64 || bytes.length > PICTOGRAM_IMAGE_BYTES || !matches[mime]) {
      throw new Error(`Проверьте формат и размер изображения №${index + 1}.`);
    }
    return {
      title: item.title.trim(), category, aliases: aliases.map((alias) => alias.trim()),
      mime, bytes,
    };
  });
  const hash = createHash('sha256').update(JSON.stringify(body.title.trim()));
  for (const { bytes, ...metadata } of pictograms) {
    hash.update(JSON.stringify(metadata)).update(bytes.toString('base64'));
  }
  return { title: body.title.trim(), pictograms, fingerprint: hash.digest('hex') };
}

export function saveImportedPictograms(bundle, directory, save) {
  const ids = bundle.pictograms.map(() => randomUUID().replaceAll('-', ''));
  const pictograms = bundle.pictograms.map(({ title, category, aliases }, index) => ({
    id: ids[index], title, category, aliases, url: '/api/pictogram-images/' + ids[index],
  }));
  const set = { id: 'import-' + randomUUID().replaceAll('-', ''), title: bundle.title, pictogram_ids: ids };
  const mediaTypes = Object.fromEntries(bundle.pictograms.map(({ mime }, index) => [ids[index], mime]));
  const written = [];
  try {
    mkdirSync(directory, { recursive: true });
    for (const [index, { bytes }] of bundle.pictograms.entries()) {
      const file = join(directory, ids[index]);
      writeFileSync(file, bytes, { flag: 'wx', mode: 0o600 });
      written.push(file);
    }
    save({ set, pictograms, mediaTypes, fingerprint: bundle.fingerprint });
  } catch (error) {
    for (const file of written) rmSync(file, { force: true });
    throw error;
  }
  return { set, pictograms };
}
