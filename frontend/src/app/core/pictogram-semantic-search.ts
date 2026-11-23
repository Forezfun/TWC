import { isPlatformBrowser } from '@angular/common';
import { DestroyRef, PLATFORM_ID, Service, afterNextRender, computed, inject, signal } from '@angular/core';
import {
  installedPackageUrl, parseSearchPackage, searchPackageFiles, semanticAssetRoot, semanticCacheName,
  type PictogramSearchPackage,
} from './pictogram-semantic-assets';
import type { SemanticRequest, SemanticResponse } from './pictogram-semantic.worker';

interface DownloadProgress {
  percent: number | null;
  checking: boolean;
}

type PictogramSearchMode = 'exact' | 'contextual';
const modeKey = 'twc-pictogram-search-mode';

@Service()
export class PictogramSemanticSearch {
  readonly installed = signal<PictogramSearchPackage | null>(null);
  readonly latest = signal<PictogramSearchPackage | null>(null);
  readonly progress = signal<DownloadProgress | null>(null);
  readonly message = signal('');
  readonly supported = signal(true);
  readonly checked = signal(false);
  private readonly preferredMode = signal<PictogramSearchMode | null>(null);
  readonly mode = computed<PictogramSearchMode>(() => this.installed() ? this.preferredMode() ?? 'contextual' : 'exact');
  readonly contextualPackage = computed(() => this.mode() === 'contextual' ? this.installed() : null);
  readonly updateAvailable = computed(() => Boolean(this.latest() && this.installed()
    && this.latest()!.version !== this.installed()!.version));

  private worker?: Worker;
  private serial = 0;
  private readonly pending = new Map<number, { resolve: (ids: number[]) => void; reject: (error: Error) => void }>();
  private refreshing = false;

  constructor() {
    const destroy = inject(DestroyRef);
    if (isPlatformBrowser(inject(PLATFORM_ID))) {
      try {
        const mode = window.localStorage.getItem(modeKey);
        if (mode === 'exact' || mode === 'contextual') this.preferredMode.set(mode);
      } catch {
        // The search mode remains available for the current visit.
      }
    }
    afterNextRender(() => {
      this.supported.set(typeof caches !== 'undefined' && typeof Worker !== 'undefined');
      this.refresh();
      const focus = () => this.refresh();
      window.addEventListener('focus', focus);
      destroy.onDestroy(() => {
        window.removeEventListener('focus', focus);
        this.releaseWorker(new Error('Semantic search closed'));
      });
    });
  }

  selectMode(mode: PictogramSearchMode): void {
    if (mode === 'contextual' && !this.installed()) return;
    this.preferredMode.set(mode);
    try {
      window.localStorage.setItem(modeKey, mode);
    } catch {
      // Keep the selection in memory when storage is unavailable.
    }
  }

  refresh(): void {
    if (this.refreshing || this.progress()) return;
    this.refreshing = true;
    void Promise.allSettled([this.readInstalled(), this.readLatest()]).finally(() => {
      this.refreshing = false;
      this.checked.set(true);
    });
  }

