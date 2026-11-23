const repeatWords = /^(?:снова|заново|сначала|вновь|еще раз|еще один раз|повторить|повторять|начать (?:заново|сначала|с начала))$/u;
const repeatIcons = [11752, 37162, 37163] as const;

export function pictogramMeaning(input: string): { text: string; preferred: readonly number[] } {
  return repeatWords.test(normalizePictogramQuery(input))
    ? { text: 'начать заново, повторить действие, сделать ещё раз', preferred: repeatIcons }
    : { text: input, preferred: [] };
}

export function normalizePictogramQuery(text: string): string {
  return text.normalize('NFC').toLowerCase().replaceAll('ё', 'е').replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
}

export class PictogramVectorIndex {
  private readonly ids: number[];
  private readonly vectors: Int8Array;
  private readonly inverseNorms: Float32Array;

  constructor(bytes: ArrayBuffer, private readonly dimension: number, count: number) {
    if (bytes.byteLength !== count * (4 + dimension)) throw new Error('Invalid pictogram index size');
    const identifiers = new DataView(bytes, 0, count * 4);
    this.ids = Array.from({ length: count }, (_, row) => identifiers.getUint32(row * 4, true));
    this.vectors = new Int8Array(bytes, count * 4);
    this.inverseNorms = Float32Array.from(this.ids, (_, row) => {
      let norm = 0;
      for (let offset = row * dimension; offset < (row + 1) * dimension; offset++) {
        norm += this.vectors[offset] ** 2;
      }
      return norm ? 1 / Math.sqrt(norm) : 0;
    });
  }

  search(query: Float32Array, allowed: ReadonlySet<number>, preferred: readonly number[] = []): number[] {
    if (query.length !== this.dimension) throw new Error('Invalid query vector');
    const ranked: { id: number; score: number }[] = [];
    for (const [row, id] of this.ids.entries()) {
      if (!allowed.has(id)) continue;
      let dot = 0;
      const start = row * this.dimension;
      for (let column = 0; column < this.dimension; column++) {
        dot += query[column] * this.vectors[start + column];
      }
      const score = dot * this.inverseNorms[row];
      if (score >= 0.76) ranked.push({ id, score });
    }
    ranked.sort((a, b) => b.score - a.score);
    const cutoff = (ranked[0]?.score ?? 0) - 0.055;
    const similar = ranked.filter(({ score }) => score >= cutoff).map(({ id }) => id);
    return [...new Set([...preferred.filter((id) => allowed.has(id)), ...similar])].slice(0, 32);
  }
}
