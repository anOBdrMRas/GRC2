import { useMemo, useState, type ReactNode } from 'react';
import type { AnyEntity, Control, EntityKind, Kpi, Opportunity, Risk, Role } from '../types';
import { modules } from '../schema';
import { useStore } from '../store';
import { useUi } from '../ui';
import { elementNames, findUsages, kpiStatus, residualScore, riskLevel, riskScore } from '../logic';
import { Field } from './Fields';
import { Empty, LevelBadge, Tag, TrafficLight } from './common';
import { Heatmap } from './Heatmap';
import { Sparkline } from './Sparkline';

interface Column {
  label: string;
  render: (e: AnyEntity) => ReactNode;
  sort?: (e: AnyEntity) => string | number;
}

function useColumns(kind: EntityKind): Column[] {
  const roles = useStore((s) => s.role);
  const controls = useStore((s) => s.control);
  const roleName = (id: string) => roles.find((r) => r.id === id)?.title ?? '—';

  switch (kind) {
    case 'risk':
      return [
        { label: 'Kategorie', render: (e) => (e as Risk).category, sort: (e) => (e as Risk).category },
        { label: 'Eigner', render: (e) => roleName((e as Risk).ownerRoleId) },
        {
          label: 'Brutto',
          render: (e) => {
            const s = riskScore((e as Risk).likelihood, (e as Risk).impact);
            return <LevelBadge level={riskLevel(s)} score={s} />;
          },
          sort: (e) => -riskScore((e as Risk).likelihood, (e as Risk).impact),
        },
        {
          label: 'Netto',
          render: (e) => {
            const s = residualScore(e as Risk);
            return <LevelBadge level={riskLevel(s)} score={s} />;
          },
          sort: (e) => -residualScore(e as Risk),
        },
        { label: 'Controls', render: (e) => controls.filter((c) => c.mitigatesRiskIds.includes(e.id)).length || <span className="warn">0</span> },
        { label: 'Status', render: (e) => (e as Risk).status },
      ];
    case 'opportunity':
      return [
        { label: 'Kategorie', render: (e) => (e as Opportunity).category },
        { label: 'Verantwortlich', render: (e) => roleName((e as Opportunity).ownerRoleId) },
        {
          label: 'Potenzial',
          render: (e) => (e as Opportunity).likelihood * (e as Opportunity).benefitScore,
          sort: (e) => -(e as Opportunity).likelihood * (e as Opportunity).benefitScore,
        },
        { label: 'Status', render: (e) => (e as Opportunity).status },
      ];
    case 'control':
      return [
        { label: 'Art', render: (e) => (e as Control).controlType },
        { label: 'Automatisierung', render: (e) => (e as Control).automation },
        { label: 'Key', render: (e) => ((e as Control).keyControl ? '★' : '') },
        { label: 'Umsetzung', render: (e) => (e as Control).implementation },
        {
          label: 'Wirksamkeit',
          render: (e) => {
            const v = (e as Control).operatingEffectiveness;
            const cls = v === 'Wirksam' ? 'ok' : v === 'Nicht geprüft' ? 'muted' : 'warn';
            return <span className={cls}>{v}</span>;
          },
        },
        { label: 'Annex A', render: (e) => (e as Control).annexA.join(', ') },
      ];
    case 'role':
      return [
        { label: 'Org.-Einheit', render: (e) => (e as Role).orgUnit },
        { label: 'Stelleninhaber', render: (e) => (e as Role).holders },
        { label: 'Compliance', render: (e) => ((e as Role).complianceRelevant ? '●' : '') },
      ];
    case 'kpi':
      return [
        {
          label: 'Ist',
          render: (e) => {
            const k = e as Kpi;
            const last = k.measurements.at(-1);
            return (
              <span className="row gap-s">
                <TrafficLight status={kpiStatus(k)} />
                {last ? `${last.value} ${k.unit}` : '—'}
              </span>
            );
          },
        },
        { label: 'Ziel', render: (e) => `${(e as Kpi).direction === 'higher' ? '≥' : '≤'} ${(e as Kpi).target} ${(e as Kpi).unit}` },
        { label: 'Frequenz', render: (e) => (e as Kpi).frequency },
        { label: 'Verantwortlich', render: (e) => roleName((e as Kpi).ownerRoleId) },
      ];
  }
}