  async install(): Promise<void> {
    const value = this.latest();
    if (!value || !this.supported() || this.progress() || this.installed()?.version === value.version) return;
    this.message.set('');
    this.progress.set({ percent: 0, checking: false });
    try {
      const cache = await caches.open(semanticCacheName);
      const urls = await this.cachedUrls(cache);
      const files = searchPackageFiles(value).filter(({ url }) => !urls.has(new URL(url, window.location.origin).href));
      const total = files.every(({ bytes }) => bytes !== undefined)
        ? files.reduce((sum, { bytes }) => sum + (bytes ?? 0), 0) : null;
      let received = 0;
      if (total === null) this.progress.set({ percent: null, checking: false });
      for (const { url, bytes } of files) {
        const response = await fetch(url, { cache: 'no-store' });
        if (!response.ok || !response.body || url.startsWith('/') && response.redirected) {
          throw new Error(`Asset download failed (${response.status})`);
        }
        let fileBytes = 0;
        const stream = response.body.pipeThrough(new TransformStream<Uint8Array, Uint8Array>({
          transform: (chunk, controller) => {
            fileBytes += chunk.byteLength;
            received += chunk.byteLength;
            if (total) {
              const percent = Math.min(99, Math.floor(received * 100 / total));
              if (percent !== this.progress()?.percent) this.progress.set({ percent, checking: false });
            }
            controller.enqueue(chunk);
          },
          flush: () => {
            if (bytes !== undefined && fileBytes !== bytes) throw new Error('Unexpected download size');
          },
        }));
        const headers = new Headers({ 'Content-Type': response.headers.get('Content-Type') ?? 'application/octet-stream' });
        if (bytes !== undefined) headers.set('Content-Length', String(bytes));
        await cache.put(url, new Response(stream, { headers }));
      }
      this.progress.set({ percent: 100, checking: true });
      await this.request({ type: 'prepare', id: ++this.serial, value });
      await cache.put(installedPackageUrl, new Response(JSON.stringify(value), {
        headers: { 'Content-Type': 'application/json' },
      }));
      this.installed.set(value);
    } catch (error) {
      console.warn('Pictogram search setup failed', error);
      this.message.set(error instanceof DOMException && error.name === 'QuotaExceededError'
        ? 'Для модели не хватает места в хранилище браузера.'
        : 'Не удалось установить поиск. Попробуйте ещё раз.');
    } finally {
      this.progress.set(null);
    }
  }

  async search(value: PictogramSearchPackage, query: string, allowed: number[]): Promise<number[]> {
    try {
      return await this.request({ type: 'search', id: ++this.serial, value, query, allowed });
    } catch (error) {
      console.warn('Pictogram semantic search failed', error);
      this.refresh();
      return [];
    }
  }

  private async readLatest(): Promise<void> {
    try {
      const response = await fetch(`${semanticAssetRoot}manifest.json`, { cache: 'no-store' });
      if (!response.ok) throw new Error('Manifest unavailable');
      this.latest.set(parseSearchPackage(await response.json()));
      if (!this.progress()) this.message.set('');
    } catch {
      if (!this.installed() && !this.latest()) this.message.set('Не удалось проверить доступность поиска.');
    }
  }

  private async readInstalled(): Promise<void> {
    if (!this.supported()) return;
    try {
      const cache = await caches.open(semanticCacheName);
      const entry = await cache.match(installedPackageUrl);
      if (!entry) {
        this.installed.set(null);
        return;
      }
      const value = parseSearchPackage(await entry.json());
      const urls = await this.cachedUrls(cache);
      const intact = searchPackageFiles(value).every(({ url }) => urls.has(new URL(url, window.location.origin).href));
      if (!intact || this.installed()?.version !== value.version) this.installed.set(intact ? value : null);
    } catch {
      this.installed.set(null);
      this.supported.set(false);
    }
  }

  private async cachedUrls(cache: Cache): Promise<Set<string>> {
    return new Set((await cache.keys()).map(({ url }) => url));
  }

  private request(data: SemanticRequest): Promise<number[]> {
    if (!this.worker) {
      this.worker = new Worker(new URL('./pictogram-semantic.worker', import.meta.url), { type: 'module' });
      this.worker.addEventListener('message', ({ data: response }: MessageEvent<SemanticResponse>) => {
        const pending = this.pending.get(response.id);
        this.pending.delete(response.id);
        if ('error' in response) pending?.reject(new Error(response.error));
        else pending?.resolve(response.ids);
      });
      this.worker.addEventListener('error', () => this.releaseWorker(new Error('Semantic search worker failed')));
    }
    const worker = this.worker;
    return new Promise((resolve, reject) => {
      worker.postMessage(data);
      this.pending.set(data.id, { resolve, reject });
    });
  }

  private releaseWorker(error: Error): void {
    this.worker?.terminate();
    this.worker = undefined;
    for (const pending of this.pending.values()) pending.reject(error);
    this.pending.clear();
  }
}
