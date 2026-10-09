import { useMemo, useState, type ReactNode } from 'react';
import type { AnyEntity, Control, EntityKind, Kpi, Opportunity, Risk, Role, User } from '../types';
import { modules } from '../schema';
import { useStore } from '../store';
import { useUi } from '../ui';
import { continuityGap, findUsages, roleMembers, kpiStatus, residualScore, riskLevel, riskScore } from '../logic';
import { Field } from './Fields';
import { ConfirmButton, Empty, LevelBadge, StatusPill, Tag, TrafficLight } from './common';
import { useRights } from '../useRights';
import { dateLocale, t } from '../i18n';
import { systemRoleById } from '../permissions';
import { RoleInsights, RoleProfile } from './RoleInsights';
import { SystemRoleMatrix, UserInsights } from './UserInsights';
import { Heatmap } from './Heatmap';
import { Sparkline } from './Sparkline';

interface Column {
  label: string;
  render: (e: AnyEntity) => ReactNode;
  sort?: (e: AnyEntity) => string | number;
}

function useColumns(kind: EntityKind): Column[] {
  const roles = useStore((s) => s.role);
  const users = useStore((s) => s.user);
  const controls = useStore((s) => s.control);
  const roleName = (id: string) => roles.find((r) => r.id === id)?.title ?? '—';

  switch (kind) {
    case 'risk':
      return [
        { label: 'Kategorie', render: (e) => t((e as Risk).category), sort: (e) => (e as Risk).category },
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
        { label: 'Status', render: (e) => t((e as Risk).status) },
      ];
    case 'opportunity':
      return [
        { label: 'Kategorie', render: (e) => t((e as Opportunity).category) },
        { label: 'Verantwortlich', render: (e) => roleName((e as Opportunity).ownerRoleId) },
        {
          label: 'Potenzial',
          render: (e) => (e as Opportunity).likelihood * (e as Opportunity).benefitScore,
          sort: (e) => -(e as Opportunity).likelihood * (e as Opportunity).benefitScore,
        },
        { label: 'Status', render: (e) => t((e as Opportunity).status) },
      ];
    case 'control':
      return [
        { label: 'Art', render: (e) => t((e as Control).controlType) },
        { label: 'Automatisierung', render: (e) => t((e as Control).automation) },
        { label: 'Key', render: (e) => ((e as Control).keyControl ? '★' : '') },
        { label: 'Umsetzung', render: (e) => t((e as Control).implementation) },
        {
          label: 'Wirksamkeit',
          render: (e) => {
            const v = (e as Control).operatingEffectiveness;
            const cls = v === 'Wirksam' ? 'ok' : v === 'Nicht geprüft' ? 'muted' : 'warn';
            return <span className={cls}>{t(v)}</span>;
          },
        },
        { label: 'Annex A', render: (e) => (e as Control).annexA.join(', ') },
      ];
    case 'role':
      return [
        { label: 'Typ', render: (e) => t((e as Role).roleType), sort: (e) => (e as Role).roleType },
        {
          label: 'Inhaber',
          render: (e) =>
            roleMembers(e as Role, users)
              .filter((m) => m.function === 'Inhaber')
              .map((m) => m.user.title)
              .join(', ') || <span className="warn">{t('unbesetzt')}</span>,
        },
        {
          label: 'Kritikalität',
          render: (e) => {
            const r = e as Role;
            const gap = continuityGap(r);
            return (
              <span className={gap ? 'warn' : undefined} title={gap ? t(gap) : undefined}>
                {t(r.criticality)}
                {gap && ' ⚠'}
              </span>
            );
          },
        },
        { label: 'Pflicht', render: (e) => ((e as Role).mandatory ? '●' : '') },
        { label: 'Status', render: (e) => <StatusPill status={(e as Role).status} /> },
      ];
    case 'user':
      return [
        { label: 'Abteilung', render: (e) => (e as User).department, sort: (e) => (e as User).department },
        { label: 'Systemrollen', render: (e) => (e as User).systemRoles.map((id) => t(systemRoleById.get(id)?.name ?? id)).join(', ') },
        { label: 'Status', render: (e) => <StatusPill status={(e as User).status} /> },
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
        { label: 'Frequenz', render: (e) => t((e as Kpi).frequency) },
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
  const [roleType, setRoleType] = useState<string>('');
  const [mandatoryOnly, setMandatoryOnly] = useState(false);
  const [userTab, setUserTab] = useState<'users' | 'matrix'>('users');
  const { canRead, canEdit } = useRights();

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
    if (kind === 'role') {
      list = list.filter((e) => (!roleType || (e as Role).roleType === roleType) && (!mandatoryOnly || (e as Role).mandatory));
    }
    const sorter = sortCol !== null ? columns[sortCol].sort : undefined;
    if (sorter) list = [...list].sort((a, b) => (sorter(a) < sorter(b) ? -1 : sorter(a) > sorter(b) ? 1 : 0));
    return list;
  }, [items, q, kind, heatCell, heatMode, sortCol, columns, roleType, mandatoryOnly]);

  const selected = items.find((e) => e.id === selectedId);
  if (!canRead(kind)) return <Empty>{t('Ihre Systemrollen erlauben keinen Zugriff auf {name}.', { name: t(def.plural) })}</Empty>;

  const head = (
    <div className="module-head">
      <h2 style={{ color: def.color }}>{t(def.plural)}</h2>
      <div className="row gap">
        {kind === 'user' && (
          <div className="seg">
            <button className={userTab === 'users' ? 'active' : ''} onClick={() => setUserTab('users')}>
              {t('Benutzer')}
            </button>
            <button className={userTab === 'matrix' ? 'active' : ''} onClick={() => setUserTab('matrix')}>
              {t('Systemrollen')}
            </button>
          </div>
        )}
        {!canEdit(kind) && <span className="badge readonly">{t('Nur Lesen')}</span>}
        {canEdit(kind) && !(kind === 'user' && userTab === 'matrix') && (
          <button
            className="primary"
            onClick={() => {
              const e = createEntity(kind, kind === 'user' ? t('Neuer Benutzer') : t('Neue(s) {label}', { label: t(def.label) }));
              select(kind, e.id);
            }}
          >
            + {t(def.label)}
          </button>
        )}
      </div>
    </div>
  );

  if (kind === 'user' && userTab === 'matrix') {
    return (
      <div className="module-full">
        {head}
        <SystemRoleMatrix />
      </div>
    );
  }

  return (
    <div className="module">
      <div className="module-list">
        {head}
        {kind === 'role' && (
          <div className="filter-bar">
            {['', 'Führungsrolle', 'Fachrolle', 'Gremium', 'Beauftragter'].map((rt) => (
              <button key={rt || 'all'} className={`chip ${roleType === rt ? 'active' : ''}`} onClick={() => setRoleType(rt)}>
                {rt ? t(rt) : t('Alle Typen')}
              </button>
            ))}
            <label className="checkbox small">
              <input type="checkbox" checked={mandatoryOnly} onChange={(e) => setMandatoryOnly(e.target.checked)} /> {t('nur Pflichtrollen')}
            </label>
          </div>
        )}
        {kind === 'risk' && (
          <div className="card heat-card">
            <div className="row space">
              <strong>{t('Risikomatrix')}</strong>
              <div className="seg">
                <button className={heatMode === 'gross' ? 'active' : ''} onClick={() => setHeatMode('gross')}>
                  {t('Brutto')}
                </button>
                <button className={heatMode === 'net' ? 'active' : ''} onClick={() => setHeatMode('net')}>
                  {t('Netto')}
                </button>
              </div>
            </div>
            <Heatmap risks={items as Risk[]} mode={heatMode} selected={heatCell} onSelect={setHeatCell} />
          </div>
        )}
        <input className="search" placeholder={t('Filtern…')} value={q} onChange={(e) => setQ(e.target.value)} />
        <div className="table-wrap">
          <table className="list">
            <thead>
              <tr>
                <th>ID</th>
                <th>{t('Bezeichnung')}</th>
                {columns.map((c, i) => (
                  <th key={c.label} className={c.sort ? 'sortable' : ''} onClick={() => c.sort && setSortCol(sortCol === i ? null : i)}>
                    {t(c.label)}
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
          {filtered.length === 0 && <Empty>{t('Keine Einträge.')}</Empty>}
        </div>
      </div>
      <div className="module-detail">
        {selected ? <EntityEditor kind={kind} entity={selected} /> : <Empty>{t('Eintrag auswählen oder neu anlegen.')}</Empty>}
      </div>
    </div>
  );
}

function EntityEditor({ kind, entity }: { kind: EntityKind; entity: AnyEntity }) {
  const def = modules[kind];
  const update = useStore((s) => s.updateEntity);
  const remove = useStore((s) => s.deleteEntity);
  const select = useUi((s) => s.select);
  const { canEdit } = useRights();
  const editable = canEdit(kind);
  const [showProfile, setShowProfile] = useState(false);
  const values = entity as unknown as Record<string, unknown>;

  return (
    <div className="editor">
      <div className="editor-head" style={{ borderColor: def.color }}>
        <div>
          <div className="muted small">{t(def.label)}</div>
          <h3>
            <span className="mono">{entity.code}</span> {entity.title}
          </h3>
        </div>
        <div className="row gap">
          {kind === 'role' && <button onClick={() => setShowProfile(true)}>{t('Rollenbeschreibung')}</button>}
          {editable && (
            <ConfirmButton
              label={t('Löschen')}
              confirmLabel={t('Wirklich löschen? (inkl. Zuordnungen)')}
              onConfirm={() => {
                remove(kind, entity.id);
                select(kind, undefined);
              }}
            />
          )}
        </div>
      </div>
      {kind === 'role' && showProfile && <RoleProfile role={entity as Role} onClose={() => setShowProfile(false)} />}
      {kind === 'role' ? <RoleInsights role={entity as Role} part="warnings" /> : kind === 'user' ? <UserInsights user={entity as User} /> : <Insights kind={kind} entity={entity} />}
      <fieldset className="plain" disabled={!editable}>
        {def.sections.map((sec) => (
          <fieldset key={sec.title}>
            <legend>{t(sec.title)}</legend>
            <div className="grid">
              {sec.fields.map((f) => (
                <Field key={f.key} def={f} value={values[f.key]} entityId={entity.id} onChange={(v) => update(kind, entity.id, { [f.key]: v })} />
              ))}
            </div>
          </fieldset>
        ))}
      </fieldset>
      {kind === 'role' && <RoleInsights role={entity as Role} part="derived" />}
      <div className="muted small">
        {t('Angelegt')} {new Date(entity.createdAt).toLocaleString(dateLocale())} · {t('zuletzt geändert')} {new Date(entity.updatedAt).toLocaleString(dateLocale())}
      </div>
    </div>
  );
}

/** Derived information: process usage, linked controls, SoD conflicts, KPI trend. */
function Insights({ kind, entity }: { kind: EntityKind; entity: AnyEntity }) {
  const processes = useStore((s) => s.processes);
  const controls = useStore((s) => s.control);
  const openStep = useUi((s) => s.openStep);
  const go = useUi((s) => s.go);
  const usages = findUsages(processes, kind, entity.id);

  return (
    <div className="insights">
      <div className="insight">
        <div className="insight-title">{t('Verwendet in Prozessschritten ({n})', { n: usages.length })}</div>
        {usages.length === 0 && <div className="muted small">{t('Noch keinem Prozessschritt zugeordnet.')}</div>}
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
          <div className="insight-title">{t('Mitigierende Controls')}</div>
          <div className="tags">
            {controls
              .filter((c) => c.mitigatesRiskIds.includes(entity.id))
              .map((c) => (
                <Tag key={c.id} color={modules.control.color} onClick={() => go('control', c.id)}>
                  {c.code} {c.title}
                </Tag>
              ))}
          </div>
          {!controls.some((c) => c.mitigatesRiskIds.includes(entity.id)) && <div className="warn small">{t('Keine Kontrolle zugeordnet.')}</div>}
        </div>
      )}
      {kind === 'kpi' && (
        <div className="insight">
          <div className="insight-title">{t('Verlauf')}</div>
          <Sparkline kpi={entity as Kpi} />
        </div>
      )}
    </div>
  );
}
