import { useRef, useState, type ReactNode } from 'react';
import type { Position, PositionRole, Role } from '../types';
import { useStore } from '../store';
import { useUi } from '../ui';
import { modules } from '../schema';
import { findUsages, orgUnits, positionHolders, positionSodConflicts, roleHolders, subordinatePositions, today } from '../logic';
import { isoLabel } from '../iso';
import { t } from '../i18n';
import { Empty, Picker, StatusPill, Tag, download } from './common';

const orgUnitColor: Record<string, string> = {
  Generic: '#495057',
  Technology: '#1971c2',
  Operation: '#e8590c',
  Marketing: '#d6336c',
  Sales: '#2f9e44',
  'Finance and Admin': '#7048e8',
  'Business Enablement': '#0c8599',
  Other: '#868e96',
};

// ---- fields ------------------------------------------------------------------

/** Roles of a position: repeatable rows with role dropdown and comment. */
export function PositionRoles({ value, onChange }: { value: PositionRole[]; onChange: (v: PositionRole[]) => void }) {
  const roles = useStore((s) => s.role);
  const go = useUi((s) => s.go);
  const [pending, setPending] = useState(0);
  const options = (current: string) =>
    roles
      .filter((r) => r.id === current || !value.some((v) => v.roleId === r.id))
      .map((r) => (
        <option key={r.id} value={r.id}>
          {r.code} {r.title}
        </option>
      ));
  const set = (i: number, patch: Partial<PositionRole>) => onChange(value.map((v, j) => (j === i ? { ...v, ...patch } : v)));

  return (
    <div className="role-list">
      {value.map((v, i) => (
        <div className="role-row" key={v.roleId}>
          <select value={v.roleId} onChange={(e) => set(i, { roleId: e.target.value })}>
            {options(v.roleId)}
          </select>
          <input className="grow" placeholder={t('Kommentar')} value={v.comment} onChange={(e) => set(i, { comment: e.target.value })} />
          <button type="button" className="link-btn small" title={t('Im Modul öffnen')} onClick={() => go('role', v.roleId)}>
            →
          </button>
          <button type="button" className="tag-x" title={t('Entfernen')} onClick={() => onChange(value.filter((_, j) => j !== i))}>
            ×
          </button>
        </div>
      ))}
      {Array.from({ length: pending }, (_, i) => (
        <div className="role-row" key={`pending-${i}`}>
          <select
            value=""
            onChange={(e) => {
              if (!e.target.value) return;
              setPending((n) => n - 1);
              onChange([...value, { roleId: e.target.value, comment: '' }]);
            }}
          >
            <option value="">{t('— Rolle wählen —')}</option>
            {options('')}
          </select>
          <button type="button" className="tag-x" title={t('Entfernen')} onClick={() => setPending((n) => n - 1)}>
            ×
          </button>
        </div>
      ))}
      <button type="button" className="add-row" disabled={value.length + pending >= roles.length} onClick={() => setPending((n) => n + 1)}>
        + {t('Rolle zuordnen')}
      </button>
    </div>
  );
}

