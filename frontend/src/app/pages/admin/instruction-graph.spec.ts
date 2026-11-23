import type { InstructionInput, InstructionStep } from '../../core/instructions';
import { layoutGraph } from './instruction-graph';

function step(id: string, ...destinations: (string | null)[]): InstructionStep {
  return {
    id, title: id, body: '', image_url: null, audio_url: null,
    next_id: destinations[0],
    choices: destinations.length > 1
      ? destinations.map((next_id, index) => ({ id: String(index), label: String(index), next_id }))
      : [],
  };
}

function graph(start_step_id: string, steps: InstructionStep[]) {
  const instruction: InstructionInput = {
    title: 'Сценарий', description: '', audience: 'self', topic_id: 1,
    is_published: false, start_step_id, steps,
  };
  return layoutGraph(instruction);
}

it('connects consecutive cards in the same column through their facing borders', () => {
  const layout = graph('greeting', [
    step('greeting', 'exam', 'calm'),
    step('exam', null, 'calm'),
    step('calm', 'exam'),
  ]);
  const [, exam, calm] = layout.nodes;
  expect(calm.x).toBe(exam.x);
  const center = exam.x + layout.nodeWidth / 2;
  const down = layout.edges.find((edge) => edge.id === 'exam:1')?.path;
  const up = layout.edges.find((edge) => edge.id === 'calm:0')?.path;
  expect(down).toBe(`M ${center - 8} ${exam.y + layout.nodeHeight} V ${calm.y}`);
  expect(up).toBe(`M ${center + 8} ${calm.y} V ${exam.y + layout.nodeHeight}`);
});

it('routes a return above the cards and combines links with the same endpoints', () => {
  const layout = graph('first', [
    step('first', 'middle', 'middle'),
    step('middle', 'last'),
    step('last', 'first', 'last'),
  ]);
  expect(layout.edges.filter((edge) => edge.id.startsWith('first:'))).toHaveLength(1);
  const [first, , last] = layout.nodes;
  const returnPath = layout.edges.find((edge) => edge.id === 'last:0')?.path;
  const lane = returnPath?.match(/ V (\d+) H /)?.[1];
  expect(Number(lane)).toBeLessThan(first.y);
  expect(returnPath?.endsWith(`H ${first.x}`)).toBe(true);
  expect(layout.edges.find((edge) => edge.id === 'last:1')?.path.endsWith(`${last.x + layout.nodeWidth} ${last.y + 20}`)).toBe(true);
});
