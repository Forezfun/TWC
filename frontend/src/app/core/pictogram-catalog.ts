import arasaacBasic from '../../../../shared/pictograms/arasaac-basic.json' with { type: 'json' };
import kolibri from '../../../../shared/pictograms/kolibri.json' with { type: 'json' };

export const PICTOGRAM_CATEGORIES = [
  'Действия', 'Эмоции', 'Места', 'Предметы', 'Люди', 'Еда и напитки', 'Транспорт', 'Здоровье', 'Общение',
  'Животные', 'Природа', 'Учёба', 'Спорт', 'Работа', 'Другое',
] as const;
export type PictogramCategory = typeof PICTOGRAM_CATEGORIES[number];

export interface Pictogram {
  id: string;
  title: string;
  category: PictogramCategory;
  url: string;
  aliases: readonly string[];
}

export interface PictogramSet {
  id: string;
  title: string;
  pictogram_ids: readonly string[];
}

export interface PictogramSelection {
  set_id: string;
  pictogram_ids: readonly string[];
}

export interface PictogramLibrary {
  pictograms: readonly Pictogram[];
  sets: readonly PictogramSet[];
  selection: PictogramSelection;
  /** Сервер не прислал пиктограммы ARASAAC: их подгружают при выборе этого набора. */
  partial?: boolean;
}

export const ARASAAC_SET_ID = 'arasaac-all';
const ARASAAC_PATH = '/kolibri/pictograms/arasaac/';
const ARASAAC_CDN = 'https://static.arasaac.org/pictograms/';

export function isArasaacPictogram(url: string | null | undefined): boolean {
  return !!url && (url.startsWith(ARASAAC_PATH) || url.startsWith(ARASAAC_CDN));
}

export type ArasaacEntry = readonly [number, string, PictogramCategory, readonly string[]];

const kolibriEntries = kolibri as unknown as readonly (readonly [string, string, PictogramCategory, readonly string[]])[];

const arasaacEntries = arasaacBasic as unknown as readonly ArasaacEntry[];

const kolibriPictograms: readonly Pictogram[] = kolibriEntries.map(([id, title, category, aliases]) => ({
  id, title, category, aliases, url: `/kolibri/pictograms/${id}.svg`,
}));

export const ARASAAC_BASIC_IDS = arasaacEntries.map(([id]) => `arasaac-${id}`);

export const DEFAULT_PICTOGRAM_SELECTION: PictogramSelection = {
  set_id: 'kolibri-all',
  pictogram_ids: kolibriPictograms.map(({ id }) => id),
};

export function buildPictogramCatalog(index: readonly ArasaacEntry[]): Pick<PictogramLibrary, 'pictograms' | 'sets'> {
  const byId = new Map(index.map((entry) => [entry[0], entry]));
  const arasaacPictograms: Pictogram[] = arasaacEntries.map(([id, title, category, aliases]) => {
    const official = byId.get(id);
    byId.delete(id);
    const keywords = official ? [official[1], ...official[3]] : [String(id)];
    return {
      id: `arasaac-${id}`, title, category, url: `${ARASAAC_PATH}${id}.png`,
      aliases: [...new Set([...aliases, ...keywords])],
    };
  });
  for (const [id, title, category, aliases] of byId.values()) {
    arasaacPictograms.push({ id: `arasaac-${id}`, title, category, aliases, url: `${ARASAAC_CDN}${id}/${id}_300.png` });
  }

  return {
    pictograms: [...kolibriPictograms, ...arasaacPictograms],
    sets: [
      { id: DEFAULT_PICTOGRAM_SELECTION.set_id, title: 'Колибри · все пиктограммы', pictogram_ids: DEFAULT_PICTOGRAM_SELECTION.pictogram_ids },
      { id: ARASAAC_SET_ID, title: 'ARASAAC · все пиктограммы', pictogram_ids: arasaacPictograms.map(({ id }) => id) },
    ],
  };
}
