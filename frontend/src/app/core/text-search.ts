import { scenarioSynonymGroups } from './scenario-synonyms';

type SearchEntry = {
  title: string;
  aliases?: readonly string[];
  description?: string;
  synonyms?: readonly string[];
};

function words(text: string): string[] {
  return text.normalize('NFC').toLowerCase().replaceAll('ё', 'е').match(/[\p{L}\p{N}]+/gu) ?? [];
}

function includesPhrase(text: string, phrase: string): boolean {
  return ` ${text} `.includes(` ${phrase} `);
}

const latinKeys = "`qwertyuiop[]asdfghjkl;'zxcvbnm,.";
const cyrillicKeys = 'ёйцукенгшщзхъфывапролджэячсмитьбю';

function changeLayout(text: string, from: string, to: string): string {
  return Array.from(text.toLowerCase(), (character) => to[from.indexOf(character)] ?? character).join('');
}

// Restricted Damerau–Levenshtein (optimal string alignment). An adjacent swap costs one edit.
export function editDistance(left: string, right: string): number {
  let previous = Array.from({ length: right.length + 1 }, (_, index) => index);
  let twoRowsBack = previous;
  for (let row = 1; row <= left.length; row++) {
    const current = [row];
    for (let column = 1; column <= right.length; column++) {
      current[column] = Math.min(
        previous[column] + 1,
        current[column - 1] + 1,
        previous[column - 1] + Number(left[row - 1] !== right[column - 1]),
      );
      if (row > 1 && column > 1 && left[row - 1] === right[column - 2] && left[row - 2] === right[column - 1]) {
        current[column] = Math.min(current[column], twoRowsBack[column - 2] + 1);
      }
    }
    twoRowsBack = previous;
    previous = current;
  }
  return previous[right.length];
}

function tokenScore(query: string, candidate: string, weight: number, allowTypos: boolean): number {
  if (query === candidate) return weight;
  if (candidate.startsWith(query)) return weight + 1;
  if (query.length >= 2 && candidate.includes(query)) return weight + 6;
  const budget = query.length >= 9 ? 3 : query.length >= 5 ? 2 : query.length >= 3 ? 1 : 0;
  if (!allowTypos || !budget || Math.abs(query.length - candidate.length) > budget) return Infinity;
  const distance = editDistance(query, candidate);
  return distance <= budget ? 20 * distance + weight : Infinity;
}

function synonymScore(query: string, candidate: string, allowTypos: boolean): number {
  if (query === candidate) return 2;
  if (query.length >= 4 && candidate.startsWith(query)) return 3;
  if (allowTypos && query.length >= 5 && Math.abs(query.length - candidate.length) <= 1
    && editDistance(query, candidate) === 1) return 22;
  return Infinity;
}

export function rankTextSearch<T>(items: readonly T[], input: string, getEntry: (item: T) => SearchEntry): T[] {
  return createTextSearch(items, getEntry)(input);
}

export function createTextSearch<T>(
  items: readonly T[], getEntry: (item: T) => SearchEntry, knownWords?: ReadonlySet<string>,
): (input: string) => T[] {
  let index: ReturnType<typeof buildSearchIndex<T>> | undefined;
  return (input) => {
    const tokens = words(input);
    if (!tokens.length) return [...items];
    index ??= buildSearchIndex(items, getEntry);
    return rankIndexedSearch(index, input, tokens, knownWords);
  };
}

function buildSearchIndex<T>(items: readonly T[], getEntry: (item: T) => SearchEntry) {
  return items.map((item) => {
    const { title, aliases, description, synonyms } = getEntry(item);
    const titleWords = words(title);
    const terms = new Map<string, number>();
    for (const [tokens, weight] of [
      [words(description ?? ''), 4], [words(aliases?.join(' ') ?? ''), 2], [titleWords, 0],
    ] as const) {
      for (const token of tokens) terms.set(token, weight);
    }
    return {
      item, terms, title: titleWords.join(' '),
      synonymWords: synonyms?.filter((synonym) => !synonym.includes(' ')),
      synonymPhrases: synonyms?.filter((synonym) => synonym.includes(' ')),
    };
  });
}

function rankIndexedSearch<T>(
  entries: ReturnType<typeof buildSearchIndex<T>>, input: string, tokens: string[], knownWords?: ReadonlySet<string>,
): T[] {
  const queries = [tokens, words(changeLayout(input, latinKeys, cyrillicKeys)), words(changeLayout(input, cyrillicKeys, latinKeys))]
    .filter((query) => query.length)
    .map((query) => ({ phrase: query.join(' '), uniqueTerms: new Set(query) }));
  const ranked = (allowTypos: boolean) => entries
    .map(({ item, terms, title, synonymWords, synonymPhrases }) => {
      const scores = queries.map((query, index) => {
        if (title === query.phrase) return -1 + index;
        const phraseWords = synonymPhrases?.flatMap((phrase) =>
          includesPhrase(query.phrase, phrase) ? phrase.split(' ') : []);
        let score = index;
        for (const token of query.uniqueTerms) {
          let best = phraseWords?.includes(token) ? 2 : Infinity;
          const allowTokenTypos = allowTypos && !knownWords?.has(token);
          for (const [candidate, weight] of terms) {
            best = Math.min(best, tokenScore(token, candidate, weight, allowTokenTypos));
          }
          for (const candidate of synonymWords ?? []) {
            best = Math.min(best, synonymScore(token, candidate, allowTokenTypos));
          }
          score += best;
        }
        return score;
      });
      return { item, score: Math.min(...scores) };
    })
    .filter(({ score }) => Number.isFinite(score))
    .sort((a, b) => a.score - b.score);

  const direct = ranked(false);
  if (direct.length) return direct.map(({ item }) => item);
  const approximate = ranked(true);
  const limit = (approximate[0]?.score ?? 0) + 20;
  return approximate.filter(({ score }) => score < limit).map(({ item }) => item);
}

const scenarioSynonyms = scenarioSynonymGroups.map((group) => {
  const variants = group.map((variant) => words(variant).join(' '));
  const phrases = variants.filter((variant) => variant.includes(' '));
  // В группах с фразами отдельное слово раскрывает группу только при полном совпадении с названием.
  return { variants, triggers: phrases.length ? phrases : variants };
});
const knownScenarioWords = new Set(scenarioSynonyms.flatMap(({ variants }) =>
  variants.flatMap((variant) => variant.split(' '))));

export function searchScenarios<T extends { title: string; description: string }>(items: readonly T[], query: string): T[] {
  return createTextSearch(items, ({ title, description }) => {
    const normalizedTitle = words(title).join(' ');
    const synonyms = scenarioSynonyms.flatMap(({ variants, triggers }) =>
      variants.includes(normalizedTitle) || triggers.some((phrase) => includesPhrase(normalizedTitle, phrase))
        ? variants : []);
    return { title, description, synonyms: [...new Set(synonyms)] };
  }, knownScenarioWords)(query);
}
