import type { ReactNode } from 'react';
import type { AnyEntity, Control, AssignableKind, Kpi, ProcessModel, Raci, Risk } from '../types';
import type { SelectedElement } from '../bpmn/BpmnEditor';
import { useStore } from '../store';
import { useUi } from '../ui';
import { modules } from '../schema';
import { assignedIds, emptyAssignment, kpiStatus, residualScore, riskLevel, riskScore } from '../logic';
import { LevelBadge, Picker, TrafficLight } from './common';
import { useRights } from '../useRights';
import { t } from '../i18n';
import { badgeDefs } from '../bpmn/BpmnEditor';

const typeLabels: Record<string, string> = {
  task: 'Aufgabe',
  userTask: 'Benutzeraufgabe',
  manualTask: 'Manuelle Aufgabe',
  serviceTask: 'Serviceaufgabe',
  scriptTask: 'Skriptaufgabe',
  businessRuleTask: 'Geschäftsregel',
  sendTask: 'Sendeaufgabe',
  receiveTask: 'Empfangsaufgabe',
  subProcess: 'Subprozess',
  callActivity: 'Aufrufaktivität',
  startEvent: 'Startereignis',
  endEvent: 'Endereignis',
  intermediateThrowEvent: 'Zwischenereignis',
  intermediateCatchEvent: 'Zwischenereignis',
  boundaryEvent: 'Randereignis',
  exclusiveGateway: 'Exklusives Gateway',
  parallelGateway: 'Paralleles Gateway',
  inclusiveGateway: 'Inklusives Gateway',
  eventBasedGateway: 'Ereignisbasiertes Gateway',
  dataObjectReference: 'Datenobjekt',
  dataStoreReference: 'Datenspeicher',
  textAnnotation: 'Anmerkung',
  participant: 'Pool',
  lane: 'Lane',
  group: 'Gruppe',
};

const raciHelp: Record<Raci, string> = {
  R: 'Responsible – führt durch',
  A: 'Accountable – verantwortet / genehmigt',
  C: 'Consulted – wird konsultiert',
  I: 'Informed – wird informiert',
};

export function StepPanel({
  process,
  element,
  readOnly = false,
  onOpenSubProcess,
}: {
  process: ProcessModel;
  element: SelectedElement | null;
  readOnly?: boolean;
  onOpenSubProcess: (id: string) => void;
}) {
  if (!element) return <ProcessSummary process={process} />;
  if (!element.isActivity) {
    return (
      <div className="panel">
        <div className="panel-head">
          <div className="muted small">{t(typeLabels[element.type] ?? element.type)}</div>
          <h3>{element.name || element.id}</h3>
        </div>
        <p className="muted">
          {t('Risiken, Chancen, Rollen, KPI und Controls können Aktivitäten zugeordnet werden (Aufgaben, Subprozesse, Aufrufaktivitäten).')}
        </p>
      </div>
    );
  }
  return (
    <fieldset className="plain panel-fieldset" disabled={readOnly}>
      <ActivityPanel process={process} element={element} onOpenSubProcess={onOpenSubProcess} />
    </fieldset>
  );
}

