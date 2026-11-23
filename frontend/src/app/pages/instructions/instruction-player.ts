import { NgOptimizedImage, isPlatformBrowser } from '@angular/common';
import { Component, PLATFORM_ID, computed, effect, inject, signal, untracked } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { InstructionApi } from '../../core/instruction-api';
import { SiteDisplayApi, isRoleKey, supportButtons } from '../../core/site-display';
import { INSTRUCTION_PREVIEW_KEY, InstructionInput, instructionProgress, linearInstruction, stepAudioBodyStart, stepTitleAudio } from '../../core/instructions';
import { NavState } from '../../core/nav';
import { isArasaacPictogram } from '../../core/pictogram-catalog';
import { Prefs } from '../../core/prefs';
import { ActionDockTemplate } from '../../ui/action-dock';
import { Spoken } from '../../ui/spoken';

@Component({
  imports: [RouterLink, NgOptimizedImage, ActionDockTemplate, Spoken],
  template: `
    <div class="page stack instruction-page" [class.page--scroll]="!hasMoreText() && choicesInContent()">
      @if (instruction.isLoading()) {
        <p role="status">Загружаем инструкцию…</p>
      } @else if (!value() || !step()) {
        <h1><twc-spoken text="Инструкция недоступна" recording="/kolibri/system-audio/scenario-unavailable.mp3" /></h1>
        @if (preview) {
          <p>Откройте предпросмотр сценария с первым шагом в редакторе.</p>
        } @else {
          <a class="btn btn--primary" routerLink="/instructions" [queryParams]="topicParams()"><twc-spoken text="К выбору инструкций" systemButton /></a>
        }
      } @else {
        <h1>
          @if (done()) {
            <twc-spoken text="Инструкция завершена" recording="/kolibri/system-audio/scenario-complete.mp3" />
          } @else {
            {{ value()!.title || 'Сценарий без названия' }}
          }
        </h1>
        <p class="step-count" aria-hidden="true">{{ displayedPercentage() }}%</p>
        <div class="instruction-progress" role="progressbar" aria-label="Прогресс сценария"
          [attr.aria-valuenow]="progress()"><span [style.width.%]="animatedProgress()"></span></div>
        @if (done()) {
          <div class="card stack">
            <p><twc-spoken [text]="preview ? 'Можно повторить шаги или закрыть предпросмотр.' : 'Можно выбрать другую инструкцию или повторить шаги.'"
              [recording]="preview ? null : '/kolibri/system-audio/scenario-complete-description.mp3'" systemText /></p>
            <button type="button" class="btn btn--secondary" (click)="restart()"><twc-spoken text="Повторить шаги" systemButton /></button>
          </div>
        } @else if (step(); as current) {
          @if (current.image_url; as image) {
            <div class="image-slot" [class.step-pictogram]="isPictogram(image)"><img [ngSrc]="image" fill class="instruction-photo" alt="" /></div>
          }
          <div class="card stack">
            <h2><twc-spoken [text]="current.title"
              [recording]="titleAudio()?.url ?? null" [recordingRange]="titleAudio()?.range ?? null" /></h2>
            @if (textParts()[partIndex()]; as text) {
              <p class="body-text"><twc-spoken [text]="text" [recording]="current.audio_url" [recordingRange]="recordingRange()" /></p>
            }
          </div>
          @if (!hasMoreText() && choicesInContent()) {
            <section class="stack" aria-label="Варианты">
              @for (choice of current.choices; track choice.id) {
                <button type="button" class="btn btn--secondary btn--block" (click)="advance(choice.next_id)">
                  @if (choice.image_url; as image) { <img class="choice-pictogram" [src]="image" alt="" width="24" height="24" /> }
                  <twc-spoken [text]="choice.label" [recording]="choice.audio_url ?? null" />
                </button>
              }
            </section>
          }
        }
      }
    </div>
    <ng-template twcActions="support">
      @if (support().length) {
        <div class="scenario-support" role="group" aria-label="Поддержать Колибри">
          @for (button of support(); track $index) {
            @if (button.url) {
              <a class="btn btn--ghost" [href]="button.url"><twc-spoken [text]="button.label" [systemButton]="button.label === 'Пожертвовать'" /></a>
            } @else {
              <button type="button" class="btn btn--ghost" disabled>{{ button.label }}</button>
            }
          }
        </div>
      }
    </ng-template>
    <ng-template twcActions>
      @if (done() && value()) {
        @if (preview) {
          <button type="button" class="btn btn--primary btn--block prominent" (click)="closePreview()"><twc-spoken text="Закрыть предпросмотр" systemButton /></button>
        } @else {
          <a class="btn btn--primary btn--block prominent" routerLink="/instructions" [queryParams]="topicParams()"><twc-spoken text="К выбору инструкций" systemButton /></a>
        }
      } @else if (step(); as current) {
        @if (hasMoreText()) {
          <button type="button" class="btn btn--primary btn--block" (click)="openPart(partIndex() + 1)">
            <twc-spoken text="Читать дальше" systemButton />
          </button>
        } @else if (current.choices.length && !choicesInContent()) {
          @for (choice of current.choices; track choice.id) {
            <button type="button" class="btn btn--secondary btn--block" (click)="advance(choice.next_id)">
              @if (choice.image_url; as image) { <img class="choice-pictogram" [src]="image" alt="" width="24" height="24" /> }
              <twc-spoken [text]="choice.label" [recording]="choice.audio_url ?? null" />
            </button>
          }
        } @else if (!current.choices.length) {
          <button type="button" class="btn btn--primary btn--block prominent" (click)="advance(current.next_id)">
            <twc-spoken [text]="current.next_id ? 'Следующий шаг' : 'Завершить инструкцию'" systemButton />
          </button>
        }
      }
    </ng-template>
  `,
})
export class InstructionPlayer {
  protected readonly isPictogram = (url: string) => url.startsWith('/kolibri/pictograms/')
    || url.startsWith('/api/pictogram-images/') || isArasaacPictogram(url);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly nav = inject(NavState);
  private readonly prefs = inject(Prefs);
  private readonly siteDisplay = inject(SiteDisplayApi);
  protected readonly preview = this.route.snapshot.data['preview'] === true;
  private readonly previewDraft = this.preview ? readPreview() : null;
  private readonly routeParams = toSignal(this.route.paramMap, { initialValue: this.route.snapshot.paramMap });
  private readonly query = toSignal(this.route.queryParamMap, { initialValue: this.route.snapshot.queryParamMap });
  private readonly id = computed(() => {
    const value = Number(this.routeParams().get('id'));
    return Number.isSafeInteger(value) && value > 0 ? value : null;
  });
  protected readonly instruction = inject(InstructionApi).get(this.id);
  protected readonly value = computed(() => this.previewDraft ?? (this.instruction.hasValue() ? this.instruction.value() : null));
  protected readonly support = computed(() => {
    const role = this.value()?.audience;
    return role && this.step() ? supportButtons(this.siteDisplay.display(), role) : [];
  });
  protected readonly done = computed(() => this.query().get('done') === '1');
  protected readonly listParams = computed(() => {
    const audience = this.query().get('audience');
    const topic = Number(this.query().get('topic')) || this.value()?.topic_id || null;
    return { audience: isRoleKey(audience) ? audience : null, topic };
  });
  protected readonly topicParams = computed(() => ({ audience: this.listParams().audience ?? this.value()?.audience ?? null }));
  private readonly byId = computed(() => new Map(this.value()?.steps.map((step) => [step.id, step])));
  protected readonly step = computed(() => this.byId().get(this.query().get('step') ?? '')
    ?? this.byId().get(this.value()?.start_step_id ?? ''));
  protected readonly textParts = computed(() => {
    const size = this.prefs.textSize();
    return splitText(this.step()?.body ?? '', size === 'xl' ? 86 : size === 'lg' ? 120 : 168);
  });
  protected readonly partIndex = computed(() => {
    const value = Number(this.query().get('part')) - 1;
    return Number.isSafeInteger(value) && value > 0 ? Math.min(value, Math.max(0, this.textParts().length - 1)) : 0;
  });
  protected readonly hasMoreText = computed(() => this.partIndex() + 1 < this.textParts().length);
  protected readonly titleAudio = computed(() => stepTitleAudio(this.step()));
  protected readonly recordingRange = computed(() => {
    const parts = this.textParts();
    const offset = stepAudioBodyStart(this.step());
    if (!this.step()?.audio_url || !parts.length || (parts.length < 2 && !offset)) return null;
    const index = this.partIndex();
    const total = parts.reduce((sum, text) => sum + text.length, 0);
    const start = parts.slice(0, index).reduce((sum, text) => sum + text.length, 0);
    const duration = 1 - offset;
    return {
      from: offset + duration * start / total,
      to: offset + duration * (start + parts[index].length) / total,
    };
  });
  protected readonly choicesInContent = computed(() => {
    const choices = this.step()?.choices ?? [];
    const limit = choices.length === 1 ? 65 : this.prefs.textSize() === 'xl' ? 18 : 36;
    return choices.length > 2 || choices.some((choice) => choice.label.length > limit);
  });
  private readonly sequence = computed(() => {
    const instruction = this.value();
    return instruction ? linearInstruction(instruction) : null;
  });
  private readonly trail = computed(() => {
    const trail = (this.query().get('trail') ?? '').split(',').filter((id) => this.byId().has(id)).slice(-100);
    if (trail.length) return trail;
    const sequence = this.sequence();
    const offset = sequence?.indexOf(this.step()?.id ?? '') ?? -1;
    return sequence && offset > 0 ? sequence.slice(0, offset) : [];
  });
  protected readonly progress = computed(() => {
    if (this.done()) return 100;
    return instructionProgress(this.value()?.steps ?? [], this.trail(), this.step()?.id ?? '');
  });
  private readonly progressFrame = signal<number | null>(null);
  protected readonly animatedProgress = computed(() => this.progressFrame() ?? this.progress());
  protected readonly displayedPercentage = computed(() => Math.round(this.animatedProgress()));

