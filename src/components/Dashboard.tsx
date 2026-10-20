import type { EntityKind } from '../types';
import { useStore } from '../store';
import { useUi } from '../ui';
import { modules } from '../schema';
import { activityTypes, allFindings, auditDate, continuityGap, isOpenFinding, isOverdueFinding, kpiStatus, parseElements, personSodConflicts, positionHolders, positionSodConflicts, residualScore, riskLevel, roleHolders, today } from '../logic';
import { Heatmap } from './Heatmap';
import { FindingLine, auditTypeColor } from './AuditViews';
import { findingTypes } from '../schema';
import { t } from '../i18n';
import { LevelBadge, TrafficLight } from './common';

export function Dashboard() {
  const store = useStore();
  const go = useUi((s) => s.go);
  const openStep = useUi((s) => s.openStep);
  const now = today();

  const risksWithoutControl = store.risk.filter((r) => !store.control.some((c) => c.mitigatesRiskIds.includes(r.id)));
  const highResidual = store.risk.filter((r) => residualScore(r) >= 10);
  const weakControls = store.control.filter((c) => c.operatingEffectiveness !== 'Wirksam');
  const overdue = [
    ...store.risk.filter((r) => r.nextReview && r.nextReview < now).map((r) => ({ kind: 'risk' as EntityKind, e: r })),
    ...store.control.filter((c) => c.nextTest && c.nextTest < now).map((c) => ({ kind: 'control' as EntityKind, e: c })),
  ];

  // Process coverage: activities that have a responsible (R) role.
  const steps = store.processes.flatMap((p) =>
    parseElements(p.xml)
      .filter((e) => activityTypes.includes(e.type))
      .map((e) => ({ p, e, a: p.assignments[e.id] })),
  );
  const withRole = steps.filter((s) => s.a?.roles.some((r) => r.raci === 'R'));
  const withoutRole = steps.filter((s) => !s.a?.roles.some((r) => r.raci === 'R' || r.raci === 'A'));
  const coverage = steps.length ? Math.round((withRole.length / steps.length) * 100) : 0;

  const roleIssues = [
    ...store.role
      .filter((r) => r.mandatory && !roleHolders(r, store).some((m) => m.function === 'Inhaber'))
      .map((r) => ({ r, text: t('Pflichtrolle unbesetzt') })),
    ...store.role.filter((r) => continuityGap(r)).map((r) => ({ r, text: t(continuityGap(r)!) })),
    ...personSodConflicts(store).map((c) => ({ r: c.role, text: t('{user}: unvereinbar mit „{role}“', { user: c.user.title, role: c.other.title }) })),
    ...store.role.filter((r) => r.nextReview && r.nextReview < now).map((r) => ({ r, text: t('Review überfällig') })),
  ];

  // Audits
  const in90 = new Date(Date.parse(now) + 90 * 86_400_000).toISOString().slice(0, 10);
  const in180 = new Date(Date.parse(now) + 180 * 86_400_000).toISOString().slice(0, 10);
  const upcomingAudits = store.audit
    .filter((a) => !['Abgeschlossen', 'Abgesagt'].includes(a.status) && auditDate(a) >= now && auditDate(a) <= in90)
    .sort((a, b) => auditDate(a).localeCompare(auditDate(b)));
  const openFindings = allFindings(store.audit).filter(({ finding }) => isOpenFinding(finding));
  const overdueFindings = openFindings.filter(({ finding }) => isOverdueFinding(finding, now));
  const certs = store.audit.filter((a) => a.auditType === 'Zertifizierungsaudit' && a.certificateValidUntil);
  // only the most recent certificate per standard counts
  const expiringCerts = certs.filter(
    (a) =>
      a.certificateValidUntil <= in180 &&
      !certs.some((b) => b !== a && b.certificateValidUntil > a.certificateValidUntil && b.standards.some((s) => a.standards.includes(s))),
  );

  const positionIssues = [
    ...store.position.filter((p) => positionHolders(p, store.user).length === 0).map((p) => ({ p, text: t('Stelle ist nicht besetzt.') })),
    ...store.position.flatMap((p) =>
      positionSodConflicts(p, store.role).map(([a, b]) => ({ p, text: t('unvereinbare Rollen „{a}“ und „{b}“', { a: a.title, b: b.title }) })),
    ),
    ...store.position.filter((p) => p.deputyPositionId && !p.deputyInducted).map((p) => ({ p, text: t('Vertretung ist nicht eingearbeitet.') })),
  ];

  const effectiveness = ['Wirksam', 'Eingeschränkt wirksam', 'Nicht wirksam', 'Nicht geprüft'].map((v) => ({
    v,
    n: store.control.filter((c) => c.operatingEffectiveness === v).length,
  }));

  return (
    <div className="dashboard">
      <h2>{t('Cockpit')}</h2>
      <div className="stat-grid wide">
        <div className="stat clickable" onClick={() => go('processes')}>
          <div className="stat-num">{store.processes.length}</div>
          <div className="stat-label">{t('Prozesse · {n} Aktivitäten', { n: steps.length })}</div>
        </div>
        {(['risk', 'opportunity', 'control', 'role', 'position', 'kpi', 'audit', 'user'] as EntityKind[]).map((k) => (
          <div key={k} className="stat clickable" style={{ borderColor: modules[k].color }} onClick={() => go(k)}>
            <div className="stat-num">{store[k].length}</div>
            <div className="stat-label">{t(modules[k].plural)}</div>
          </div>
        ))}
      </div>

      <div className="dash-grid">
        <div className="card">
          <h3>{t('Risikomatrix brutto')}</h3>
          <Heatmap risks={store.risk} mode="gross" onSelect={() => go('risk')} />
        </div>
        <div className="card">
          <h3>{t('Risikomatrix netto')}</h3>
          <Heatmap risks={store.risk} mode="net" onSelect={() => go('risk')} />
        </div>
        <div className="card">
          <h3>{t('IKS – operative Wirksamkeit')}</h3>
          {effectiveness.map(({ v, n }) => (
            <div key={v} className="bar-row">
              <span className="bar-label">{t(v)}</span>
              <span className="bar">
                <span
                  className={`bar-fill eff-${v.replace(/\s/g, '-')}`}
                  style={{ width: `${store.control.length ? (n / store.control.length) * 100 : 0}%` }}
                />
              </span>
              <span className="bar-num">{n}</span>
            </div>
          ))}
          <h3 style={{ marginTop: 16 }}>{t('Rollenabdeckung der Prozessschritte')}</h3>
          <div className="bar-row">
            <span className="bar-label">{t('mit verantw. Rolle (R)')}</span>
            <span className="bar">
              <span className="bar-fill eff-Wirksam" style={{ width: `${coverage}%` }} />
            </span>
            <span className="bar-num">{coverage}%</span>
          </div>
        </div>
        <div className="card">
          <h3>{t('KPI-Ampel')}</h3>
          {store.kpi.map((k) => {
            const last = k.measurements.at(-1);
            return (
              <div key={k.id} className="kpi-row link" onClick={() => go('kpi', k.id)}>
                <TrafficLight status={kpiStatus(k)} />
                <span className="grow">{k.title}</span>
                <span className="mono small">
                  {last ? `${last.value} ${k.unit}` : '—'} / {t('Ziel')} {k.target}
                </span>
              </div>
            );
          })}
        </div>
        <div className="card">
          <h3>{t('Offene Audit-Feststellungen nach Typ')}</h3>
          {findingTypes
            .filter((ft) => ft !== 'Positive Feststellung')
            .map((ft) => {
              const n = openFindings.filter(({ finding }) => finding.type === ft).length;
              return (
                <div key={ft} className="bar-row">
                  <span className="bar-label">{t(ft)}</span>
                  <span className="bar">
                    <span className={`bar-fill ftype-bar-${ft.replace(/\s/g, '-')}`} style={{ width: `${openFindings.length ? (n / openFindings.length) * 100 : 0}%` }} />
                  </span>
                  <span className="bar-num">{n}</span>
                </div>
              );
            })}
          <div className="small muted" style={{ marginTop: 8 }}>
            {t('{n} offen', { n: openFindings.length })} · {t('{n} überfällig', { n: overdueFindings.length })}
          </div>
        </div>
      </div>

      <h3>{t('Handlungsbedarf')}</h3>
      <div className="dash-grid">
        <Finding title="Risiken ohne Kontrolle" count={risksWithoutControl.length}>
          {risksWithoutControl.map((r) => (
            <div key={r.id} className="link small" onClick={() => go('risk', r.id)}>
              {r.code} {r.title}
            </div>
          ))}
        </Finding>
        <Finding title="Hohe Restrisiken (≥ 10)" count={highResidual.length}>
          {highResidual.map((r) => (
            <div key={r.id} className="link small row gap-s" onClick={() => go('risk', r.id)}>
              <LevelBadge level={riskLevel(residualScore(r))} score={residualScore(r)} /> {r.code} {r.title}
            </div>
          ))}
        </Finding>
        <Finding title="Controls nicht (voll) wirksam / ungeprüft" count={weakControls.length}>
          {weakControls.map((c) => (
            <div key={c.id} className="link small" onClick={() => go('control', c.id)}>
              {c.code} {c.title} – <span className="muted">{t(c.operatingEffectiveness)}</span>
            </div>
          ))}
        </Finding>
        <Finding title="Prozessschritte ohne Verantwortung (R/A)" count={withoutRole.length}>
          {withoutRole.map((s) => (
            <div key={s.p.id + s.e.id} className="link small" onClick={() => openStep(s.p.id, s.e.id)}>
              {s.p.code} › {s.e.name}
            </div>
          ))}
        </Finding>
        <Finding title="Rollen: Besetzung, Vertretung & Funktionstrennung" count={roleIssues.length}>
          {roleIssues.map(({ r, text }, i) => (
            <div key={i} className="link small" onClick={() => go('role', r.id)}>
              {r.code} {r.title} – <span className="muted">{text}</span>
            </div>
          ))}
        </Finding>
        <Finding title="Stellen: Besetzung, Vertretung & Funktionstrennung" count={positionIssues.length}>
          {positionIssues.map(({ p, text }, i) => (
            <div key={i} className="link small" onClick={() => go('position', p.id)}>
              {p.code} {p.title} – <span className="muted">{text}</span>
            </div>
          ))}
        </Finding>
        <Finding title="Anstehende Audits (90 Tage)" count={upcomingAudits.length}>
          {upcomingAudits.map((a) => (
            <div key={a.id} className="link small row gap-s" onClick={() => go('audit', a.id)}>
              <span className="swatch" style={{ background: auditTypeColor[a.auditType] }} />
              {auditDate(a)} · {a.code} {a.title} – <span className="muted">{t(a.status)}</span>
            </div>
          ))}
        </Finding>
        <Finding title="Überfällige Audit-Feststellungen" count={overdueFindings.length}>
          {overdueFindings.map(({ audit, finding }) => (
            <FindingLine key={finding.id} audit={audit} finding={finding} />
          ))}
        </Finding>
        <Finding title="Zertifikate laufen ab (< 180 Tage)" count={expiringCerts.length}>
          {expiringCerts.map((a) => (
            <div key={a.id} className="link small" onClick={() => go('audit', a.id)}>
              {a.certificateValidUntil} · {a.standards.join(', ')} – <span className="muted">{a.code} {a.title}</span>
            </div>
          ))}
        </Finding>
        <Finding title="Überfällige Reviews / Prüfungen" count={overdue.length}>
          {overdue.map(({ kind, e }) => (
            <div key={e.id} className="link small" onClick={() => go(kind, e.id)}>
              {e.code} {e.title}
            </div>
          ))}
        </Finding>
      </div>
    </div>
  );
}

function Finding({ title, count, children }: { title: string; count: number; children: React.ReactNode }) {
  return (
    <div className={`card finding ${count ? 'has' : 'none'}`}>
      <div className="row space">
        <strong>{t(title)}</strong>
        <span className="count">{count}</span>
      </div>
      <div className="finding-list">{count ? children : <span className="ok small">✓ {t('nichts offen')}</span>}</div>
    </div>
  );
}