/** Persons on a position. The assignment is stored on the user (one position per person). */
export function PositionHolders({ positionId }: { positionId: string }) {
  const users = useStore((s) => s.user);
  const positions = useStore((s) => s.position);
  const update = useStore((s) => s.updateEntity);
  const go = useUi((s) => s.go);
  const holders = users.filter((u) => u.positionId === positionId);
  return (
    <div>
      {holders.length > 0 && (
        <table className="mini wide-table">
          <thead>
            <tr>
              <th>{t('Person')}</th>
              <th>{t('Stellenbezeichnung')}</th>
              <th>{t('seit')}</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {holders.map((u) => (
              <tr key={u.id}>
                <td>
                  <span className="link" onClick={() => go('user', u.id)}>
                    {u.title}
                  </span>
                  {u.status !== 'Aktiv' && <span className="warn small"> ({t(u.status)})</span>}
                </td>
                <td className="small">{u.jobTitle}</td>
                <td>
                  <input type="date" value={u.positionSince} onChange={(e) => update('user', u.id, { positionSince: e.target.value })} />
                </td>
                <td>
                  <button type="button" className="tag-x" title={t('Entfernen')} onClick={() => update('user', u.id, { positionId: '', positionSince: '' })}>
                    ×
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <Picker
        options={users.map((u) => {
          const current = positions.find((p) => p.id === u.positionId);
          return { id: u.id, label: u.title, sub: current ? t('derzeit: {position}', { position: current.title }) : u.jobTitle };
        })}
        exclude={holders.map((u) => u.id)}
        placeholder={t('Person zuweisen…')}
        onPick={(id) => update('user', id, { positionId, positionSince: today() })}
      />
    </div>
  );
}

/** Read-only relation list in the role form: positions holding the role and their persons. */
export function RoleRelations({ roleId }: { roleId: string }) {
  const { role, position, user } = useStore();
  const go = useUi((s) => s.go);
  const r = role.find((x) => x.id === roleId);
  if (!r) return null;
  const withRole = position.filter((p) => p.roles.some((pr) => pr.roleId === roleId));
  const direct = roleHolders(r, { position, user }).filter((h) => h.via === 'direkt');
  return (
    <div>
      {withRole.length === 0 && <div className="muted small">{t('Keiner Stelle zugeordnet.')}</div>}
      {withRole.length > 0 && (
        <table className="mini wide-table relation-table">
          <thead>
            <tr>
              <th>{t('Stelle')}</th>
              <th>{t('Kommentar')}</th>
              <th>{t('Inhaber')}</th>
            </tr>
          </thead>
          <tbody>
            {withRole.map((p) => (
              <tr key={p.id}>
                <td>
                  <span className="link" onClick={() => go('position', p.id)}>
                    <span className="mono">{p.code}</span> {p.title}
                  </span>
                </td>
                <td className="small">{p.roles.find((x) => x.roleId === roleId)?.comment || '–'}</td>
                <td className="small">
                  {positionHolders(p, user)
                    .map((u) => u.title)
                    .join(', ') || <span className="warn">{t('unbesetzt')}</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {direct.length > 0 && (
        <div className="small muted" style={{ marginTop: 4 }}>
          {t('Zusätzlich direkt zugeordnet')}: {direct.map((h) => `${h.user.title} (${t(h.function)})`).join(', ')}
        </div>
      )}
    </div>
  );
}

// ---- warnings & derived info for a position --------------------------------------

function usePositionDerived(position: Position) {
  const s = useStore();
  const roles = position.roles.map((pr) => ({ pr, role: s.role.find((r) => r.id === pr.roleId) })).filter((x): x is { pr: PositionRole; role: Role } => !!x.role);
  return {
    roles,
    holders: positionHolders(position, s.user),
    subDisciplinary: subordinatePositions(position, s.position, 'disciplinary'),
    subFunctional: subordinatePositions(position, s.position, 'functional'),
    deputyFor: s.position.filter((p) => p.deputyPositionId === position.id),
    sod: positionSodConflicts(position, s.role),
    steps: roles.flatMap(({ role }) => findUsages(s.processes, 'role', role.id).map((u) => ({ ...u, role }))),
    processesOwned: s.processes.filter((p) => roles.some(({ role }) => role.id === p.ownerRoleId)),
    name: (id: string) => (id === 'n/a' ? 'n/a' : (s.position.find((p) => p.id === id)?.title ?? '–')),
  };
}

export function PositionInsights({ position, part }: { position: Position; part: 'warnings' | 'derived' }) {
  const d = usePositionDerived(position);
  const go = useUi((s) => s.go);
  const openStep = useUi((s) => s.openStep);

  if (part === 'warnings') {
    const issues: string[] = [];
    if (d.holders.length === 0) issues.push(t('Stelle ist nicht besetzt.'));
    if (d.holders.length > position.headcount) issues.push(t('Mehr Inhaber ({n}) als Planstellen ({m}).', { n: d.holders.length, m: position.headcount }));
    for (const [a, b] of d.sod) issues.push(t('Funktionstrennung: Stelle bündelt die unvereinbaren Rollen „{a}“ und „{b}“.', { a: a.title, b: b.title }));
    for (const u of d.holders) if (u.status !== 'Aktiv') issues.push(t('{user} ist {status}, aber der Stelle zugeordnet.', { user: u.title, status: t(u.status).toLowerCase() }));
    if (position.deputyPositionId && !position.deputyInducted) issues.push(t('Vertretung ist nicht eingearbeitet.'));
    if (!position.reportsToDisciplinaryId) issues.push(t('Keine disziplinarische Berichtslinie festgelegt.'));
    if (position.nextReview && position.nextReview < today()) issues.push(t('Review überfällig (fällig {date}).', { date: position.nextReview }));
    if (issues.length === 0) return null;
    return (
      <div className="insights">
        <div className="insight warn-box">
          <div className="insight-title">⚠ {t('Handlungsbedarf')}</div>
          {issues.map((i) => (
            <div key={i} className="small">
              {i}
            </div>
          ))}
        </div>
      </div>
    );
  }

  const tags = (items: Position[]) =>
    items.length === 0 ? (
      <span className="muted small">–</span>
    ) : (
      items.map((p) => (
        <Tag key={p.id} color={modules.position.color} onClick={() => go('position', p.id)}>
          {p.code} {p.title}
        </Tag>
      ))
    );

  return (
    <div className="insights derived-section">
      <div className="insight">
        <div className="insight-title">{t('Abgeleitete Informationen (nur Anzeige)')}</div>
        <div className="derived">
          <div className="derived-row">
            <span className="derived-label">{t('Disziplinarisch unterstellt')}</span>
            <span className="tags">{tags(d.subDisciplinary)}</span>
          </div>
          <div className="derived-row">
            <span className="derived-label">{t('Fachlich unterstellt')}</span>
            <span className="tags">{tags(d.subFunctional)}</span>
          </div>
          <div className="derived-row">
            <span className="derived-label">{t('Vertritt Stellen')}</span>
            <span className="tags">{tags(d.deputyFor)}</span>
          </div>
          <div className="derived-row">
            <span className="derived-label">{t('Prozessverantwortung')}</span>
            <span className="tags">
              {d.processesOwned.length === 0 && <span className="muted small">–</span>}
              {d.processesOwned.map((p) => (
                <Tag key={p.id} onClick={() => go('processes', p.id)}>
                  {p.code} {p.title}
                </Tag>
              ))}
            </span>
          </div>
          <div className="derived-row">
            <span className="derived-label">{t('Prozessschritte (über Rollen)')}</span>
            <span className="tags">
              {d.steps.length === 0 && <span className="muted small">–</span>}
              {d.steps.map((u) => (
                <Tag key={u.role.id + u.process.id + u.elementId} onClick={() => openStep(u.process.id, u.elementId)}>
                  {u.process.code} › {u.elementName}
                  <b className="raci">{u.raci}</b>
                </Tag>
              ))}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

/** Printable job description (Stellenbeschreibung). */
export function PositionProfile({ position: p, onClose }: { position: Position; onClose: () => void }) {
  const d = usePositionDerived(p);
  const area = useRef<HTMLDivElement>(null);
  const framed = window.self !== window.top;
  // dynamic labels (role names) are passed with translate = false
  const row = (label: string, value: ReactNode, key: string = label, translate = true) => (
    <tr key={key}>
      <th>{translate ? t(label) : label}</th>
      <td>{value || '–'}</td>
    </tr>
  );
  const exportHtml = () => {
    const html = `<!doctype html><html lang="de"><head><meta charset="utf-8"><title>${t('Stellenbeschreibung')} ${p.code} ${p.title}</title>
<style>body{font-family:system-ui,sans-serif;max-width:820px;margin:32px auto;color:#1f2933}h1{font-size:22px}h2{font-size:15px;margin-top:22px;border-bottom:1px solid #ccc}table{border-collapse:collapse;width:100%}td,th{border:1px solid #ddd;padding:4px 8px;text-align:left;vertical-align:top;font-size:13px;white-space:pre-wrap}th{background:#f3f5f8;width:32%}</style></head><body>${area.current?.innerHTML ?? ''}</body></html>`;
    download(`${t('Stellenbeschreibung')}_${p.code}.html`, html, 'text/html');
  };
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal profile-modal" role="dialog" aria-label={t('Stellenbeschreibung')} onClick={(e) => e.stopPropagation()}>
        <div className="row space no-print">
          <div className="row gap">
            {!framed && (
              <button className="primary" onClick={() => window.print()}>
                {t('Drucken')}
              </button>
            )}
            <button onClick={exportHtml}>{t('Als HTML exportieren')}</button>
          </div>
          <button className="tag-x" onClick={onClose} title={t('Schließen')}>
            ×
          </button>
        </div>
        <div className="print-area" ref={area}>
          <h1>
            {t('Stellenbeschreibung')}: {p.title} ({p.code})
          </h1>
          <p className="small">
            {t('Version')} {p.version} · {t('Status')}: <StatusPill status={p.status} /> · {t('nächste Überprüfung')} {p.nextReview || '–'}
          </p>
          <h2>1. {t('Einordnung')}</h2>
          <table className="profile-table">
            <tbody>
              {row('Organisationseinheit', p.orgUnit)}
              {row('Führungsstelle', p.isManager ? t('ja') : t('nein'))}
              {row('Planstellen (Anzahl)', String(p.headcount))}
              {row('Standort', p.location)}
              {row('Berichtet disziplinarisch an', p.reportsToDisciplinaryId ? d.name(p.reportsToDisciplinaryId) : '')}
              {row('Berichtet fachlich an', p.reportsToFunctionalId ? d.name(p.reportsToFunctionalId) : '')}
              {row('Disziplinarisch unterstellt', d.subDisciplinary.map((x) => x.title).join(', '))}
              {row('Vertretung durch Stelle', p.deputyPositionId ? `${d.name(p.deputyPositionId)} (${p.deputyInducted ? t('eingearbeitet') : t('nicht eingearbeitet')})` : '')}
              {row('Stelleninhaber', d.holders.map((u) => u.title).join(', ') || t('unbesetzt'))}
            </tbody>
          </table>
          <h2>2. {t('Stellenbeschreibung')}</h2>
          <table className="profile-table">
            <tbody>
              {row('Ziel / Zweck der Stelle', p.purpose)}
              {row('Hauptaufgaben', p.tasks)}
              {row('Befugnisse / Vollmachten', p.authorities)}
            </tbody>
          </table>
          <h2>3. {t('Anforderungen & Kompetenz')}</h2>
          <table className="profile-table">
            <tbody>
              {row('Ausbildung / Qualifikation', p.qualification)}
              {row('Berufserfahrung', p.experience)}
              {row('Fachliche & persönliche Kompetenzen', p.competencies)}
              {row('Pflichtschulungen / Awareness', p.trainings)}
              {row('Sicherheitsüberprüfung erforderlich', p.screeningRequired ? t('ja') : t('nein'))}
              {row('Vertraulichkeitsvereinbarung erforderlich', p.ndaRequired ? t('ja') : t('nein'))}
            </tbody>
          </table>
          <h2>4. {t('Rollen im Managementsystem')}</h2>
          <table className="profile-table">
            <tbody>
              {d.roles.map(({ pr, role }) => row(`${role.code} ${role.title}`, [pr.comment, role.responsibilities].filter(Boolean).join(' – '), role.id, false))}
              {d.roles.length === 0 && row('Rollen', '')}
            </tbody>
          </table>
          <h2>5. {t('Beteiligung an Prozessschritten (abgeleitet)')}</h2>
          <table className="profile-table">
            <thead>
              <tr>
                <th>{t('Prozess')}</th>
                <th>{t('Schritt')}</th>
                <th>{t('Rolle')}</th>
                <th>RACI</th>
              </tr>
            </thead>
            <tbody>
              {d.steps.map((u) => (
                <tr key={u.role.id + u.process.id + u.elementId}>
                  <td>
                    {u.process.code} {u.process.title}
                  </td>
                  <td>{u.elementName}</td>
                  <td>{u.role.title}</td>
                  <td>{u.raci}</td>
                </tr>
              ))}
              {d.steps.length === 0 && (
                <tr>
                  <td colSpan={4}>–</td>
                </tr>
              )}
            </tbody>
          </table>
          <p className="small muted">
            {t('Normbezug')}: {p.isoRefs.map(isoLabel).join(', ') || '–'}
          </p>
        </div>
      </div>
    </div>
  );
}

// ---- org chart -----------------------------------------------------------------

type ChartView = 'disciplinary' | 'functional' | 'units' | 'roles';

export function OrgChart() {
  const { position, role } = useStore();
  const [view, setView] = useState<ChartView>('disciplinary');
  const [showRoles, setShowRoles] = useState(true);

  return (
    <div className="module-full orgchart">
      <div className="module-head">
        <h2 style={{ color: modules.position.color }}>{t('Organigramm')}</h2>
        <div className="row gap">
          {(view === 'disciplinary' || view === 'functional') && (
            <label className="checkbox small">
              <input type="checkbox" checked={showRoles} onChange={(e) => setShowRoles(e.target.checked)} /> {t('Rollen anzeigen')}
            </label>
          )}
          <div className="seg">
            {(['disciplinary', 'functional', 'units', 'roles'] as ChartView[]).map((v) => (
              <button key={v} className={view === v ? 'active' : ''} onClick={() => setView(v)}>
                {t({ disciplinary: 'Disziplinarisch', functional: 'Fachlich', units: 'Funktionen', roles: 'Rollenzuordnung' }[v])}
              </button>
            ))}
          </div>
        </div>
      </div>
      {position.length === 0 && <Empty>{t('Noch keine Stellen angelegt.')}</Empty>}
      {(view === 'disciplinary' || view === 'functional') && <HierarchyTree line={view} showRoles={showRoles} />}
      {view === 'units' && (
        <div className="unit-columns">
          {orgUnits
            .filter((u) => position.some((p) => p.orgUnit === u))
            .map((u) => (
              <div key={u} className="unit-column" style={{ borderTopColor: orgUnitColor[u] }}>
                <div className="unit-title">{t(u)}</div>
                {position
                  .filter((p) => p.orgUnit === u)
                  .map((p) => (
                    <PositionCard key={p.id} position={p} showRoles />
                  ))}
              </div>
            ))}
        </div>
      )}
      {view === 'roles' && <RoleMatrix positions={position} roles={role} />}
    </div>
  );
}

function HierarchyTree({ line, showRoles }: { line: 'disciplinary' | 'functional'; showRoles: boolean }) {
  const positions = useStore((s) => s.position);
  const parentOf = (p: Position) => (line === 'disciplinary' ? p.reportsToDisciplinaryId : p.reportsToFunctionalId);
  const ids = new Set(positions.map((p) => p.id));
  // roots: no (valid) parent; 'n/a' and unknown parents are roots as well
  const roots = positions.filter((p) => !ids.has(parentOf(p)));
  const children = (id: string) => positions.filter((p) => parentOf(p) === id);

  const render = (p: Position, seen: Set<string>): ReactNode => {
    if (seen.has(p.id)) return null; // guards against cycles
    const next = new Set(seen).add(p.id);
    const kids = children(p.id);
    return (
      <li key={p.id}>
        <PositionCard position={p} showRoles={showRoles} />
        {kids.length > 0 && <ul>{kids.map((k) => render(k, next))}</ul>}
      </li>
    );
  };

  const separate = roots.filter((r) => children(r.id).length === 0 && parentOf(r) === 'n/a' && roots.length > 1);
  const main = roots.filter((r) => !separate.includes(r));
  return (
    <div className="tree-wrap">
      <ul className="tree">{main.map((r) => render(r, new Set()))}</ul>
      {separate.length > 0 && (
        <div className="tree-separate">
          <div className="unit-title">{line === 'functional' ? t('Ohne fachliche Berichtslinie (n/a)') : t('Ohne Berichtslinie (n/a)')}</div>
          <div className="row gap wrap">
            {separate.map((p) => (
              <PositionCard key={p.id} position={p} showRoles={showRoles} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function PositionCard({ position: p, showRoles }: { position: Position; showRoles: boolean }) {
  const { user, role } = useStore();
  const go = useUi((s) => s.go);
  const holders = positionHolders(p, user);
  const sod = positionSodConflicts(p, role).length > 0;
  return (
    <div className={`pos-card ${p.isManager ? 'manager' : ''}`} style={{ borderTopColor: orgUnitColor[p.orgUnit] ?? '#868e96' }} onClick={() => go('position', p.id)}>
      <div className="pos-title">{p.title}</div>
      <div className="pos-meta">
        <span className="mono">{p.code}</span> · {t(p.orgUnit)}
        {p.headcount > 1 && ` · ${holders.length}/${p.headcount}`}
      </div>
      <div className={`pos-holders ${holders.length === 0 ? 'warn' : ''}`}>{holders.map((u) => u.title).join(', ') || t('unbesetzt')}</div>
      {showRoles && p.roles.length > 0 && (
        <div className="pos-roles">
          {p.roles.map((pr) => {
            const r = role.find((x) => x.id === pr.roleId);
            return r ? (
              <span key={pr.roleId} className="pos-role" title={pr.comment || r.title}>
                {r.title}
              </span>
            ) : null;
          })}
        </div>
      )}
      {sod && <div className="pos-warn">⚠ {t('Funktionstrennung')}</div>}
    </div>
  );
}

function RoleMatrix({ positions, roles }: { positions: Position[]; roles: Role[] }) {
  const go = useUi((s) => s.go);
  const used = roles.filter((r) => positions.some((p) => p.roles.some((pr) => pr.roleId === r.id)));
  return (
    <div className="table-wrap">
      <table className="list role-matrix">
        <thead>
          <tr>
            <th>{t('Stelle')}</th>
            {used.map((r) => (
              <th key={r.id} className="vertical" title={r.title}>
                <span>{r.title}</span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {positions.map((p) => (
            <tr key={p.id} onClick={() => go('position', p.id)}>
              <td>
                <span className="mono">{p.code}</span> {p.title}
              </td>
              {used.map((r) => {
                const pr = p.roles.find((x) => x.roleId === r.id);
                return (
                  <td key={r.id} className="matrix-cell" title={pr?.comment || undefined}>
                    {pr ? (pr.comment ? '●*' : '●') : ''}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
      <p className="muted small">{t('● Rolle zugeordnet · * mit Kommentar (Tooltip)')}</p>
    </div>
  );
}
