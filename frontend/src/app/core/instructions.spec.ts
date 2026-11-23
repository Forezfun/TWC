import { InstructionStep, instructionProgress, stepAudioBodyStart, stepTitleAudio } from './instructions';

function step(id: string, next_id: string | null, choices: (string | null)[] = []): InstructionStep {
  return {
    id, next_id, title: id, body: '', image_url: null, audio_url: null,
    choices: choices.map((target, index) => ({ id: String(index), label: String(index), next_id: target })),
  };
}

describe('Озвучка названия шага', () => {
  it('использует отдельный файл и сохраняет начало текста в старой совмещённой записи', () => {
    const combined = { ...step('start', null), body: 'Текст шага', audio_url: '/combined.mp3', audio_body_start: 0.25 };
    expect(stepTitleAudio(combined)).toEqual({ url: '/combined.mp3', range: { from: 0, to: 0.25 } });
    const updated = { ...combined, title_audio_url: '/title.mp3' };
    expect(stepTitleAudio(updated)).toEqual({ url: '/title.mp3', range: null });
    expect(stepAudioBodyStart(updated)).toBe(0.25);
  });

  it('читает старую запись целиком, если на шаге было только название', () => {
    const titleOnly = { ...step('start', null), audio_url: '/audio.mp3' };
    expect(stepTitleAudio(titleOnly)).toEqual({ url: '/audio.mp3', range: null });
    expect(stepTitleAudio({ ...titleOnly, body: 'Текст шага' })).toBeNull();
  });
});

describe('Ход инструкции', () => {
  it('увеличивает процент равными долями в линейном сценарии', () => {
    const steps = [step('start', 'middle'), step('middle', 'end'), step('end', null)];
    expect(instructionProgress(steps, [], 'start')).toBe(0);
    expect(instructionProgress(steps, ['start'], 'middle')).toBe(33);
    expect(instructionProgress(steps, ['start', 'middle'], 'end')).toBe(67);
  });

  it('продвигается на длинной ветке и восстанавливает процент при возврате', () => {
    const steps = [step('start', 'choice'), step('choice', null, ['end', 'extra']), step('extra', 'end'), step('end', null)];
    const atChoice = instructionProgress(steps, ['start'], 'choice');
    const longer = instructionProgress(steps, ['start', 'choice'], 'extra');
    const shorter = instructionProgress(steps, ['start', 'choice'], 'end');
    expect(longer).toBeGreaterThan(atChoice);
    expect(shorter).toBeGreaterThan(atChoice);
    expect(instructionProgress(steps, ['start', 'choice', 'extra'], 'end')).toBeGreaterThan(longer);
    expect(instructionProgress(steps, ['start'], 'choice')).toBe(atChoice);
  });

  it('обрабатывает повтор с выходом и оставляет 100% экрану завершения', () => {
    const steps = [step('repeat', null, ['repeat', null])];
    expect(instructionProgress(steps, ['repeat'], 'repeat')).toBe(50);
    expect(instructionProgress(steps, Array(100).fill('repeat'), 'repeat')).toBe(99);
  });
});
