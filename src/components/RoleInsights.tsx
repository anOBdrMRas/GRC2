import { useRef, type ReactNode } from 'react';
import type { Role } from '../types';
import { useStore } from '../store';
import { useUi } from '../ui';
import { modules } from '../schema';
import { continuityGap, elementNames, findUsages, personSodConflicts, residualScore, riskLevel, roleMembers, today } from '../logic';
import { isoLabel } from '../iso';
import { LevelBadge, StatusPill, Tag, download } from './common';

/** Everything the role is responsible for, derived from the other modules (not edited here). */
function useRoleDerived(role: Role) {
  const s = useStore();
  const usages = findUsages(s.processes, 'role', role.id);
  return {
    usages,
    risks: s.risk.filter((r) => r.ownerRoleId === role.id),
    opportunities: s.opportunity.filter((o) => o.ownerRoleId === role.id),
    controlsOwned: s.control.filter((c) => c.ownerRoleId === role.id),
    controlsExecuted: s.control.filter((c) => c.executorRoleId === role.id),
    kpisMeasured: s.kpi.filter((k) => k.ownerRoleId === role.id),
    kpisEvaluated: s.kpi.filter((k) => k.evaluatorRoleId === role.id),
    processesOwned: s.processes.filter((p) => p.ownerRoleId === role.id),
    reportsFrom: s.role.filter((r) => r.reportsToFunctionalRoleId === role.id || r.reportsToDisciplinaryRoleId === role.id),
    deputyFor: s.role.filter((r) => r.deputyRoleId === role.id),
    members: roleMembers(role, s.user),
    roleById: (id: string) => s.role.find((r) => r.id === id),
    userById: (id: string) => s.user.find((u) => u.id === id),
    personConflicts: personSodConflicts(s.role, s.user).filter((c) => c.role.id === role.id || c.other.id === role.id),
    processConflicts: s.processes.flatMap((p) => {
      const names = elementNames(p.xml);
      const isRa = (raci: string) => raci === 'R' || raci === 'A';
      return Object.entries(p.assignments)
        .filter(([el, a]) => el in names && a.roles.some((r) => r.roleId === role.id && isRa(r.raci)))
        .flatMap(([el, a]) =>
          a.roles
            .filter((r) => isRa(r.raci) && (role.incompatibleRoleIds.includes(r.roleId) || s.role.find((x) => x.id === r.roleId)?.incompatibleRoleIds.includes(role.id)))
            .map((r) => ({ p, el, name: names[el], other: s.role.find((x) => x.id === r.roleId) })),
        );
    }),
  };
}

function findings(role: Role, d: ReturnType<typeof useRoleDerived>) {
  const out: string[] = [];
  if (!d.members.some((m) => m.function === 'Inhaber')) out.push('Rolle ist nicht besetzt.');
  const gap = continuityGap(role);
  if (gap) out.push(`${role.criticality}: ${gap}`);
  if (role.appointmentRequired && (!role.appointedAt || !role.appointmentDocument)) out.push('Formale Bestellung erforderlich, aber Datum oder Dokument fehlt.');
  if (role.mandatoryBy.length > 0 && !role.roleOwnerUserId) out.push('Pflichtrolle ohne Rollenverantwortlichen.');
  if (role.nextReview && role.nextReview < today()) out.push(`Review überfällig (fällig ${role.nextReview}).`);
  for (const m of d.members) if (m.user.status !== 'Aktiv') out.push(`${m.user.title} ist ${m.user.status.toLowerCase()}, aber der Rolle zugeordnet.`);
  return out;
}

