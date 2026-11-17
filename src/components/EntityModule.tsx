import { useMemo, useState, type ReactNode } from 'react';
import type { AnyEntity, Audit, Control, EntityKind, Kpi, Mandate, Opportunity, Position, Risk, Role, User } from '../types';
import { MandateInsights, MandateStatePill, MandateWorkflowBar } from './MandateViews';
import { PositionInsights, PositionProfile } from './OrgViews';
import { auditTypes, modules } from '../schema';
import { useStore } from '../store';
import { useUi } from '../ui';
import {
  allFindings,
  auditDate,
  findUsages,
  isHighRisk,
  isOpenFinding,
  isOverdueFinding,
  kpiStatus,
  mandateState,
  positionHolders,
  riskLevel,
  scoreOf,
  roleHolders,
} from '../logic';
import { Field } from './Fields';
import { ConfirmButton, Empty, LevelBadge, StatusPill, Tag, TrafficLight } from './common';
import { useRights } from '../useRights';
import { AiFieldSuggest, canSuggest } from './AiDraft';
import { ExcelTools } from './ExcelTools';
import { WorkflowBar } from './WorkflowBar';
import { isWfKind, type WfItem } from '../workflow';
import { useSample } from '../ai';
import { dateLocale, t } from '../i18n';
import { systemRoleById } from '../permissions';
import { RoleInsights, RoleProfile } from './RoleInsights';
import { SystemRoleMatrix, UserInsights } from './UserInsights';
import { Heatmap } from './Heatmap';
import { AuditFindingsList, AuditInsights, AuditProgram, FindingLine, auditTypeColor } from './AuditViews';
import { Sparkline } from './Sparkline';

interface Column {
  label: string;
  render: (e: AnyEntity) => ReactNode;
  sort?: (e: AnyEntity) => string | number;
}

