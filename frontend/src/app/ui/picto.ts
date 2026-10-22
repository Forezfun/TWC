import { Component, computed, input } from '@angular/core';
import { NodeKind, ScenarioNode } from '../core/api';

export type PictoKey =
  | 'self'
  | 'parents'
  | 'specialists'
  | 'book'
  | 'chat'
  | 'medical'
  | 'hands'
  | 'heart'
  | 'puzzle'
  | 'sliders'
  | 'home'
  | 'shield'
  | 'help'
  | 'calendar'
  | 'people'
  | 'gift'
  | 'link'
  | 'doc';

/** Подбираем пиктограмму по типу узла и ключевым словам в подписи. */
export function pictoFor(n: Pick<ScenarioNode, 'kind' | 'title'>): PictoKey {
  const byKind: Partial<Record<NodeKind, PictoKey>> = {
    consult: 'calendar',
    volunteer: 'people',
    donate: 'gift',
    link: 'link',
  };
  if (byKind[n.kind]) return byKind[n.kind]!;
  const t = n.title.toLowerCase();
  if (/обучен|образован|школ|учеб/.test(t)) return 'book';
  if (/поведен|общен|разговор|коммуник/.test(t)) return 'chat';
  if (/медицин|врач|специалист|диагно/.test(t)) return 'medical';
  if (/льгот|социал|поддержк/.test(t)) return 'hands';
  if (/усталост|тревог|эмоц|состоян/.test(t)) return 'heart';
  if (/методик|подход/.test(t)) return 'puzzle';
  if (/адаптац|материал|занят/.test(t)) return 'sliders';
  if (/безопасн/.test(t)) return 'shield';
  if (/повседнев|самостоятел|навык|быт|дом/.test(t)) return 'home';
  if (/помощ|помоч/.test(t)) return 'help';
  return n.kind === 'answer' ? 'doc' : 'chat';
}

/**
 * Плоские пиктограммы без лиц и без взгляда в камеру (правила 5, 6).
 * Один объект на картинку, подпись всегда рядом (правило 7).
 */
