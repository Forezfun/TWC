import { Signal, computed, effect, inject, signal } from '@angular/core';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { debounceTime, distinctUntilChanged, map } from 'rxjs';
import { Pictogram } from '../../core/pictogram-catalog';
import { PictogramSemanticSearch } from '../../core/pictogram-semantic-search';
import { normalizePictogramQuery, pictogramMeaning } from '../../core/pictogram-vector-index';
import { createTextSearch } from '../../core/text-search';

export function pictogramSearch(candidates: () => readonly Pictogram[], query: Signal<string>): Signal<Pictogram[]> {
  const semantic = inject(PictogramSemanticSearch);
  const settledQuery = toSignal(toObservable(query).pipe(
    map((value) => value.trim()),
    distinctUntilChanged(),
    debounceTime(200),
  ), { initialValue: '' });
  const search = computed(() => createTextSearch(candidates(), (symbol) => symbol));
  const eligible = computed(() => new Map(candidates().flatMap((symbol) => {
    const match = /^arasaac-(\d+)$/u.exec(symbol.id);
    return match ? [[Number(match[1]), symbol] as const] : [];
  })));
  const matches = signal<{ ids: number[]; query: string; version: string; catalog: ReadonlyMap<number, Pictogram> } | null>(null);
  effect((cleanup) => {
    const value = semantic.contextualPackage();
    const text = settledQuery();
    if (!value || text.length < 3 || !/[\p{L}\p{N}]/u.test(text)) return;
    const catalog = eligible();
    if (!catalog.size) return;
    let current = true;
    cleanup(() => { current = false; });
    void semantic.search(value, text, [...catalog.keys()]).then((ids) => {
      if (current) matches.set({ ids, query: text, version: value.version, catalog });
    });
  });
  return computed(() => {
    const text = settledQuery();
    const lexical = search()(text);
    const result = matches();
    if (!result?.ids.length || result.query !== text || result.version !== semantic.contextualPackage()?.version
      || result.catalog !== eligible()) return lexical;
    const additional = result.ids.flatMap((id) => {
      const symbol = result.catalog.get(id);
      return symbol ? [symbol] : [];
    });
    const normalized = normalizePictogramQuery(text);
    const exact = pictogramMeaning(text).preferred.length ? [] : lexical.filter(({ title, aliases }) =>
      normalizePictogramQuery(title) === normalized || aliases.some((term) => normalizePictogramQuery(term) === normalized));
    return [...new Set([...exact, ...additional, ...lexical])];
  });
}
