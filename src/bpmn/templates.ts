const header = `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:bpmndi="http://www.omg.org/spec/BPMN/20100524/DI" xmlns:dc="http://www.omg.org/spec/DD/20100524/DC" xmlns:di="http://www.omg.org/spec/DD/20100524/DI" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" id="Definitions_1" targetNamespace="http://grc.example/bpmn">`;

function esc(s: string) {
  return s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
}

export function emptyDiagram(title: string) {
  const pid = `Process_${Math.random().toString(36).slice(2, 8)}`;
  return `${header}
  <bpmn:process id="${pid}" name="${esc(title)}" isExecutable="false">
    <bpmn:startEvent id="StartEvent_1" name="Start" />
  </bpmn:process>
  <bpmndi:BPMNDiagram id="BPMNDiagram_1">
    <bpmndi:BPMNPlane id="BPMNPlane_1" bpmnElement="${pid}">
      <bpmndi:BPMNShape id="StartEvent_1_di" bpmnElement="StartEvent_1">
        <dc:Bounds x="152" y="182" width="36" height="36" />
      </bpmndi:BPMNShape>
    </bpmndi:BPMNPlane>
  </bpmndi:BPMNDiagram>
</bpmn:definitions>`;
}

// ---- Seed diagrams -------------------------------------------------------

type Node = { id: string; type: string; name: string; x: number; y: number; extra?: string };
type Flow = { id: string; from: string; to: string; name?: string; points: [number, number][] };

function size(type: string) {
  if (type.endsWith('Event')) return { w: 36, h: 36 };
  if (type.endsWith('Gateway')) return { w: 50, h: 50 };
  return { w: 100, h: 80 };
}

function semantic(nodes: Node[], flows: Flow[], indent: string) {
  const out: string[] = [];
  for (const n of nodes) {
    const inc = flows.filter((f) => f.to === n.id).map((f) => `${indent}  <bpmn:incoming>${f.id}</bpmn:incoming>`);
    const outg = flows.filter((f) => f.from === n.id).map((f) => `${indent}  <bpmn:outgoing>${f.id}</bpmn:outgoing>`);
    const body = [...inc, ...outg, ...(n.extra ? [n.extra] : [])];
    out.push(`${indent}<bpmn:${n.type} id="${n.id}" name="${esc(n.name)}">`, ...body, `${indent}</bpmn:${n.type}>`);
  }
  for (const f of flows) {
    out.push(`${indent}<bpmn:sequenceFlow id="${f.id}" ${f.name ? `name="${esc(f.name)}" ` : ''}sourceRef="${f.from}" targetRef="${f.to}" />`);
  }
  return out.join('\n');
}

function di(nodes: Node[], flows: Flow[], collapsed: string[] = []) {
  const out: string[] = [];
  for (const n of nodes) {
    const { w, h } = size(n.type);
    const exp = collapsed.includes(n.id) ? ' isExpanded="false"' : '';
    out.push(
      `      <bpmndi:BPMNShape id="${n.id}_di" bpmnElement="${n.id}"${exp}>`,
      `        <dc:Bounds x="${n.x}" y="${n.y}" width="${w}" height="${h}" />`,
      `      </bpmndi:BPMNShape>`,
    );
  }
  for (const f of flows) {
    out.push(
      `      <bpmndi:BPMNEdge id="${f.id}_di" bpmnElement="${f.id}">`,
      ...f.points.map(([x, y]) => `        <di:waypoint x="${x}" y="${y}" />`),
      `      </bpmndi:BPMNEdge>`,
    );
  }
  return out.join('\n');
}

const row = (xs: [string, string, string, number][]): Node[] =>
  xs.map(([id, type, name, x]) => ({ id, type, name, x, y: type.endsWith('Event') ? 182 : type.endsWith('Gateway') ? 175 : 160 }));

const h = (id: string, from: string, to: string, x1: number, x2: number, name?: string): Flow => ({
  id,
  from,
  to,
  name,
  points: [
    [x1, 200],
    [x2, 200],
  ],
});