export function RoleInsights({ role }: { role: Role }) {
  const d = useRoleDerived(role);
  const go = useUi((s) => s.go);
  const openStep = useUi((s) => s.openStep);
  const issues = findings(role, d);

  const list = (title: string, items: { id: string; code: string; title: string }[], kind: keyof typeof modules, extra?: (id: string) => ReactNode) => (
    <div className="derived-row">
      <span className="derived-label">{title}</span>
      <span className="tags">
        {items.length === 0 && <span className="muted small">–</span>}
        {items.map((e) => (
          <Tag key={e.id} color={modules[kind].color} onClick={() => go(kind, e.id)}>
            {e.code} {e.title}
            {extra?.(e.id)}
          </Tag>
        ))}
      </span>
    </div>
  );

  return (
    <div className="insights">
      {(issues.length > 0 || d.personConflicts.length > 0 || d.processConflicts.length > 0) && (
        <div className="insight warn-box">
          <div className="insight-title">⚠ Handlungsbedarf</div>
          {issues.map((i) => (
            <div key={i} className="small">
              {i}
            </div>
          ))}
          {d.personConflicts.map((c, i) => {
            const other = c.role.id === role.id ? c.other : c.role;
            return (
              <div key={'p' + i} className="small link" onClick={() => go('user', c.user.id)}>
                Funktionstrennung: {c.user.title} hat zusätzlich die unvereinbare Rolle „{other.title}“
                {c.systems.length > 0 && ` – überschneidende Schreib-/Freigaberechte in: ${c.systems.join(', ')}`}
              </div>
            );
          })}
          {d.processConflicts.map((c, i) => (
            <div key={'s' + i} className="small link" onClick={() => openStep(c.p.id, c.el)}>
              Funktionstrennung im Prozess: {c.p.code} › {c.name}: R/A gemeinsam mit „{c.other?.title}“
            </div>
          ))}
        </div>
      )}
      <div className="insight">
        <div className="insight-title">Abgeleitete Verantwortung (aus den anderen Modulen)</div>
        <div className="derived">
          <div className="derived-row">
            <span className="derived-label">Prozessschritte</span>
            <span className="tags">
              {d.usages.length === 0 && <span className="muted small">–</span>}
              {d.usages.map((u) => (
                <Tag key={u.process.id + u.elementId} onClick={() => openStep(u.process.id, u.elementId)}>
                  {u.process.code} › {u.elementName}
                  <b className="raci">{u.raci}</b>
                </Tag>
              ))}
            </span>
          </div>
          <div className="derived-row">
            <span className="derived-label">Prozessverantwortung</span>
            <span className="tags">
              {d.processesOwned.length === 0 && <span className="muted small">–</span>}
              {d.processesOwned.map((p) => (
                <Tag key={p.id} onClick={() => go('processes', p.id)}>
                  {p.code} {p.title}
                </Tag>
              ))}
            </span>
          </div>
          {list('Risikoeigner für', d.risks, 'risk', (id) => {
            const r = d.risks.find((x) => x.id === id)!;
            return <LevelBadge level={riskLevel(residualScore(r))} />;
          })}
          {list('Chancen', d.opportunities, 'opportunity')}
          {list('Controls verantwortet', d.controlsOwned, 'control')}
          {list('Controls durchgeführt', d.controlsExecuted, 'control')}
          {list('KPI gemessen', d.kpisMeasured, 'kpi')}
          {list('KPI ausgewertet', d.kpisEvaluated, 'kpi')}
          {list('Unterstellte Rollen', d.reportsFrom, 'role')}
          {list('Vertritt Rollen', d.deputyFor, 'role')}
        </div>
      </div>
    </div>
  );
}