function ActivityPanel({ process, element, onOpenSubProcess }: { process: ProcessModel; element: SelectedElement; onOpenSubProcess: (id: string) => void }) {
  const store = useStore();
  const go = useUi((s) => s.go);
  const a = process.assignments[element.id] ?? emptyAssignment();
  const { canEdit } = useRights();

  const assign = (kind: AssignableKind, id: string) => store.assign(process.id, element.id, kind, id);
  const quickCreate = (kind: AssignableKind, title: string) => {
    const e = store.createEntity(kind, title);
    assign(kind, e.id);
  };

  // IKS check: risks at this step without a mitigating control at this step.
  const stepControls = store.control.filter((c) => a.controls.includes(c.id));
  const uncovered = store.risk.filter((r) => a.risks.includes(r.id) && !stepControls.some((c) => c.mitigatesRiskIds.includes(r.id)));
  const suggestions = store.control.filter((c) => !a.controls.includes(c.id) && uncovered.some((r) => c.mitigatesRiskIds.includes(r.id)));

  const section = (kind: AssignableKind, extra: (e: AnyEntity) => ReactNode) => {
    const def = modules[kind];
    const all = store[kind] as AnyEntity[];
    const ids = assignedIds(a, kind);
    return (
      <div className="assign-section" key={kind}>
        <div className="assign-title" style={{ color: def.color }}>
          {t(def.plural)} <span className="count">{ids.length}</span>
        </div>
        {ids.map((id) => {
          const e = all.find((x) => x.id === id);
          if (!e) return null;
          return (
            <div className="assign-row" key={id}>
              <span className="link grow" onClick={() => go(kind, id)} title={t('Im Modul öffnen')}>
                <span className="mono">{e.code}</span> {e.title}
              </span>
              {extra(e)}
              <button className="tag-x" title={t('Zuordnung entfernen')} onClick={() => store.unassign(process.id, element.id, kind, id)}>
                ×
              </button>
            </div>
          );
        })}
        <Picker
          options={all.map((e) => ({ id: e.id, label: `${e.code} ${e.title}` }))}
          exclude={ids}
          placeholder={t('{label} zuordnen oder neu anlegen…', { label: t(def.label) })}
          onPick={(id) => assign(kind, id)}
          onCreate={canEdit(kind) ? (title) => quickCreate(kind, title) : undefined}
        />
      </div>
    );
  };

  return (
    <div className="panel">
      <div className="panel-head">
        <div className="muted small">
          {t(typeLabels[element.type] ?? element.type)} · <span className="mono">{element.id}</span>
        </div>
        <h3>{element.name || t('(ohne Namen)')}</h3>
        {element.isCollapsedSubProcess && (
          <button className="small-btn" onClick={() => onOpenSubProcess(element.id)}>
            ⤵ {t('Subprozess öffnen')}
          </button>
        )}
      </div>

      {element.type === 'callActivity' && <CallLink process={process} elementId={element.id} />}

      {section('role', (e) => {
        const r = a.roles.find((x) => x.roleId === e.id)!;
        return (
          <select className="raci-select" value={r.raci} title={t(raciHelp[r.raci])} onChange={(ev) => store.setRaci(process.id, element.id, e.id, ev.target.value as Raci)}>
            {(['R', 'A', 'C', 'I'] as Raci[]).map((x) => (
              <option key={x} value={x} title={t(raciHelp[x])}>
                {x}
              </option>
            ))}
          </select>
        );
      })}
      {a.roles.length > 0 && !a.roles.some((r) => r.raci === 'R') && <div className="warn small pad">{t('Keine durchführende Rolle (R) festgelegt.')}</div>}

      {section('risk', (e) => {
        const r = e as Risk;
        return <LevelBadge level={riskLevel(residualScore(r))} score={residualScore(r)} />;
      })}
      {uncovered.length > 0 && (
        <div className="warn-box small">
          ⚠ {t('Ohne Kontrolle in diesem Schritt')}: {uncovered.map((r) => r.code).join(', ')}
          {suggestions.length > 0 && (
            <div className="suggest">
              {t('Vorschlag')}:{' '}
              {suggestions.map((c) => (
                <button key={c.id} className="small-btn" onClick={() => assign('control', c.id)}>
                  + {c.code} {c.title}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {section('control', (e) => {
        const c = e as Control;
        const cls = c.operatingEffectiveness === 'Wirksam' ? 'ok' : c.operatingEffectiveness === 'Nicht geprüft' ? 'muted' : 'warn';
        return (
          <span className={`small ${cls}`} title={`${t('Operative Wirksamkeit')}: ${t(c.operatingEffectiveness)}`}>
            {c.keyControl ? '★ ' : ''}
            {t(c.controlType).slice(0, 4)}.
          </span>
        );
      })}

      {section('opportunity', (e) => {
        const o = e as AnyEntity & { likelihood: number; benefitScore: number };
        return <span className="badge level-low">{o.likelihood * o.benefitScore}</span>;
      })}

      {section('kpi', (e) => {
        const k = e as Kpi;
        const last = k.measurements.at(-1);
        return (
          <span className="row gap-s small">
            <TrafficLight status={kpiStatus(k)} />
            {last ? `${last.value} ${k.unit}` : ''}
          </span>
        );
      })}

      <div className="assign-section">
        <div className="assign-title">{t('Notiz / Arbeitsanweisung')}</div>
        <textarea rows={3} value={a.note} onChange={(e) => store.setStepNote(process.id, element.id, e.target.value)} />
      </div>
    </div>
  );
}

function CallLink({ process, elementId }: { process: ProcessModel; elementId: string }) {
  const processes = useStore((s) => s.processes);
  const updateProcess = useStore((s) => s.updateProcess);
  const go = useUi((s) => s.go);
  const linked = process.callLinks[elementId] ?? '';
  return (
    <div className="assign-section">
      <div className="assign-title">{t('Aufgerufener Prozess')}</div>
      <div className="row gap">
        <select
          value={linked}
          onChange={(e) => updateProcess(process.id, { callLinks: { ...process.callLinks, [elementId]: e.target.value } })}
        >
          <option value="">{t('— nicht verknüpft —')}</option>
          {processes
            .filter((p) => p.id !== process.id)
            .map((p) => (
              <option key={p.id} value={p.id}>
                {p.code} {p.title}
              </option>
            ))}
        </select>
        {linked && (
          <button className="small-btn" onClick={() => go('processes', linked)}>
            {t('Öffnen')} →
          </button>
        )}
      </div>
    </div>
  );
}

function ProcessSummary({ process }: { process: ProcessModel }) {
  const store = useStore();
  const all = Object.values(process.assignments);
  const uniq = (kind: AssignableKind) => new Set(all.flatMap((a) => assignedIds(a, kind))).size;
  const risks = store.risk.filter((r) => all.some((a) => a.risks.includes(r.id)));
  const maxGross = Math.max(0, ...risks.map((r) => riskScore(r.likelihood, r.impact)));
  return (
    <div className="panel">
      <div className="panel-head">
        <div className="muted small">{t('Prozess')}</div>
        <h3>{process.title}</h3>
      </div>
      <p className="muted small">{t('Element im Diagramm auswählen, um Rollen, Risiken, Chancen, Controls und KPI zuzuordnen.')}</p>
      <div className="stat-grid">
        {(['role', 'risk', 'opportunity', 'control', 'kpi'] as AssignableKind[]).map((k) => (
          <div className="stat" key={k} style={{ borderColor: modules[k].color }}>
            <div className="stat-num">{uniq(k)}</div>
            <div className="stat-label">{t(modules[k].plural)}</div>
          </div>
        ))}
      </div>
      {risks.length > 0 && (
        <p className="small">
          {t('Höchstes Bruttorisiko')}: <LevelBadge level={riskLevel(maxGross)} score={maxGross} />
        </p>
      )}
      <div className="legend small">
        <div>
          <b>{t('Badges im Diagramm')}:</b>
        </div>
        <div>
          {badgeDefs.map((b) => (
            <span key={b.key} className="legend-item">
              <span className="grc-badge" style={{ background: b.color }}>
                {t(b.label)}
              </span>{' '}
              {t(b.title)}
            </span>
          ))}
        </div>
        <div className="muted">{t('Subprozess anlegen: Aufgabe auswählen → Schraubenschlüssel (Typ ändern) → „Sub-Process (collapsed)“. Hineinnavigieren über „⤵ Subprozess öffnen“ oder das blaue Symbol am Element; zurück über die Brotkrumen-Navigation oben links.')}</div>
      </div>
    </div>
  );
}
