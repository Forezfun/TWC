import { NgTemplateOutlet } from '@angular/common';
import { Component, DestroyRef, computed, inject, linkedSignal, signal, viewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { SiteDisplayApi } from '../../core/site-display';
import { errorText } from '../../core/admin-api';
import { INSTRUCTION_MEDIA_MAX_BYTES, InstructionApi } from '../../core/instruction-api';
import { INSTRUCTION_PREVIEW_KEY, Instruction, InstructionInput, InstructionStep, StepChoice, checkInstruction, stepAudioBodyStart, stepTitleAudio } from '../../core/instructions';
import { localId } from '../../core/local-id';
import { PictogramApi } from '../../core/pictogram-api';
import { PICTOGRAM_CATEGORIES, PictogramCategory, isArasaacPictogram } from '../../core/pictogram-catalog';
import { Speech } from '../../core/speech';
import { searchScenarios } from '../../core/text-search';
import { ArasaacCredit } from '../../ui/arasaac-credit';
import { PictogramThumbnail } from '../../ui/pictogram-thumbnail';
import { layoutGraph } from './instruction-graph';
import { PictogramPages } from './pictogram-pages';
import { pictogramSearch } from './pictogram-search';
import { MicrophoneDialog } from './microphone-dialog';
import { AudioPreview } from './audio-preview';

type ScenarioMediaSlot = { scope: 'scenario'; field: 'title_audio_url' | 'description_audio_url' };
type StepMediaSlot = { scope: 'step'; field: 'image_url' | 'audio_url' | 'title_audio_url'; choiceId?: string | null };
type MediaSlot = ScenarioMediaSlot | StepMediaSlot;
type MediaTarget = ScenarioMediaSlot | (StepMediaSlot & { stepId: string });
type SymbolCategory = 'Все' | PictogramCategory;
type DraftSnapshot = { item: InstructionInput; stepId: string | null };
type HistoryDirection = 'undo' | 'redo';

function newStep(): InstructionStep {
  return { id: localId(), title: '', body: '', image_url: null, audio_url: null, next_id: null, choices: [] };
}

@Component({
  imports: [RouterLink, NgTemplateOutlet, FormsModule, ArasaacCredit, PictogramPages, PictogramThumbnail, MicrophoneDialog, AudioPreview],
  templateUrl: './instructions.html',
  styleUrl: './instructions.scss',
  host: { '(window:keydown)': 'historyKey($event)', '(focusout)': 'finishTyping()' },
})
export class AdminInstructions {
  private readonly api = inject(InstructionApi);
  private readonly speech = inject(Speech);
  protected readonly list = this.api.adminList();
  protected readonly topics = this.api.adminTopics();
  protected readonly filter = signal<number | null>(null);
  protected readonly scenarioQuery = signal('');
  protected readonly addingTopic = signal(false);
  protected readonly topicItems = computed(() => this.topics.hasValue() ? this.topics.value() : []);
  protected readonly filteredTopic = computed(() => this.topicItems().find((topic) => topic.id === this.filter())?.title);
  protected readonly listed = computed(() => {
    const filter = this.filter();
    const candidates = this.list.hasValue()
      ? this.list.value().filter((item) => filter === null || item.topic_id === filter)
      : [];
    return searchScenarios(candidates, this.scenarioQuery());
  });
  protected readonly view = signal<'step' | 'graph'>('step');
  protected readonly symbolQuery = signal('');
  protected readonly symbolCategory = signal<SymbolCategory>('Все');
  protected readonly symbolChoice = signal<string | null>(null);
  protected readonly selectedSymbol = computed(() => {
    const step = this.step();
    return this.symbolChoice() ? step?.choices.find((choice) => choice.id === this.symbolChoice())?.image_url : step?.image_url;
  });
  protected readonly activeSymbols = computed(() => {
    if (!this.pictogramLibrary.hasValue()) return [];
    const { pictograms, selection } = this.pictogramLibrary.value();
    const selected = new Set(selection.pictogram_ids);
    return pictograms.filter((symbol) => selected.has(symbol.id));
  });
  protected readonly categories = computed<readonly SymbolCategory[]>(() => {
    const available = new Set(this.activeSymbols().map((symbol) => symbol.category));
    return ['Все', ...PICTOGRAM_CATEGORIES.filter((category) => available.has(category))];
  });
  private readonly symbolCandidates = computed(() => {
    const category = this.symbolCategory();
    const items = this.activeSymbols();
    return category === 'Все' ? items : items.filter((symbol) => symbol.category === category);
  });
  protected readonly visibleSymbols = pictogramSearch(this.symbolCandidates, this.symbolQuery);
  protected readonly symbolPageSize = 24;
  protected readonly symbolPage = linkedSignal({ source: this.visibleSymbols, computation: () => 0 });
  protected readonly pageSymbols = computed(() => {
    const start = this.symbolPage() * this.symbolPageSize;
    return this.visibleSymbols().slice(start, start + this.symbolPageSize);
  });
  protected readonly arasaacInLibrary = computed(() => this.pageSymbols().some((symbol) => isArasaacPictogram(symbol.url)));
  protected readonly arasaacInDraft = computed(() => this.draft()?.steps.some((step) =>
    isArasaacPictogram(step.image_url) || step.choices.some((choice) => isArasaacPictogram(choice.image_url))) ?? false);
  private readonly microphone = viewChild.required(MicrophoneDialog);
  private recordingTarget?: MediaTarget;
  protected readonly titleAudio = computed(() => stepTitleAudio(this.step()));
  protected readonly bodyAudioRange = computed(() => {
    const from = stepAudioBodyStart(this.step());
    return from ? { from, to: 1 } : null;
  });
  protected readonly roleConfig = inject(SiteDisplayApi).adminResource();
  protected readonly audiences = computed(() => this.roleConfig.hasValue()
    ? this.roleConfig.value().roles : []);
  protected readonly audienceExists = (key: string) => this.audiences().some((role) => role.key === key);
  protected readonly draft = signal<InstructionInput | null>(null);
  protected readonly history = signal<{ undo: DraftSnapshot[]; redo: DraftSnapshot[] }>({ undo: [], redo: [] });
  private typing?: { field: string; at: number };
  protected readonly pictogramLibrary = inject(PictogramApi).library(() => this.draft() !== null);
  protected readonly selectedId = signal<number | undefined>(undefined);
  protected readonly stepId = signal<string | null>(null);
  protected readonly busy = signal(false);
  protected readonly message = signal('');
  protected readonly error = signal(false);
  protected readonly checked = signal(false);
  protected readonly published = computed(() => this.draft()?.is_published ?? false);
  protected readonly step = computed(() => this.draft()?.steps.find((s) => s.id === this.stepId()));
  protected readonly issues = computed(() => this.draft() ? checkInstruction(this.draft()!) : []);
  protected readonly stepNumber = computed(() => (this.draft()?.steps.findIndex((step) => step.id === this.stepId()) ?? -1) + 1);
  protected readonly graph = computed(() => {
    const draft = this.draft();
    return draft?.steps.length ? layoutGraph(draft) : null;
  });
  private textChanged = false;

  constructor() {
    inject(DestroyRef).onDestroy(() => this.speech.stop());
  }

  protected createTopic(title: string, description: string): void {
    if (this.busy() || !title.trim()) return;
    this.busy.set(true);
    this.api.createTopic(title.trim(), description.trim()).subscribe({
      next: (topic) => {
        this.topics.reload();
        this.filter.set(topic.id);
        this.update({ topic_id: topic.id });
        this.addingTopic.set(false);
        this.busy.set(false);
        this.notify('Тема создана.');
      },
      error: (error: unknown) => {
        this.busy.set(false);
        this.notify(errorText(error), true);
      },
    });
  }

  protected close(): void {
    this.speech.stop();
    this.draft.set(null);
    this.history.set({ undo: [], redo: [] });
    this.finishTyping();
    this.message.set('');
  }

  protected editStep(id: string): void {
    this.speech.stop();
    this.stepId.set(id);
    this.symbolChoice.set(null);
    this.view.set('step');
  }

  protected moveStep(direction: -1 | 1): void {
    const item = this.draft();
    const index = this.stepNumber() - 1;
    if (!item || index < 0 || !item.steps[index + direction]) return;
    const steps = [...item.steps];
    [steps[index], steps[index + direction]] = [steps[index + direction], steps[index]];
    this.update({ steps });
  }

  protected fileSelected(event: Event, slot: MediaSlot): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    const target = this.mediaTarget(slot);
    if (file && target) this.upload(file, target);
    input.value = '';
  }

  protected clearAudio(slot: MediaSlot): void {
    this.speech.stop();
    const target = this.mediaTarget(slot);
    if (target) this.applyMedia(null, target);
  }

  protected selectSymbol(url: string): void {
    const choice = this.symbolChoice();
    if (choice) this.patchChoice(choice, { image_url: url });
    else this.patchStep({ image_url: url });
  }

  protected uploadSymbol(event: Event): void {
    this.fileSelected(event, { scope: 'step', field: 'image_url', choiceId: this.symbolChoice() });
  }

  protected record(label: string, slot: MediaSlot): void {
    const target = this.mediaTarget(slot);
    if (!target || this.busy()) return;
    this.speech.stop();
    this.recordingTarget = target;
    this.microphone().open('Озвучка ' + label);
  }

  protected attachRecording(url: string): void {
    const target = this.recordingTarget;
    if (!target) return;
    this.recordingTarget = undefined;
    this.applyMedia(url, target);
    this.notify('Запись добавлена. Сохраните сценарий, чтобы применить её.');
  }

  private upload(file: Blob, target: MediaTarget): void {
    if (this.busy()) return;
    if (file.size > INSTRUCTION_MEDIA_MAX_BYTES) {
      this.notify('Размер файла должен быть до 8 МБ.', true);
      return;
    }
    this.busy.set(true);
    this.api.uploadMedia(file).subscribe({
      next: ({ url }) => {
        this.applyMedia(url, target);
        this.busy.set(false);
        this.notify('Файл добавлен.');
      },
      error: (error: unknown) => {
        this.busy.set(false);
        this.notify(errorText(error, 'Не удалось загрузить файл.'), true);
      },
    });
  }

  private mediaTarget(slot: MediaSlot): MediaTarget | null {
    if (slot.scope === 'scenario') return slot;
    const stepId = this.stepId();
    return stepId ? { ...slot, stepId } : null;
  }

  private applyMedia(url: string | null, target: MediaTarget): void {
    const item = this.draft();
    if (!item) return;
    const { field } = target;
    if (target.scope === 'scenario') {
      this.update({ [field]: url });
      return;
    }
    this.update({ steps: item.steps.map((step) => {
      if (step.id !== target.stepId) return step;
      if (!target.choiceId) return field === 'audio_url'
        ? { ...step, audio_url: url, audio_body_start: undefined }
        : { ...step, [field]: url };
      const choiceField = field === 'image_url' ? 'image_url' : 'audio_url';
      return { ...step, choices: step.choices.map((choice) => choice.id === target.choiceId ? { ...choice, [choiceField]: url } : choice) };
    }) });
  }

  protected create(): void {
    const step = newStep();
    const roles = this.audiences();
    const audience = roles.find((role) => !role.is_hidden)?.key ?? roles[0]?.key ?? '';
    this.open({ title: '', description: '', audience, topic_id: this.filter(), is_published: false, start_step_id: step.id, steps: [step] });
  }

  protected select(item: Instruction): void {
    this.open(item, item.id);
  }

  private open(value: InstructionInput, id?: number): void {
    this.view.set('step');
    this.symbolChoice.set(null);
    this.selectedId.set(id);
    this.draft.set(value);
    this.history.set({ undo: [], redo: [] });
    this.finishTyping();
    this.stepId.set(value.start_step_id ?? value.steps[0]?.id ?? null);
    this.message.set('');
    this.checked.set(false);
    this.textChanged = false;
  }

  protected update(changes: Partial<InstructionInput>, textField?: string): void {
    const item = this.draft();
    if (!item || (Object.keys(changes) as (keyof InstructionInput)[])
      .every((key) => Object.is(item[key], changes[key]))) return;
    const now = Date.now();
    const sameEdit = textField && this.typing?.field === textField && now - this.typing.at < 750;
    if (!sameEdit) {
      const before = { item, stepId: this.stepId() };
      this.history.update(({ undo }) => ({ undo: [...undo.slice(-99), before], redo: [] }));
    }
    this.typing = textField ? { field: textField, at: now } : undefined;
    if (changes.title !== undefined || changes.description !== undefined) this.textChanged = true;
    this.draft.set({ ...item, ...changes });
  }

  protected finishTyping(): void {
    this.typing = undefined;
  }

  protected historyKey(event: KeyboardEvent): void {
    if (!this.draft() || this.busy() || event.defaultPrevented || event.isComposing || event.altKey
      || (!event.ctrlKey && !event.metaKey)) return;
    const target = event.target;
    if (target instanceof HTMLElement && (target.closest('dialog, .topic-form')
      || (target.closest('input, textarea, [contenteditable]') && !target.closest('[data-draft-text]')))) return;
    const key = event.key.toLowerCase();
    const undo = key === 'z' || event.code === 'KeyZ';
    const redo = key === 'y' || event.code === 'KeyY';
    if (!undo && !redo) return;
    event.preventDefault();
    this.restoreHistory(redo || event.shiftKey ? 'redo' : 'undo');
  }

  protected restoreHistory(direction: HistoryDirection): void {
    const current = this.draft();
    const history = this.history();
    const entries = history[direction];
    const restored = entries.at(-1);
    if (!current || !restored || this.busy()) return;
    const opposite = direction === 'undo' ? 'redo' : 'undo';
    const previous = { item: current, stepId: this.stepId() };
    this.history.set({ ...history, [direction]: entries.slice(0, -1), [opposite]: [...history[opposite], previous] });
    this.speech.stop();
    this.finishTyping();
    this.draft.set({ ...restored.item, is_published: current.is_published });
    this.stepId.set(restored.stepId);
    this.symbolChoice.set(null);
    this.message.set('');
  }

  protected audience(value: string): void {
    if (this.audiences().some(({ key }) => key === value)) this.update({ audience: value });
  }

  protected patchStep(changes: Partial<InstructionStep>, textField?: string): void {
    const item = this.draft();
    const step = this.step();
    if (!item || !step) return;
    if (changes.body !== undefined || changes.title !== undefined) this.textChanged = true;
    const updated = { ...step, ...changes };
    if (updated.audio_url !== step.audio_url) delete updated.audio_body_start;
    this.update({ steps: item.steps.map((s) => s.id === step.id ? updated : s) }, textField && step.id + ':' + textField);
  }

  protected addStep(): void {
    const item = this.draft();
    if (!item || item.steps.length >= 100) return;
    const step = newStep();
    const previous = item.steps.at(-1);
    const steps = item.steps.map((s) => s.id === previous?.id && !s.next_id && !s.choices.length
      ? { ...s, next_id: step.id } : s);
    this.update({ steps: [...steps, step], start_step_id: item.start_step_id ?? step.id });
    this.editStep(step.id);
  }

  protected removeStep(): void {
    const item = this.draft();
    const id = this.stepId();
    if (!item || !id) return;
    this.speech.stop();
    const steps = item.steps.filter((s) => s.id !== id);
    this.update({ steps, start_step_id: item.start_step_id === id ? null : item.start_step_id });
    this.stepId.set(steps[0]?.id ?? null);
    this.symbolChoice.set(null);
    this.checked.set(true);
  }

  protected addChoice(): void {
    const step = this.step();
    if (step && step.choices.length < 20) this.patchStep({ choices: [...step.choices, {
      id: localId(), label: '', next_id: step.next_id,
    }] });
  }

  protected patchChoice(id: string, changes: Partial<StepChoice>): void {
    const step = this.step();
    if (step) this.patchStep({ choices: step.choices.map((c) => c.id === id ? { ...c, ...changes } : c) },
      changes.label !== undefined ? id + ':label' : undefined);
  }

  protected removeChoice(id: string): void {
    const step = this.step();
    this.speech.stop();
    if (step) this.patchStep({ choices: step.choices.filter((c) => c.id !== id) });
    if (this.symbolChoice() === id) this.symbolChoice.set(null);
  }

  protected exists(id: string): boolean {
    return this.draft()?.steps.some((step) => step.id === id) ?? false;
  }

  protected stepLabel(id: string): string {
    return this.draft()?.steps.find((step) => step.id === id)?.title.trim() || 'Шаг без названия';
  }

  protected destinationLabel(id: string | null): string {
    if (!id) return 'Конец';
    return this.exists(id) ? this.stepLabel(id) : 'Шаг удалён';
  }

  protected check(): void {
    this.checked.set(true);
  }

  protected openPreview(): void {
    const draft = this.draft();
    if (!draft) return;
    const tab = window.open('about:blank', '_blank');
    if (!tab) {
      this.notify('Браузер заблокировал вкладку предпросмотра.', true);
      return;
    }
    try {
      tab.opener = null;
      tab.sessionStorage.setItem(INSTRUCTION_PREVIEW_KEY, JSON.stringify(draft));
      tab.location.replace('/admin/preview');
      tab.focus();
    } catch {
      tab.close();
      this.notify('Не удалось открыть предпросмотр. Попробуйте ещё раз.', true);
    }
  }

  protected save(publish: boolean): void {
    const item = this.draft();
    if (!item || this.busy()) return;
    this.finishTyping();
    if (!this.audienceExists(item.audience)) {
      this.notify('Выберите роль в настройках сценария.', true);
      return;
    }
    if (!item.topic_id) {
      this.notify('Выберите тему в настройках сценария.', true);
      return;
    }
    const value: InstructionInput = {
      title: item.title.trim(), description: item.description.trim(), is_published: publish,
      title_audio_url: item.title_audio_url ?? null, description_audio_url: item.description_audio_url ?? null,
      audience: item.audience, topic_id: item.topic_id, start_step_id: item.start_step_id, steps: item.steps,
    };
    if (publish && checkInstruction(value).length) {
      this.checked.set(true);
      this.notify('Исправьте замечания перед публикацией.', true);
      return;
    }
    this.busy.set(true);
    this.api.save(value, this.selectedId()).subscribe({
      next: (saved) => {
        const verify = this.textChanged ? ' Сверьте изображение, озвучку и печатную версию, если она есть.' : '';
        this.selectedId.set(saved.id);
        this.draft.set(saved);
        this.checked.set(false);
        this.textChanged = false;
        this.busy.set(false);
        const status = publish ? 'Сценарий опубликован.'
          : item.is_published ? 'Сценарий скрыт из бота. Его можно снова опубликовать.'
          : 'Черновик сохранён.';
        this.notify(status + verify);
        this.list.reload();
      },
      error: (e: unknown) => {
        this.busy.set(false);
        this.notify(errorText(e), true);
      },
    });
  }

  protected remove(): void {
    const id = this.selectedId();
    if (!id || this.busy() || !confirm('Удалить этот сценарий?')) return;
    this.busy.set(true);
    this.api.remove(id).subscribe({
      next: () => {
        this.selectedId.set(undefined);
        this.close();
        this.busy.set(false);
        this.notify('Сценарий удалён.');
        this.list.reload();
      },
      error: (e: unknown) => { this.busy.set(false); this.notify(errorText(e), true); },
    });
  }

  private notify(message: string, error = false): void {
    this.message.set(message);
    this.error.set(error);
  }
}
