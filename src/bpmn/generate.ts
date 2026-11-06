// Builds a BPMN diagram with automatic layout from a simple list of steps
// (used for the demo processes and for drafting a process with or without AI).
import type { Raci } from '../types';
import { di, esc, header, semantic, type Flow, type Node } from './templates';

export interface DraftStep {
  name: string;
  /** task = user task, system = service task, manual = manual task, decision = exclusive gateway */
  type?: 'task' | 'system' | 'manual' | 'decision';
  /** role (id or name) responsible for the step */
  role?: string;
  raci?: Raci;
  /** decision only: name of the end event reached on "no" */
  no?: string;
}

export interface GeneratedProcess {
  xml: string;
  /** BPMN element id per input step (same order) */
  elementIds: string[];
}

const taskType = { task: 'userTask', system: 'serviceTask', manual: 'manualTask' } as const;

export function generateProcessXml(
  title: string,
  steps: DraftStep[],
  opts: { prefix?: string; start?: string; end?: string } = {},
): GeneratedProcess {
  const pre = opts.prefix ?? `G${Math.random().toString(36).slice(2, 6)}`;
  const nodes: Node[] = [];
  const flows: Flow[] = [];
  const elementIds: string[] = [];
  let x = 152;
  let prev = { id: `${pre}_Start`, right: 188 };
  nodes.push({ id: prev.id, type: 'startEvent', name: opts.start ?? 'Start', x, y: 182 });
  x = 240;
  let f = 0;
  const link = (from: string, to: string, x1: number, x2: number, name?: string) =>
    flows.push({
      id: `${pre}_F${++f}`,
      from,
      to,
      name,
      points: [
        [x1, 200],
        [x2, 200],
      ],
    });

  steps.forEach((s, i) => {
    const id = `${pre}_${s.type === 'decision' ? 'G' : 'T'}${i + 1}`;
    elementIds.push(id);
    if (s.type === 'decision') {
      nodes.push({ id, type: 'exclusiveGateway', name: s.name, x, y: 175 });
      link(prev.id, id, prev.right, x, prev.id.includes('_G') ? 'ja' : undefined);
      const endId = `${id}_End`;
      nodes.push({ id: endId, type: 'endEvent', name: s.no || 'Abbruch', x: x + 7, y: 312 });
      flows.push({
        id: `${pre}_F${++f}`,
        from: id,
        to: endId,
        name: 'nein',
        points: [
          [x + 25, 225],
          [x + 25, 312],
        ],
      });
      prev = { id, right: x + 50 };
      x += 100;
    } else {
      nodes.push({ id, type: taskType[s.type ?? 'task'], name: s.name, x, y: 160 });
      link(prev.id, id, prev.right, x, prev.id.includes('_G') ? 'ja' : undefined);
      prev = { id, right: x + 100 };
      x += 150;
    }
  });
  const endId = `${pre}_End`;
  nodes.push({ id: endId, type: 'endEvent', name: opts.end ?? 'Ende', x: x + 2, y: 182 });
  link(prev.id, endId, prev.right, x + 2, prev.id.includes('_G') ? 'ja' : undefined);

  const pid = `Process_${pre}`;
  const xml = `${header}
  <bpmn:process id="${pid}" name="${esc(title)}" isExecutable="false">
${semantic(nodes, flows, '    ')}
  </bpmn:process>
  <bpmndi:BPMNDiagram id="BPMNDiagram_1">
    <bpmndi:BPMNPlane id="BPMNPlane_1" bpmnElement="${pid}">
${di(nodes, flows)}
    </bpmndi:BPMNPlane>
  </bpmndi:BPMNDiagram>
</bpmn:definitions>`;
  return { xml, elementIds };
}

/** Without AI: one step per line or bullet; a line ending in "?" becomes a decision; "(Rolle)" at the end names the role. */
export function stepsFromText(text: string): DraftStep[] {
  return text
    .split(/\n|;/)
    .map((l) => l.replace(/^\s*(?:[-*•]|\d+[.)])\s*/, '').trim())
    .filter(Boolean)
    .map((line) => {
      const m = line.match(/^(.*?)\s*\(([^)]+)\)\s*(\??)$/);
      const name = (m ? m[1] + m[3] : line).trim();
      const role = m?.[2]?.trim();
      return { name, role, type: name.endsWith('?') ? 'decision' : 'task' } as DraftStep;
    });
}