function useColumns(kind: EntityKind): Column[] {
  const roles = useStore((s) => s.role);
  const org = useStore();
  const controls = useStore((s) => s.control);
  const roleName = (id: string) => roles.find((r) => r.id === id)?.title ?? '—';

  switch (kind) {
    case 'risk':
      return [
        { label: 'Bereich / Funktion', render: (e) => (e as Risk).department || '–', sort: (e) => (e as Risk).department },
        { label: 'Kategorie', render: (e) => t((e as Risk).category), sort: (e) => (e as Risk).category },
        { label: 'Risikoeigner', render: (e) => org.user.find((u) => u.id === (e as Risk).ownerUserId)?.title ?? <span className="warn">–</span> },
        {
          label: 'Score',
          render: (e) => <LevelBadge level={riskLevel(scoreOf(e as Risk))} score={scoreOf(e as Risk)} />,
          sort: (e) => -scoreOf(e as Risk),
        },
        {
          label: 'Höheres Risiko',
          render: (e) => (isHighRisk(scoreOf(e as Risk)) ? <b className="warn">{t('Ja')}</b> : t('Nein')),
          sort: (e) => (isHighRisk(scoreOf(e as Risk)) ? 0 : 1),
        },
        { label: 'Controls', render: (e) => controls.filter((c) => c.mitigatesRiskIds.includes(e.id)).length || <span className="warn">0</span> },
        { label: 'Behandlung', render: (e) => t((e as Risk).treatmentStatus) },
        { label: 'Freigabe', render: (e) => <StatusPill status={(e as Risk).status} /> },
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
        { label: 'Umsetzung', render: (e) => t((e as Opportunity).progressStatus) },
        { label: 'Freigabe', render: (e) => <StatusPill status={(e as Risk).status} /> },
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
            roleHolders(e as Role, org)
              .map((m) => m.user.title)
              .join(', ') || <span className="warn">{t('unbesetzt')}</span>,
        },
        { label: 'Pflicht', render: (e) => ((e as Role).mandatory ? '●' : '') },
        { label: 'Status', render: (e) => <StatusPill status={(e as Role).status} /> },
      ];
    case 'position':
      return [
        { label: 'Org.-Einheit', render: (e) => t((e as Position).orgUnit), sort: (e) => (e as Position).orgUnit },
        {
          label: 'Inhaber',
          render: (e) => {
            const p = e as Position;
            const h = positionHolders(p, org.user);
            return h.map((u) => u.title).join(', ') || <span className="warn">{t('unbesetzt')}</span>;
          },
        },
        {
          label: 'Berichtet an',
          render: (e) => {
            const id = (e as Position).reportsToDisciplinaryId;
            return id === 'n/a' ? 'n/a' : (org.position.find((p) => p.id === id)?.title ?? '–');
          },
        },
        { label: 'Rollen', render: (e) => (e as Position).roles.length, sort: (e) => -(e as Position).roles.length },
        { label: 'Status', render: (e) => <StatusPill status={(e as Position).status} /> },
      ];
    case 'mandate':
      return [
        { label: 'Art', render: (e) => t((e as Mandate).mandateType), sort: (e) => (e as Mandate).mandateType },
        {
          label: 'Empfänger',
          render: (e) => org.user.find((u) => u.id === (e as Mandate).recipientUserId)?.title ?? <span className="warn">–</span>,
          sort: (e) => org.user.find((u) => u.id === (e as Mandate).recipientUserId)?.title ?? '',
        },
        { label: 'Gültig bis', render: (e) => (e as Mandate).validUntil || t('unbefristet'), sort: (e) => (e as Mandate).validUntil || '9999' },
        { label: 'Zustand', render: (e) => <MandateStatePill mandate={e as Mandate} />, sort: (e) => mandateState(e as Mandate) },
      ];
    case 'user':
      return [
        {
          label: 'Stelle',
          render: (e) => org.position.find((p) => p.id === (e as User).positionId)?.title ?? '–',
          sort: (e) => (e as User).positionId,
        },
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
    case 'audit':
      return [
        {
          label: 'Typ',
          render: (e) => {
            const a = e as Audit;
            return (
              <span className="row gap-s">
                <span className="swatch" style={{ background: auditTypeColor[a.auditType] }} />
                {t(a.auditType)}
                {a.certStage && <span className="muted small">· {t(a.certStage)}</span>}
              </span>
            );
          },
          sort: (e) => (e as Audit).auditType,
        },
        { label: 'Termin', render: (e) => auditDate(e as Audit) || '–', sort: (e) => auditDate(e as Audit) || '9999' },
        { label: 'Status', render: (e) => <StatusPill status={(e as Audit).status} /> },
        {
          label: 'Feststellungen',
          render: (e) => {
            const fs = (e as Audit).findings;
            const open = fs.filter(isOpenFinding).length;
            const overdue = fs.filter((f) => isOverdueFinding(f)).length;
            return (
              <span className="small">
                {t('{n} offen', { n: open })}
                {overdue > 0 && <span className="warn"> · {t('{n} überfällig', { n: overdue })}</span>}
              </span>
            );
          },
        },
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
  const [heatCell, setHeatCell] = useState<string | null>(null);
  const [sortCol, setSortCol] = useState<number | null>(null);
  const [roleType, setRoleType] = useState<string>('');
  const [riskDept, setRiskDept] = useState('');
  const [mandatoryOnly, setMandatoryOnly] = useState(false);
  const [userTab, setUserTab] = useState<'users' | 'matrix'>('users');
  const [auditTab, setAuditTab] = useState<'audits' | 'findings' | 'program'>('audits');
  const [auditType, setAuditType] = useState('');
  const focusFindingId = useUi((s) => s.focusFindingId);
  // Opening a finding from elsewhere always shows the audit form.
  if (kind === 'audit' && focusFindingId && auditTab !== 'audits') setAuditTab('audits');
  const { canRead, canEdit, canCreate, isOwnerOf } = useRights();
  const [mineOnly, setMineOnly] = useState(false);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    let list = items.filter((e) => !needle || `${e.code} ${e.title} ${e.description}`.toLowerCase().includes(needle));
    if (mineOnly) list = list.filter((e) => isOwnerOf(kind, e));
    if (kind === 'risk' && heatCell) {
      list = list.filter((e) => {
        const r = e as Risk;
        return `${r.likelihood}-${r.impact}` === heatCell;
      });
    }
    if (kind === 'risk' && riskDept) list = list.filter((e) => (e as Risk).department === riskDept);
    if (kind === 'audit' && auditType) list = list.filter((e) => (e as Audit).auditType === auditType);
    if (kind === 'role') {
      list = list.filter((e) => (!roleType || (e as Role).roleType === roleType) && (!mandatoryOnly || (e as Role).mandatory));
    }
    const sorter = sortCol !== null ? columns[sortCol].sort : undefined;
    if (sorter) list = [...list].sort((a, b) => (sorter(a) < sorter(b) ? -1 : sorter(a) > sorter(b) ? 1 : 0));
    return list;
  }, [items, q, kind, heatCell, sortCol, columns, roleType, mandatoryOnly, auditType, mineOnly, isOwnerOf, riskDept]);

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
        {kind === 'audit' && (
          <div className="seg">
            {(['audits', 'findings', 'program'] as const).map((k) => (
              <button key={k} className={auditTab === k ? 'active' : ''} onClick={() => setAuditTab(k)}>
                {t({ audits: 'Audits', findings: 'Feststellungen', program: 'Auditprogramm' }[k])}
              </button>
            ))}
          </div>
        )}
        {!canEdit(kind) && kind !== 'user' && (
          <label className="checkbox small" title={t('Nur Elemente zeigen, deren Owner Sie sind')}>
            <input type="checkbox" checked={mineOnly} onChange={(e) => setMineOnly(e.target.checked)} /> 🔑 {t('nur meine')}
          </label>
        )}
        {!(kind === 'user' && userTab === 'matrix') && <ExcelTools scope={kind} compact />}
        {canCreate(kind) && !(kind === 'user' && userTab === 'matrix') && !(kind === 'audit' && auditTab !== 'audits') && (
          <button
            className="primary"
            onClick={() => {
              const e = createEntity(
                kind,
                kind === 'user' ? t('Neuer Benutzer') : kind === 'mandate' ? t('Neue Übertragung') : t('Neue(s) {label}', { label: t(def.label) }),
              );
              select(kind, e.id);
            }}
          >
            + {t(def.label)}
          </button>
        )}
      </div>
    </div>
  );

  if (kind === 'audit' && auditTab !== 'audits') {
    return (
      <div className="module-full-wrap">
        <div className="module-full-head">{head}</div>
        {auditTab === 'findings' ? <AuditFindingsList /> : <AuditProgram />}
      </div>
    );
  }

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
        {kind === 'audit' && (
          <div className="filter-bar">
            {['', ...auditTypes].map((at) => (
              <button key={at || 'all'} className={`chip ${auditType === at ? 'active' : ''}`} onClick={() => setAuditType(at)}>
                {at ? t(at) : t('Alle Typen')}
              </button>
            ))}
          </div>
        )}
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
            </div>
            <Heatmap risks={items as Risk[]} selected={heatCell} onSelect={setHeatCell} />
          </div>
        )}
        {kind === 'risk' && (
          <div className="filter-bar">
            <select value={riskDept} onChange={(e) => setRiskDept(e.target.value)} aria-label={t('Bereich / Funktion')}>
              <option value="">{t('Alle Bereiche')}</option>
              {[...new Set((items as Risk[]).map((r) => r.department).filter(Boolean))].sort().map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>
          </div>
        )}
        <input className="search" placeholder={t('Filtern…')} value={q} onChange={(e) => setQ(e.target.value)} />
        <div className="table-wrap">
          <table className="list">
            <thead>
              <tr>
                <th>ID</th>
                <th>{t(kind === 'risk' ? 'Risiko' : 'Bezeichnung')}</th>
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
                  <td>
                    {e.title}
                    {kind !== 'user' && isOwnerOf(kind, e) && <span className="owner-badge">{t('Owner')}</span>}
                  </td>
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
        {selected ? <EntityEditor key={selected.id} kind={kind} entity={selected} /> : <Empty>{t('Eintrag auswählen oder neu anlegen.')}</Empty>}
      </div>
    </div>
  );
}

