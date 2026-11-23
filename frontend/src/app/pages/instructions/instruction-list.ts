import { NgOptimizedImage } from '@angular/common';
import { Component, computed, effect, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { isRoleKey } from '../../core/site-display';
import { InstructionApi } from '../../core/instruction-api';
import { NavState } from '../../core/nav';
import { Chevron, Picto, pictoFor } from '../../ui/picto';
import { ReadCard } from '../../ui/read-card';
import { Spoken } from '../../ui/spoken';

@Component({
  imports: [RouterLink, NgOptimizedImage, Picto, Chevron, Spoken, ReadCard],
  template: `
    <div class="page page--scroll stack">
      <h1>
        @if (topicId() === null) {
          <twc-spoken text="Выберите тему" recording="/kolibri/system-audio/topics-title.mp3" />
        } @else if (topicTitle(); as title) {
          <twc-spoken [text]="title" systemText />
        } @else {
          <twc-spoken text="Выберите сценарий" recording="/kolibri/system-audio/scenarios-title.mp3" />
        }
      </h1>
      @if (currentList().isLoading()) {
        <p role="status">Загружаем…</p>
      } @else if (currentList().error()) {
        <p role="alert">Не удалось загрузить список.</p>
        <button type="button" class="btn btn--secondary" (click)="currentList().reload()"><twc-spoken text="Повторить" systemButton /></button>
      } @else if (topicId() !== null) {
        <div class="stack">
          @for (item of instructions.value(); track item.id) {
            <div class="sound-card">
              <a class="tile" [routerLink]="['/instructions', item.id]" [queryParams]="backParams()">
                <span class="tile__icon">
                  @if (item.image_url) {
                    <img class="instruction-thumb" [ngSrc]="item.image_url" alt="" fill />
                  } @else { <twc-picto key="doc" /> }
                </span>
                <span class="tile__label">
                  <twc-spoken [text]="item.title" [recording]="item.title_audio_url ?? null" />
                  @if (item.description) {
                    <span class="tile__hint"><twc-spoken [text]="item.description" [recording]="item.description_audio_url ?? null" /></span>
                  }
                </span>
                <twc-chevron />
              </a>
              <twc-card-sound [label]="item.title" />
            </div>
          } @empty { <p><twc-spoken text="В этой теме пока нет сценариев."
            recording="/kolibri/system-audio/scenarios-empty.mp3" /></p> }
        </div>
      } @else {
        <div class="stack">
          @for (topic of topics.value(); track topic.id) {
            <div class="sound-card">
              <a class="tile" [routerLink]="audience() ? ['/', audience(), topic.id] : ['/instructions']"
                [queryParams]="audience() ? {} : { topic: topic.id }">
                <span class="tile__icon"><twc-picto [key]="symbol({ kind: 'menu', title: topic.title })" /></span>
                <span class="tile__label">
                  <twc-spoken [text]="topic.title" systemText />
                  @if (topic.description) { <span class="tile__hint"><twc-spoken [text]="topic.description" /></span> }
                </span>
                <twc-chevron />
              </a>
              <twc-card-sound [label]="topic.title" />
            </div>
          } @empty { <p><twc-spoken text="В этом разделе пока нет тем со сценариями."
            recording="/kolibri/system-audio/topics-empty.mp3" /></p> }
        </div>
      }
    </div>
  `,
})
export class InstructionList {
  private readonly route = inject(ActivatedRoute);
  private readonly api = inject(InstructionApi);
  private readonly routeParams = toSignal(this.route.paramMap, { initialValue: this.route.snapshot.paramMap });
  private readonly query = toSignal(this.route.queryParamMap, { initialValue: this.route.snapshot.queryParamMap });
  protected readonly audience = computed(() => {
    const value = this.routeParams().get('audience') ?? this.query().get('audience');
    return isRoleKey(value) ? value : null;
  });
  protected readonly topicId = computed(() => {
    const id = Number(this.routeParams().get('topicId') ?? this.query().get('topic'));
    return Number.isSafeInteger(id) && id > 0 ? id : null;
  });
  protected readonly topics = this.api.topics(this.audience);
  protected readonly instructions = this.api.published(this.topicId, this.audience);
  protected readonly currentList = computed(() => this.topicId() === null ? this.topics : this.instructions);
  protected readonly topicTitle = computed(() => this.topics.hasValue()
    ? this.topics.value().find((topic) => topic.id === this.topicId())?.title
    : undefined);
  protected readonly backParams = computed(() => ({ audience: this.audience(), topic: this.topicId() }));
  protected readonly symbol = pictoFor;

  constructor() {
    const nav = inject(NavState);
    const router = inject(Router);
    effect((cleanup) => {
      const audience = this.audience();
      const inTopic = this.topicId() !== null;
      const back = () => { void router.navigate(['/', inTopic ? audience ?? 'instructions' : 'sections']); };
      nav.backAction.set(back);
      cleanup(() => { if (nav.backAction() === back) nav.backAction.set(null); });
    });
  }
}
