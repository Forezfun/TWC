import { readFileSync, writeFileSync } from 'node:fs';

const categories = [
  ['Эмоции', ['emotion', 'feeling']],
  ['Транспорт', ['mode of transport', 'traffic', 'land transport', 'road safety']],
  ['Животные', ['animal']],
  ['Еда и напитки', ['feeding', 'food', 'beverage']],
  ['Здоровье', ['health', 'medicine', 'human body', 'hygiene']],
  ['Спорт', ['sport', 'physical exercise']],
  ['Учёба', ['education', 'alphabet', 'mathematics']],
  ['Природа', ['nature', 'landscape', 'weather', 'plant']],
  ['Места', ['place', 'building', 'geography']],
  ['Люди', ['person', 'professional', 'character']],
  ['Предметы', ['object', 'tool', 'clothes', 'appliance']],
  ['Работа', ['work']],
  ['Действия', ['verb', 'routine', 'movement']],
  ['Общение', ['communication', 'language', 'signaling system']],
];

function readRows(path) {
  const rows = JSON.parse(readFileSync(path, 'utf8'));
  if (!Array.isArray(rows) || rows.length === 0 || rows.some((row) => !Number.isSafeInteger(row?._id))) {
    throw new Error('Некорректный каталог ARASAAC: ' + path);
  }
  return new Map(rows.map((row) => [row._id, row]));
}

function words(row) {
  return [...new Set((row?.keywords ?? []).filter(Boolean)
    .flatMap(({ keyword, plural }) => [keyword, plural])
    .filter((value) => typeof value === 'string' && value.trim())
    .map((value) => value.trim()))];
}

const [ruPath, esPath] = process.argv.slice(2);
if (!ruPath || !esPath) throw new Error('Передайте файлы каталога ARASAAC: ru.json es.json.');
const ru = readRows(ruPath);
const es = readRows(esPath);
const ids = [...new Set([...ru.keys(), ...es.keys()])].sort((a, b) => a - b);
const entries = ids.map((id) => {
  const russian = ru.get(id);
  const spanish = es.get(id);
  const russianWords = words(russian);
  const [title = `ARASAAC №${id}`, ...aliases] = russianWords.length ? russianWords : words(spanish);
  const tags = new Set([...(spanish?.categories ?? []), ...(spanish?.tags ?? []),
    ...(russian?.categories ?? []), ...(russian?.tags ?? [])]);
  const category = categories.find(([, match]) => match.some((tag) => tags.has(tag)))?.[0] ?? 'Другое';
  return [id, title, category, [...aliases, String(id)]];
});
const output = '[\n' + entries.map((entry) => JSON.stringify(entry)).join(',\n') + '\n]\n';
writeFileSync(new URL('../../shared/pictograms/arasaac-index.json', import.meta.url), output);
console.log(`Пиктограммы ARASAAC: ${entries.length}. С русскими названиями: ${ids.filter((id) => words(ru.get(id)).length).length}.`);