/** Printable role description combining the entered and the derived information. */
export function RoleProfile({ role, onClose }: { role: Role; onClose: () => void }) {
  const d = useRoleDerived(role);
  const area = useRef<HTMLDivElement>(null);
  const framed = window.self !== window.top; // print dialogs are blocked inside embedded frames
  const name = (id: string) => d.roleById(id)?.title ?? '–';
  const user = (id: string) => d.userById(id)?.title ?? '–';
  const items = (xs: { code: string; title: string }[]) => (xs.length ? xs.map((x) => `${x.code} ${x.title}`).join('; ') : '–');

  const exportHtml = () => {
    const html = `<!doctype html><html lang="de"><head><meta charset="utf-8"><title>Rollenbeschreibung ${role.code} ${role.title}</title>
<style>body{font-family:system-ui,sans-serif;max-width:820px;margin:32px auto;color:#1f2933}h1{font-size:22px}h2{font-size:15px;margin-top:22px;border-bottom:1px solid #ccc}table{border-collapse:collapse;width:100%}td,th{border:1px solid #ddd;padding:4px 8px;text-align:left;vertical-align:top;font-size:13px}th{background:#f3f5f8;width:32%}</style></head><body>${area.current?.innerHTML ?? ''}</body></html>`;
    download(`Rollenbeschreibung_${role.code}.html`, html, 'text/html');
  };

  const row = (label: string, value: ReactNode, key: string = label) => (
    <tr key={key}>
      <th>{label}</th>
      <td>{value || '–'}</td>
    </tr>
  );

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal profile-modal" role="dialog" aria-label="Rollenbeschreibung" onClick={(e) => e.stopPropagation()}>
        <div className="row space no-print">
          <div className="row gap">
            {!framed && (
              <button className="primary" onClick={() => window.print()}>
                Drucken
              </button>
            )}
            <button onClick={exportHtml}>Als HTML exportieren</button>
          </div>
          <button className="tag-x" onClick={onClose} title="Schließen">
            ×
          </button>
        </div>
        <div className="print-area" ref={area}>
          <h1>
            Rollenbeschreibung: {role.title} ({role.code})
          </h1>
          <p className="small">
            Version {role.version} · Status: <StatusPill status={role.status} /> · letzte Überprüfung {role.lastReview || '–'} · nächste Überprüfung{' '}
            {role.nextReview || '–'}
          </p>
          <h2>1. Einordnung</h2>
          <table className="profile-table">
            <tbody>
              {row('Rollentyp', role.roleType)}
              {row('Organisationseinheit', role.orgUnit)}
              {row('Pflichtrolle gemäß', role.mandatoryBy.join(', '))}
              {row('Compliance-Funktion / sensible Rolle', role.complianceRelevant ? 'ja' : 'nein')}
              {row('Rollenverantwortlicher', user(role.roleOwnerUserId))}
              {row('Beschreibung', role.description)}
            </tbody>
          </table>
          <h2>2. Stelleninhaber und Vertretung</h2>
          <table className="profile-table">
            <tbody>
              {d.members.map((m) => row(m.function, `${m.user.title}${m.user.jobTitle ? `, ${m.user.jobTitle}` : ''} (seit ${m.since || '–'}${m.function === 'Stellvertretung' ? `, ${m.inducted ? 'eingearbeitet' : 'nicht eingearbeitet'}` : ''})`, m.userId))}
              {d.members.length === 0 && row('Inhaber', 'unbesetzt')}
              {row('Vertretung durch Rolle', role.deputyRoleId ? name(role.deputyRoleId) : '')}
              {row('Kritikalität', role.criticality)}
              {row('Vertretungsregelung', role.continuityNote)}
            </tbody>
          </table>
          <h2>3. Bestellung und Berichtslinien</h2>
          <table className="profile-table">
            <tbody>
              {row('Formale Bestellung', role.appointmentRequired ? `erforderlich – bestellt am ${role.appointedAt || '–'} durch ${user(role.appointedByUserId)}` : 'nicht erforderlich')}
              {role.appointmentRequired && row('Bestellungsdokument', role.appointmentDocument)}
              {row('Berichtet fachlich an', role.reportsToFunctionalRoleId ? name(role.reportsToFunctionalRoleId) : '')}
              {row('Berichtet disziplinarisch an', role.reportsToDisciplinaryRoleId ? name(role.reportsToDisciplinaryRoleId) : '')}
              {row('Direkter Zugang zur Geschäftsleitung', role.directAccessToManagement ? 'ja' : 'nein')}
              {row('Unterstellte Rollen', items(d.reportsFrom))}
            </tbody>
          </table>
          <h2>4. Aufgaben, Befugnisse und Kompetenzen</h2>
          <table className="profile-table">
            <tbody>
              {row('Verantwortlichkeiten', role.responsibilities)}
              {row('Befugnisse', role.authorities)}
              {row('Erforderliche Kompetenzen', role.competencies)}
              {row('Pflichtschulungen', role.trainings)}
            </tbody>
          </table>
          <h2>5. Systemberechtigungen und Funktionstrennung</h2>
          <table className="profile-table">
            <tbody>
              {role.systemPermissions.map((p, i) => row(p.system, `${p.permission} (${p.level})`, `perm-${i}`))}
              {role.systemPermissions.length === 0 && row('Systemberechtigungen', '')}
              {row('Unvereinbare Rollen', role.incompatibleRoleIds.map(name).join(', '))}
            </tbody>
          </table>
          <h2>6. Verantwortung im Managementsystem (abgeleitet)</h2>
          <table className="profile-table">
            <tbody>
              {row('Prozessverantwortung', items(d.processesOwned))}
              {row('Risikoeigner', items(d.risks))}
              {row('Chancen', items(d.opportunities))}
              {row('Controls (verantwortlich)', items(d.controlsOwned))}
              {row('Controls (Durchführung)', items(d.controlsExecuted))}
              {row('KPI (Messung)', items(d.kpisMeasured))}
              {row('KPI (Auswertung)', items(d.kpisEvaluated))}
            </tbody>
          </table>
          <h2>7. Beteiligung an Prozessschritten</h2>
          <table className="profile-table">
            <thead>
              <tr>
                <th>Prozess</th>
                <th>Schritt</th>
                <th>RACI</th>
              </tr>
            </thead>
            <tbody>
              {d.usages.map((u) => (
                <tr key={u.process.id + u.elementId}>
                  <td>
                    {u.process.code} {u.process.title}
                  </td>
                  <td>{u.elementName}</td>
                  <td>{u.raci}</td>
                </tr>
              ))}
              {d.usages.length === 0 && (
                <tr>
                  <td colSpan={3}>–</td>
                </tr>
              )}
            </tbody>
          </table>
          <p className="small muted">Normbezug: {role.isoRefs.map(isoLabel).join(', ') || '–'}</p>
        </div>
      </div>
    </div>
  );
}