  constructor() {
    effect((cleanup) => {
      const back = () => this.previous();
      this.nav.backAction.set(back);
      cleanup(() => { if (this.nav.backAction() === back) this.nav.backAction.set(null); });
    });

    if (isPlatformBrowser(inject(PLATFORM_ID))) {
      const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)');
      effect((cleanup) => {
        const target = this.progress();
        if (!this.step()) {
          this.progressFrame.set(null);
          return;
        }

        const from = untracked(this.progressFrame);
        if (from === null || from === target || reducedMotion?.matches) {
          this.progressFrame.set(target);
          return;
        }

        const start = window.performance.now();
        const duration = 420;
        const draw = (now: number) => {
          const time = Math.min(1, (now - start) / duration);
          if (time === 1 || reducedMotion?.matches) {
            this.progressFrame.set(target);
            return;
          }
          const eased = time * time * (3 - 2 * time);
          this.progressFrame.set(from + (target - from) * eased);
          frame = window.requestAnimationFrame(draw);
        };
        let frame = window.requestAnimationFrame(draw);
        cleanup(() => window.cancelAnimationFrame(frame));
      });
    }
  }

  protected advance(next: string | null): void {
    const current = this.step();
    if (!current) return;
    if (next === null) this.move(current.id, this.trail(), true, this.partIndex());
    else if (this.byId().has(next)) this.move(next, [...this.trail(), current.id].slice(-100));
  }

  protected restart(): void {
    const initial = this.value()?.start_step_id;
    if (initial) this.move(initial, []);
  }

  protected closePreview(): void {
    window.close();
  }

  protected openPart(index: number): void {
    const step = this.step();
    if (step) this.move(step.id, this.trail(), false, index);
  }

  private previous(): void {
    const step = this.step();
    const trail = this.trail();
    if (this.done() && step) {
      this.move(step.id, trail, false, this.partIndex());
    } else if (this.partIndex() > 0) {
      this.openPart(this.partIndex() - 1);
    } else if (trail.length) {
      this.move(trail[trail.length - 1], trail.slice(0, -1));
    } else if (this.preview) {
      this.closePreview();
    } else {
      void this.router.navigate(['/instructions'], { queryParams: this.listParams() });
    }
  }

  private move(step: string, trail: string[], done = false, part = 0): void {
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { step, trail: trail.length ? trail.join(',') : null, done: done ? '1' : null, part: part ? part + 1 : null },
      queryParamsHandling: 'merge',
    });
  }
}

function readPreview(): InstructionInput | null {
  try {
    return JSON.parse(sessionStorage.getItem(INSTRUCTION_PREVIEW_KEY) ?? 'null') as InstructionInput | null;
  } catch {
    return null;
  }
}

function splitText(text: string, limit: number): string[] {
  const chars = Array.from(text.trim());
  const parts: string[] = [];
  while (chars.length > limit) {
    let cut = limit;
    while (cut > limit / 2 && !/\s/.test(chars[cut])) cut--;
    if (cut <= limit / 2) cut = limit;
    const part = chars.splice(0, cut).join('').trim();
    if (part) parts.push(part);
  }
  const tail = chars.join('').trim();
  if (tail) parts.push(tail);
  return parts;
}