function EntityEditor({ kind, entity }: { kind: EntityKind; entity: AnyEntity }) {
  const def = modules[kind];
  const update = useStore((s) => s.updateEntity);
  const remove = useStore((s) => s.deleteEntity);
  const select = useUi((s) => s.select);
  const { canDelete, canEditEntity, canEditField, isOwnerOf, isRecorder, isAdmin } = useRights();
  // a changed draft of a released element: the released state can be shown next to it
  const [showReleased, setShowReleased] = useState(false);
  const snapshot = (entity as { released?: Record<string, unknown> }).released;
  const viewingReleased = showReleased && !!snapshot;
  const editable = canEditEntity(kind, entity) && !viewingReleased;
  const [showProfile, setShowProfile] = useState(false);
  const [suggest, setSuggest] = useState(false);
  const sample = useSample();
  const values = (viewingReleased ? { ...entity, ...snapshot } : { ...entity }) as unknown as Record<string, unknown>;
  if (kind === 'risk') values['#score'] = { likelihood: values.likelihood, impact: values.impact };

  return (
    <div className="editor">
      <div className="editor-head" style={{ borderColor: def.color }}>
        <div>
          <div className="muted small">{t(def.label)}</div>
          <h3>
            <span className="mono">{entity.code}</span> {entity.title}
            {(kind === 'role' || kind === 'position') && (
              <button
                className="icon-btn profile-btn"
                title={t(kind === 'role' ? 'Rollenbeschreibung (Zusammenfassung) anzeigen' : 'Stellenbeschreibung (Zusammenfassung) anzeigen')}
                aria-label={t(kind === 'role' ? 'Rollenbeschreibung (Zusammenfassung) anzeigen' : 'Stellenbeschreibung (Zusammenfassung) anzeigen')}
                onClick={() => setShowProfile(true)}
              >
                📄
              </button>
            )}
          </h3>
        </div>
        <div className="row gap">
          {editable && sample && canSuggest(kind) && <button onClick={() => setSuggest(true)}>✨ {t('Mit KI vorschlagen')}</button>}
          {!isAdmin &&
            (editable && !isOwnerOf(kind, entity) && isRecorder(kind, entity) ? (
              <span className="owner-badge big">✎ {t('Von Ihnen erfasst – Entwurf bearbeitbar')}</span>
            ) : editable ? (
              <span className="owner-badge big">🔑 {t('Owner – Sie dürfen bearbeiten')}</span>
            ) : (
              <span className="badge readonly">{t('Nur Lesen')}</span>
            ))}
          {isAdmin && isOwnerOf(kind, entity) && <span className="owner-badge">{t('Owner')}</span>}
          {canDelete(kind, entity) && (
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
      {isWfKind(kind) && (
        <WorkflowBar kind={kind} item={entity as WfItem} showReleased={viewingReleased} onShowReleased={snapshot ? setShowReleased : undefined} />
      )}
      {viewingReleased && (
        <div className="released-note small">
          🔒{' '}
          {t('Freigegebener Stand v{v} – nur Lesen. Die Änderungen des Entwurfs sind noch nicht freigegeben.', {
            v: String(snapshot!.version ?? ''),
          })}
        </div>
      )}
      {kind === 'mandate' && <MandateWorkflowBar mandate={entity as Mandate} />}
      {suggest && <AiFieldSuggest kind={kind} entity={entity} onClose={() => setSuggest(false)} />}
      {kind === 'role' && showProfile && <RoleProfile role={entity as Role} onClose={() => setShowProfile(false)} />}
      {kind === 'position' && showProfile && <PositionProfile position={entity as Position} onClose={() => setShowProfile(false)} />}
      {kind === 'role' ? (
        <RoleInsights role={entity as Role} part="warnings" />
      ) : kind === 'user' ? (
        <UserInsights user={entity as User} />
      ) : kind === 'audit' ? (
        <AuditInsights audit={entity as Audit} />
      ) : kind === 'position' ? (
        <PositionInsights position={entity as Position} part="warnings" />
      ) : kind === 'mandate' ? (
        <MandateInsights mandate={entity as Mandate} />
      ) : kind === 'risk' ? null : (
        <Insights kind={kind} entity={entity} />
      )}
      <fieldset className="plain" disabled={!editable}>
        {def.sections.map((sec) => (
          <fieldset key={sec.title}>
            <legend>{t(sec.title)}</legend>
            <div className="grid">
              {sec.fields
                .filter((f) => !f.showIf || f.showIf(values))
                .map((f) => (
                  <Field
                    key={f.key}
                    def={f}
                    value={values[f.key]}
                    entityId={entity.id}
                    locked={
                      editable &&
                      !canEditField(kind, f.key, entity) &&
                      ((f.key === 'status' && isWfKind(kind)) || (kind === 'mandate' && (f.key === 'status' || f.key === 'acceptedAt'))
                        ? 'wird über den Freigabe-Workflow gesetzt'
                        : true)
                    }
                    onChange={(v) => update(kind, entity.id, { [f.key]: v })}
                  />
                ))}
            </div>
          </fieldset>
        ))}
      </fieldset>
      {/* risks: usage in process steps, mitigating controls and audit findings below the form */}
      {kind === 'risk' && <Insights kind={kind} entity={entity} />}
      {kind === 'role' && <RoleInsights role={entity as Role} part="derived" />}
      {kind === 'position' && <PositionInsights position={entity as Position} part="derived" />}
      <div className="muted small">
        {t('Angelegt')} {new Date(entity.createdAt).toLocaleString(dateLocale())} · {t('zuletzt geändert')}{' '}
        {new Date(entity.updatedAt).toLocaleString(dateLocale())}
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
  const audits = useStore((s) => s.audit);
  const related = allFindings(audits).filter(
    ({ finding: f }) => (kind === 'control' && f.controlIds.includes(entity.id)) || (kind === 'risk' && f.riskIds.includes(entity.id)),
  );
  const openDeviation = related.some(({ finding: f }) => isOpenFinding(f) && (f.type === 'Hauptabweichung' || f.type === 'Nebenabweichung'));

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
      {(kind === 'control' || kind === 'risk') && related.length > 0 && (
        <div className={`insight ${openDeviation && kind === 'control' ? 'warn-box' : ''}`}>
          <div className="insight-title">{t('Audit-Feststellungen ({n})', { n: related.length })}</div>
          {openDeviation && kind === 'control' && <div className="small warn">{t('Offene Abweichung – operative Wirksamkeit überprüfen.')}</div>}
          {related.map(({ audit, finding }) => (
            <FindingLine key={finding.id} audit={audit} finding={finding} />
          ))}
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
