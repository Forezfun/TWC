import type { InstructionInput, InstructionStep } from '../../core/instructions';

const nodeWidth = 176;
const nodeHeight = 114;
const columnPitch = nodeWidth + 68;
const rowPitch = nodeHeight + 32;
const margin = 24;
const channelGap = 9;

function targets(step: InstructionStep): Set<string | null> {
  return new Set(step.choices.length ? step.choices.map((choice) => choice.next_id) : [step.next_id]);
}

export function layoutGraph(instruction: InstructionInput) {
  const byId = new Map(instruction.steps.map((step) => [step.id, step]));
  const ranks = new Map<string, number>();
  const start = instruction.start_step_id;
  if (start && byId.has(start)) {
    const queue = [start];
    ranks.set(start, 0);
    for (let index = 0; index < queue.length; index++) {
      const id = queue[index];
      for (const target of targets(byId.get(id)!)) {
        if (target && byId.has(target) && !ranks.has(target)) {
          ranks.set(target, ranks.get(id)! + 1);
          queue.push(target);
        }
      }
    }
  }

  const unlinkedRank = ranks.size ? Math.max(...ranks.values()) + 1 : 0;
  const rows = new Map<number, number>();
  const nodes = instruction.steps.map((step, index) => {
    const column = ranks.get(step.id) ?? unlinkedRank;
    const row = rows.get(column) ?? 0;
    rows.set(column, row + 1);
    return { step, number: index + 1, x: margin + column * columnPitch, y: margin + row * rowPitch };
  });
  const right = Math.max(...nodes.map((node) => node.x), margin);
  const finish = nodes.some(({ step }) => targets(step).has(null))
    ? { x: right + columnPitch, y: margin }
    : null;
  const byPosition = new Map(nodes.map((node) => [node.step.id, node]));
  let channels = 0;
  const connections = nodes.flatMap((source) =>
    [...targets(source.step)].flatMap((target, index) => {
      const destination = target === null ? finish : byPosition.get(target);
      if (!destination) return [];
      const dx = destination.x - source.x;
      const dy = destination.y - source.y;
      const simple = destination === source || dx === columnPitch || (dx === 0 && Math.abs(dy) === rowPitch);
      const channel = simple ? null : channels++;
      return [{ id: source.step.id + ':' + index, source, destination, channel }];
    }),
  );

  // Reserve space above the cards for connections that span several columns or rows.
  const offset = channels * channelGap;
  for (const node of nodes) node.y += offset;
  if (finish) finish.y += offset;

  const edges = connections.map(({ id, source, destination, channel }) => {
    const fromX = source.x + nodeWidth;
    const fromY = source.y + nodeHeight / 2;
    const toY = destination.y + nodeHeight / 2;
    let path: string;
    if (channel !== null) {
      const routeY = margin + channel * channelGap;
      const targetY = destination.y + 34;
      path = `M ${fromX} ${fromY} H ${fromX + 19} V ${routeY} H ${destination.x - 19} V ${targetY} H ${destination.x}`;
    } else if (destination === source) {
      path = `M ${fromX} ${source.y + 42} C ${fromX + 28} ${source.y + 42}, ${fromX + 28} ${source.y + 20}, ${fromX} ${source.y + 20}`;
    } else if (destination.x === source.x) {
      const down = destination.y > source.y;
      const portX = source.x + nodeWidth / 2 + (down ? -8 : 8);
      const startY = down ? source.y + nodeHeight : source.y;
      const endY = down ? destination.y : destination.y + nodeHeight;
      path = `M ${portX} ${startY} V ${endY}`;
    } else {
      path = `M ${fromX} ${fromY} C ${fromX + 30} ${fromY}, ${destination.x - 30} ${toY}, ${destination.x} ${toY}`;
    }
    return { id, path };
  });
  const width = (finish?.x ?? right) + nodeWidth + 32;
  const height = Math.max(...nodes.map((node) => node.y), margin) + nodeHeight + margin;
  return { nodes, edges, finish, width, height, nodeWidth, nodeHeight };
}