export function EntityModule({ kind }: { kind: EntityKind }) {
  const def = modules[kind];
  const items = useStore((s) => s[kind]) as AnyEntity[];
  const createEntity = useStore((s) => s.createEntity);
  const selectedId = useUi((s) => s.selected[kind]);
  const select = useUi((s) => s.select);
  const columns = useColumns(kind);
  const [q, setQ] = useState('');
  const [heatMode, setHeatMode] = useState<'gross' | 'net'>('gross');
  const [heatCell, setHeatCell] = useState<string | null>(null);
  const [sortCol, setSortCol] = useState<number | null>(null);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    let list = items.filter((e) => !needle || `${e.code} ${e.title} ${e.description}`.toLowerCase().includes(needle));
    if (kind === 'risk' && heatCell) {
      list = list.filter((e) => {
        const r = e as Risk;
        const key = heatMode === 'gross' ? `${r.likelihood}-${r.impact}` : `${r.residualLikelihood}-${r.residualImpact}`;
        return key === heatCell;
      });
    }
    const sorter = sortCol !== null ? columns[sortCol].sort : undefined;
    if (sorter) list = [...list].sort((a, b) => (sorter(a) < sorter(b) ? -1 : sorter(a) > sorter(b) ? 1 : 0));
    return list;
  }, [items, q, kind, heatCell, heatMode, sortCol, columns]);

  const selected = items.find((e) => e.id === selectedId);

  return (
    <div className="module">
      <div className="module-list">
        <div className="module-head">
          <h2 style={{ color: def.color }}>{def.plural}</h2>
          <button
            className="primary"
            onClick={() => {
              const e = createEntity(kind, `Neue(s) ${def.label}`);
              select(kind, e.id);
            }}
          >
            + {def.label}
          </button>
        </div>
        {kind === 'risk' && (
          <div className="card heat-card">
            <div className="row space">
              <strong>Risikomatrix</strong>
              <div className="seg">
                <button className={heatMode === 'gross' ? 'active' : ''} onClick={() => setHeatMode('gross')}>
                  Brutto
                </button>
                <button className={heatMode === 'net' ? 'active' : ''} onClick={() => setHeatMode('net')}>
                  Netto
                </button>
              </div>
            </div>
            <Heatmap risks={items as Risk[]} mode={heatMode} selected={heatCell} onSelect={setHeatCell} />
          </div>
        )}
        <input className="search" placeholder="Filtern…" value={q} onChange={(e) => setQ(e.target.value)} />
        <div className="table-wrap">
          <table className="list">
            <thead>
              <tr>
                <th>ID</th>
                <th>Bezeichnung</th>
                {columns.map((c, i) => (
                  <th key={c.label} className={c.sort ? 'sortable' : ''} onClick={() => c.sort && setSortCol(sortCol === i ? null : i)}>
                    {c.label}
                    {sortCol === i && ' ▾'}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((e) => (
                <tr key={e.id} className={e.id === selectedId ? 'selected' : ''} onClick={() => select(kind, e.id)}>
                  <td className="mono">{e.code}</td>
                  <td>{e.title}</td>
                  {columns.map((c) => (
                    <td key={c.label}>{c.render(e)}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
          {filtered.length === 0 && <Empty>Keine Einträge.</Empty>}
        </div>
      </div>
      <div className="module-detail">
        {selected ? <EntityEditor kind={kind} entity={selected} /> : <Empty>Eintrag auswählen oder neu anlegen.</Empty>}
      </div>
    </div>
  );
}

function EntityEditor({ kind, entity }: { kind: EntityKind; entity: AnyEntity }) {
  const def = modules[kind];
  const update = useStore((s) => s.updateEntity);
  const remove = useStore((s) => s.deleteEntity);
  const select = useUi((s) => s.select);
  const values = entity as unknown as Record<string, unknown>;

  return (
    <div className="editor">
      <div className="editor-head" style={{ borderColor: def.color }}>
        <div>
          <div className="muted small">{def.label}</div>
          <h3>
            <span className="mono">{entity.code}</span> {entity.title}
          </h3>
        </div>
        <button
          className="danger"
          onClick={() => {
            if (confirm(`${def.label} „${entity.title}“ löschen? Alle Zuordnungen werden entfernt.`)) {
              remove(kind, entity.id);
              select(kind, undefined);
            }
          }}
        >
          Löschen
        </button>
      </div>
      <Insights kind={kind} entity={entity} />
      {def.sections.map((sec) => (
        <fieldset key={sec.title}>
          <legend>{sec.title}</legend>
          <div className="grid">
            {sec.fields.map((f) => (
              <Field key={f.key} def={f} value={values[f.key]} onChange={(v) => update(kind, entity.id, { [f.key]: v })} />
            ))}
          </div>
        </fieldset>
      ))}
      <div className="muted small">
        Angelegt {new Date(entity.createdAt).toLocaleString('de-DE')} · zuletzt geändert {new Date(entity.updatedAt).toLocaleString('de-DE')}
      </div>
    </div>
  );
}

/** Derived information: process usage, linked controls, SoD conflicts, KPI trend. */
function Insights({ kind, entity }: { kind: EntityKind; entity: AnyEntity }) {
  const processes = useStore((s) => s.processes);
  const controls = useStore((s) => s.control);
  const roles = useStore((s) => s.role);
  const openStep = useUi((s) => s.openStep);
  const go = useUi((s) => s.go);
  const usages = findUsages(processes, kind, entity.id);

  // Segregation of duties: this role and an incompatible role both carry R/A on the same step.
  const isRa = (raci: string) => raci === 'R' || raci === 'A';
  const sodConflicts =
    kind === 'role'
      ? processes.flatMap((p) => {
          const names = elementNames(p.xml);
          return Object.entries(p.assignments)
            .filter(([el, a]) => el in names && a.roles.some((r) => r.roleId === entity.id && isRa(r.raci)))
            .flatMap(([el, a]) =>
              a.roles
                .filter((r) => (entity as Role).incompatibleRoleIds.includes(r.roleId) && isRa(r.raci))
                .map((r) => ({ p, el, name: names[el], other: roles.find((x) => x.id === r.roleId) })),
            );
        })
      : [];

  return (
    <div className="insights">
      <div className="insight">
        <div className="insight-title">Verwendet in Prozessschritten ({usages.length})</div>
        {usages.length === 0 && <div className="muted small">Noch keinem Prozessschritt zugeordnet.</div>}
        <div className="tags">
          {usages.map((u) => (
            <Tag key={u.process.id + u.elementId} onClick={() => openStep(u.process.id, u.elementId)}>
              {u.process.code} › {u.elementName}
              {u.raci && <b className="raci">{u.raci}</b>}
            </Tag>
          ))}
        </div>
      </div>
      {kind === 'risk' && (
        <div className="insight">
          <div className="insight-title">Mitigierende Controls</div>
          <div className="tags">
            {controls
              .filter((c) => c.mitigatesRiskIds.includes(entity.id))
              .map((c) => (
                <Tag key={c.id} color={modules.control.color} onClick={() => go('control', c.id)}>
                  {c.code} {c.title}
                </Tag>
              ))}
          </div>
          {!controls.some((c) => c.mitigatesRiskIds.includes(entity.id)) && <div className="warn small">Keine Kontrolle zugeordnet.</div>}
        </div>
      )}
      {kind === 'role' && sodConflicts.length > 0 && (
        <div className="insight warn-box">
          <div className="insight-title">⚠ Funktionstrennungskonflikte</div>
          {sodConflicts.map((c, i) => (
            <div key={i} className="small link" onClick={() => openStep(c.p.id, c.el)}>
              {c.p.code} › {c.name}: R/A gemeinsam mit „{c.other?.title}“
            </div>
          ))}
        </div>
      )}
      {kind === 'kpi' && (
        <div className="insight">
          <div className="insight-title">Verlauf</div>
          <Sparkline kpi={entity as Kpi} />
        </div>
      )}
    </div>
  );
}