export function purchaseToPayXml() {
  const subNodes = row([
    ['Sub_Start', 'startEvent', 'Bedarf freigegeben', 152],
    ['Task_Angebote', 'userTask', 'Angebote einholen', 240],
    ['Task_Vergleich', 'userTask', 'Angebote vergleichen', 390],
    ['Task_LiefPruefung', 'userTask', 'Lieferant prüfen (Compliance & IS)', 540],
    ['Task_Vergabe', 'userTask', 'Vergabeentscheidung dokumentieren', 690],
    ['Sub_End', 'endEvent', 'Lieferant ausgewählt', 842],
  ]);
  const subFlows = [
    h('SF_1', 'Sub_Start', 'Task_Angebote', 188, 240),
    h('SF_2', 'Task_Angebote', 'Task_Vergleich', 340, 390),
    h('SF_3', 'Task_Vergleich', 'Task_LiefPruefung', 490, 540),
    h('SF_4', 'Task_LiefPruefung', 'Task_Vergabe', 640, 690),
    h('SF_5', 'Task_Vergabe', 'Sub_End', 790, 842),
  ];

  const nodes = row([
    ['StartEvent_1', 'startEvent', 'Bedarf entstanden', 152],
    ['Task_Bedarf', 'userTask', 'Bedarfsanforderung erfassen', 240],
    ['Task_Genehmigen', 'userTask', 'Anforderung genehmigen', 390],
    ['Gateway_Genehmigt', 'exclusiveGateway', 'Genehmigt?', 540],
    ['Sub_Lieferant', 'subProcess', 'Lieferant auswählen', 640],
    ['Task_Bestellung', 'userTask', 'Bestellung auslösen', 790],
    ['Task_WE', 'manualTask', 'Wareneingang prüfen', 940],
    ['Task_Rechnung', 'userTask', 'Rechnung prüfen & freigeben', 1090],
    ['Task_Zahlung', 'serviceTask', 'Zahlung ausführen', 1240],
    ['End_Bezahlt', 'endEvent', 'Rechnung bezahlt', 1392],
  ]);
  nodes.push({ id: 'End_Abgelehnt', type: 'endEvent', name: 'Anforderung abgelehnt', x: 547, y: 312 });
  // Embed the child plane into the sub process.
  const sub = nodes.find((n) => n.id === 'Sub_Lieferant')!;
  sub.extra = semantic(subNodes, subFlows, '      ');

  const flows: Flow[] = [
    h('Flow_1', 'StartEvent_1', 'Task_Bedarf', 188, 240),
    h('Flow_2', 'Task_Bedarf', 'Task_Genehmigen', 340, 390),
    h('Flow_3', 'Task_Genehmigen', 'Gateway_Genehmigt', 490, 540),
    h('Flow_4', 'Gateway_Genehmigt', 'Sub_Lieferant', 590, 640, 'ja'),
    {
      id: 'Flow_5',
      from: 'Gateway_Genehmigt',
      to: 'End_Abgelehnt',
      name: 'nein',
      points: [
        [565, 225],
        [565, 312],
      ],
    },
    h('Flow_6', 'Sub_Lieferant', 'Task_Bestellung', 740, 790),
    h('Flow_7', 'Task_Bestellung', 'Task_WE', 890, 940),
    h('Flow_8', 'Task_WE', 'Task_Rechnung', 1040, 1090),
    h('Flow_9', 'Task_Rechnung', 'Task_Zahlung', 1190, 1240),
    h('Flow_10', 'Task_Zahlung', 'End_Bezahlt', 1340, 1392),
  ];

  return `${header}
  <bpmn:process id="Process_P2P" name="Beschaffung (Purchase-to-Pay)" isExecutable="false">
${semantic(nodes, flows, '    ')}
  </bpmn:process>
  <bpmndi:BPMNDiagram id="BPMNDiagram_1">
    <bpmndi:BPMNPlane id="BPMNPlane_1" bpmnElement="Process_P2P">
${di(nodes, flows, ['Sub_Lieferant'])}
    </bpmndi:BPMNPlane>
  </bpmndi:BPMNDiagram>
  <bpmndi:BPMNDiagram id="BPMNDiagram_Sub">
    <bpmndi:BPMNPlane id="BPMNPlane_Sub" bpmnElement="Sub_Lieferant">
${di(subNodes, subFlows)}
    </bpmndi:BPMNPlane>
  </bpmndi:BPMNDiagram>
</bpmn:definitions>`;
}

export function accessManagementXml() {
  const nodes = row([
    ['IAM_Start', 'startEvent', 'Berechtigung benötigt', 152],
    ['IAM_Antrag', 'userTask', 'Berechtigungsantrag stellen', 240],
    ['IAM_Genehmigung', 'userTask', 'Antrag genehmigen (Vorgesetzter & Dateneigner)', 390],
    ['IAM_Einrichten', 'serviceTask', 'Berechtigung einrichten', 540],
    ['IAM_Rezert', 'userTask', 'Berechtigungen rezertifizieren', 690],
    ['IAM_End', 'endEvent', 'Berechtigung aktiv', 842],
  ]);
  const flows = [
    h('IAM_F1', 'IAM_Start', 'IAM_Antrag', 188, 240),
    h('IAM_F2', 'IAM_Antrag', 'IAM_Genehmigung', 340, 390),
    h('IAM_F3', 'IAM_Genehmigung', 'IAM_Einrichten', 490, 540),
    h('IAM_F4', 'IAM_Einrichten', 'IAM_Rezert', 640, 690),
    h('IAM_F5', 'IAM_Rezert', 'IAM_End', 790, 842),
  ];
  return `${header}
  <bpmn:process id="Process_IAM" name="Berechtigungsmanagement" isExecutable="false">
${semantic(nodes, flows, '    ')}
  </bpmn:process>
  <bpmndi:BPMNDiagram id="BPMNDiagram_1">
    <bpmndi:BPMNPlane id="BPMNPlane_1" bpmnElement="Process_IAM">
${di(nodes, flows)}
    </bpmndi:BPMNPlane>
  </bpmndi:BPMNDiagram>
</bpmn:definitions>`;
}
