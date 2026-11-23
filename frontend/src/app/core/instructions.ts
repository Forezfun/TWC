import type { Audience } from './api';

export const INSTRUCTION_PREVIEW_KEY = 'twc-instruction-preview';

export interface StepChoice {
  id: string;
  label: string;
  next_id: string | null;
  image_url?: string | null;
  audio_url?: string | null;
}

export interface InstructionStep {
  id: string;
  title: string;
  body: string;
  image_url: string | null;
  audio_url: string | null;
  title_audio_url?: string | null;
  /** Start of the body as a fraction of a recording that includes the title. */
  audio_body_start?: number;
  next_id: string | null;
  choices: StepChoice[];
}

export function stepAudioBodyStart(step: InstructionStep | undefined): number {
  const boundary = step?.audio_body_start ?? 0;
  return step?.audio_url && step.body.trim() && boundary > 0 && boundary < 1 ? boundary : 0;
}

export function stepTitleAudio(step: InstructionStep | undefined) {
  if (step?.title_audio_url) return { url: step.title_audio_url, range: null };
  if (!step?.audio_url) return null;
  const boundary = stepAudioBodyStart(step);
  if (boundary) return { url: step.audio_url, range: { from: 0, to: boundary } };
  return step.body.trim() ? null : { url: step.audio_url, range: null };
}

export interface InstructionInput {
  title: string;
  description: string;
  title_audio_url?: string | null;
  description_audio_url?: string | null;
  audience: Audience;
  topic_id: number | null;
  is_published: boolean;
  start_step_id: string | null;
  steps: InstructionStep[];
}

export interface Instruction extends InstructionInput {
  id: number;
  created_at: string;
  updated_at: string;
}

export type InstructionSummary = Pick<Instruction, 'id' | 'title' | 'description' | 'audience' | 'title_audio_url' | 'description_audio_url'> & {
  image_url: string | null;
};

export interface InstructionTopic {
  id: number;
  title: string;
  description: string;
}

export interface InstructionIssue {
  stepId?: string;
  message: string;
}

function destinationsOf(step: InstructionStep): (string | null)[] {
  return step.choices.length ? step.choices.map(({ next_id }) => next_id) : [step.next_id];
}

export function checkInstruction(instruction: InstructionInput): InstructionIssue[] {
  const issues: InstructionIssue[] = [];
  if (!instruction.title.trim()) issues.push({ message: 'Введите название инструкции.' });
  if (!instruction.topic_id) issues.push({ message: 'Выберите тему сценария.' });
  const byId = new Map(instruction.steps.map((step) => [step.id, step]));
  if (byId.size !== instruction.steps.length) {
    issues.push({ message: 'У двух шагов одинаковые идентификаторы.' });
  }
  const start = instruction.start_step_id;
  if (!start || !byId.has(start)) issues.push({ message: 'Укажите первый шаг.' });

  const destinations = new Map<string, (string | null)[]>();
  for (const step of instruction.steps) {
    if (!step.title.trim()) issues.push({ stepId: step.id, message: 'Введите заголовок шага.' });
    const targets = destinationsOf(step);
    destinations.set(step.id, targets);
    if (targets.some((target) => target !== null && !byId.has(target))) {
      issues.push({ stepId: step.id, message: 'Переход ведёт на отсутствующий шаг.' });
    }
    if (step.choices.some((choice) => !choice.label.trim())) {
      issues.push({ stepId: step.id, message: 'Подпишите все варианты ответа.' });
    }
  }

  const reached = new Set<string>();
  const pending = start && byId.has(start) ? [start] : [];
  while (pending.length) {
    const id = pending.pop()!;
    if (reached.has(id)) continue;
    reached.add(id);
    for (const next of destinations.get(id) ?? []) {
      if (next !== null && byId.has(next)) pending.push(next);
    }
  }

  // По обратным связям отмечаем шаги, из которых есть путь к завершению.
  const toFinish = stepsToFinish(destinations);
  for (const id of byId.keys()) {
    if (start && byId.has(start) && !reached.has(id)) {
      issues.push({ stepId: id, message: 'До этого шага нельзя добраться от начала.' });
    } else if (reached.has(id) && !toFinish.has(id)) {
      issues.push({ stepId: id, message: 'Из этого шага нет пути к завершению.' });
    }
  }
  return issues;
}

function stepsToFinish(destinations: ReadonlyMap<string, (string | null)[]>): Map<string, number> {
  const distance = new Map<string, number>();
  const reverse = new Map<string, string[]>();
  for (const [id, targets] of destinations) {
    if (targets.includes(null)) distance.set(id, 1);
    for (const target of targets) {
      if (target === null) continue;
      const incoming = reverse.get(target) ?? [];
      incoming.push(id);
      reverse.set(target, incoming);
    }
  }
  const finishQueue = [...distance.keys()];
  for (let i = 0; i < finishQueue.length; i++) {
    for (const id of reverse.get(finishQueue[i]) ?? []) {
      if (distance.has(id)) continue;
      distance.set(id, distance.get(finishQueue[i])! + 1);
      finishQueue.push(id);
    }
  }
  return distance;
}

export function linearInstruction(instruction: InstructionInput): string[] | null {
  const byId = new Map(instruction.steps.map((step) => [step.id, step]));
  const seen = new Set<string>();
  let next = instruction.start_step_id;
  while (next !== null) {
    const step = byId.get(next);
    if (!step || seen.has(next) || step.choices.length) return null;
    seen.add(next);
    next = step.next_id;
  }
  return [...seen];
}

/** Replaying the path returns the same percentage when the user goes back. */
export function instructionProgress(steps: readonly InstructionStep[], trail: readonly string[], current: string): number {
  if (!trail.length) return 0;
  const distance = stepsToFinish(new Map(steps.map((step) => [step.id, destinationsOf(step)])));
  let progress = 0;
  for (const id of [...trail.slice(1), current]) {
    const remaining = distance.get(id) ?? steps.length;
    const next = Math.round(progress + (100 - progress) / (remaining + 1));
    progress = Math.min(99, Math.max(progress + 1, next));
  }
  return progress;
}