@Component({
  selector: 'twc-picto',
  template: `
    <svg
      viewBox="0 0 48 48"
      fill="none"
      stroke="currentColor"
      stroke-width="2.4"
      stroke-linecap="round"
      stroke-linejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      @switch (key()) {
        @case ('self') {
          <circle cx="24" cy="13" r="7" fill="currentColor" fill-opacity=".18" />
          <path d="M10 42v-6a10 10 0 0 1 10-10h8a10 10 0 0 1 10 10v6" />
        }
        @case ('parents') {
          <circle cx="16" cy="13" r="6" fill="currentColor" fill-opacity=".18" />
          <circle cx="33" cy="18" r="5" fill="currentColor" fill-opacity=".18" />
          <path
            d="M4 42v-5a9 9 0 0 1 9-9h6a9 9 0 0 1 9 9v5M27 42v-5a7 7 0 0 1 7-7h2a7 7 0 0 1 7 7v5"
          />
        }
        @case ('specialists') {
          <circle cx="24" cy="12" r="6" fill="currentColor" fill-opacity=".18" />
          <path d="M10 42v-6a10 10 0 0 1 10-10h8a10 10 0 0 1 10 10v6" />
          <rect x="19" y="29" width="10" height="8" rx="2" fill="currentColor" fill-opacity=".35" />
        }
        @case ('book') {
          <path
            d="M8 10h12a4 4 0 0 1 4 4v26a4 4 0 0 0-4-4H8z"
            fill="currentColor"
            fill-opacity=".18"
          />
          <path d="M40 10H28a4 4 0 0 0-4 4v26a4 4 0 0 1 4-4h12z" />
        }
        @case ('chat') {
          <path
            d="M8 10h22a4 4 0 0 1 4 4v10a4 4 0 0 1-4 4H18l-8 6V28H8a4 4 0 0 1-4-4V14a4 4 0 0 1 4-4z"
            fill="currentColor"
            fill-opacity=".18"
          />
          <path d="M38 20h2a4 4 0 0 1 4 4v10a4 4 0 0 1-4 4h-2v6l-8-6H24" />
        }
        @case ('medical') {
          <rect x="6" y="12" width="36" height="28" rx="5" fill="currentColor" fill-opacity=".14" />
          <path d="M18 12V8h12v4M24 20v12M18 26h12" />
        }
        @case ('hands') {
          <path
            d="M6 24l8-8 10 4 8-2 10 4v6l-10 8-12-2-6-2z"
            fill="currentColor"
            fill-opacity=".18"
          />
          <path d="M14 16v-4M6 24v8" />
        }
        @case ('heart') {
          <path
            d="M24 41S6 30 6 18a9 9 0 0 1 18-2 9 9 0 0 1 18 2c0 12-18 23-18 23z"
            fill="currentColor"
            fill-opacity=".18"
          />
        }
        @case ('puzzle') {
          <path
            d="M10 14h10a4 4 0 1 1 8 0h10v10a4 4 0 1 1 0 8v10H28a4 4 0 1 1-8 0H10V32a4 4 0 1 1 0-8z"
            fill="currentColor"
            fill-opacity=".18"
          />
        }
        @case ('sliders') {
          <path d="M8 14h32M8 24h32M8 34h32" />
          <circle cx="18" cy="14" r="4" fill="currentColor" />
          <circle cx="32" cy="24" r="4" fill="currentColor" />
          <circle cx="14" cy="34" r="4" fill="currentColor" />
        }
        @case ('home') {
          <path d="M8 22L24 8l16 14v18H8z" fill="currentColor" fill-opacity=".18" />
          <path d="M20 40V28h8v12" />
        }
        @case ('shield') {
          <path
            d="M24 6l14 5v12c0 9-6 15-14 19-8-4-14-10-14-19V11z"
            fill="currentColor"
            fill-opacity=".18"
          />
          <path d="M17 24l5 5 9-10" />
        }
        @case ('help') {
          <circle cx="24" cy="24" r="18" fill="currentColor" fill-opacity=".14" />
          <path d="M24 14v12M24 32v2" />
          <path d="M14 38l10-8 10 8" />
        }
        @case ('calendar') {
          <rect x="6" y="10" width="36" height="32" rx="5" fill="currentColor" fill-opacity=".14" />
          <path d="M6 20h36M16 6v8M32 6v8" />
          <rect x="14" y="26" width="8" height="8" rx="2" fill="currentColor" />
        }
        @case ('people') {
          <circle cx="16" cy="14" r="5" fill="currentColor" fill-opacity=".18" />
          <circle cx="32" cy="14" r="5" fill="currentColor" fill-opacity=".18" />
          <path
            d="M4 38v-4a8 8 0 0 1 8-8h8a8 8 0 0 1 8 8v4M24 38v-4a8 8 0 0 1 8-8h4a8 8 0 0 1 8 8v4"
          />
        }
        @case ('gift') {
          <rect x="6" y="18" width="36" height="24" rx="4" fill="currentColor" fill-opacity=".14" />
          <path
            d="M6 26h36M24 18v24M24 18c-4-10-14-8-10-2s10 2 10 2zm0 0c4-10 14-8 10-2s-10 2-10 2z"
          />
        }
        @case ('link') {
          <path
            d="M20 28l8-8M17 31l-4 4a6 6 0 0 1-8-8l6-6a6 6 0 0 1 8 0M31 17l4-4a6 6 0 0 1 8 8l-6 6a6 6 0 0 1-8 0"
          />
        }
        @default {
          <rect x="10" y="6" width="28" height="36" rx="4" fill="currentColor" fill-opacity=".14" />
          <path d="M17 16h14M17 24h14M17 32h8" />
        }
      }
    </svg>
  `,
  host: { style: 'display:contents' },
})
export class Picto {
  readonly key = input.required<PictoKey>();
}

@Component({
  selector: 'twc-chevron',
  template: `<svg
    class="tile__chevron"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="2.5"
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden="true"
  >
    <path d="M9 6l6 6-6 6" />
  </svg>`,
  host: { style: 'display:contents' },
})
export class Chevron {
  readonly _ = computed(() => 0);
}
