import type { EntityKind } from '../types';
import { useStore } from '../store';
import { useUi } from '../ui';
import { modules } from '../schema';
import { activityTypes, continuityGap, kpiStatus, personSodConflicts, parseElements, residualScore, riskLevel, today } from '../logic';
import { Heatmap } from './Heatmap';
import { LevelBadge, TrafficLight } from './common';

export function Dashboard() {
  const store = useStore();
  const go = useUi((s) => s.go);
  const openStep = useUi((s) => s.openStep);
  const t = today();

  const risksWithoutControl = store.risk.filter((r) => !store.control.some((c) => c.mitigatesRiskIds.includes(r.id)));
  const highResidual = store.risk.filter((r) => residualScore(r) >= 10);
  const weakControls = store.control.filter((c) => c.operatingEffectiveness !== 'Wirksam');
  const overdue = [
    ...store.risk.filter((r) => r.nextReview && r.nextReview < t).map((r) => ({ kind: 'risk' as EntityKind, e: r })),
    ...store.control.filter((c) => c.nextTest && c.nextTest < t).map((c) => ({ kind: 'control' as EntityKind, e: c })),
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
      .filter((r) => r.mandatoryBy.length > 0 && !r.members.some((m) => m.function === 'Inhaber'))
      .map((r) => ({ r, text: 'Pflichtrolle unbesetzt' })),
    ...store.role.filter((r) => continuityGap(r)).map((r) => ({ r, text: continuityGap(r)! })),
    ...personSodConflicts(store.role, store.user).map((c) => ({ r: c.role, text: `${c.user.title}: unvereinbar mit „${c.other.title}“` })),
    ...store.role.filter((r) => r.nextReview && r.nextReview < t).map((r) => ({ r, text: 'Review überfällig' })),
  ];

  const effectiveness = ['Wirksam', 'Eingeschränkt wirksam', 'Nicht wirksam', 'Nicht geprüft'].map((v) => ({
    v,
    n: store.control.filter((c) => c.operatingEffectiveness === v).length,
  }));

  return (
    <div className="dashboard">
      <h2>Cockpit</h2>
      <div className="stat-grid wide">
        <div className="stat clickable" onClick={() => go('processes')}>
          <div className="stat-num">{store.processes.length}</div>
          <div className="stat-label">Prozesse · {steps.length} Aktivitäten</div>
        </div>
        {(['risk', 'opportunity', 'control', 'role', 'kpi', 'user'] as EntityKind[]).map((k) => (
          <div key={k} className="stat clickable" style={{ borderColor: modules[k].color }} onClick={() => go(k)}>
            <div className="stat-num">{store[k].length}</div>
            <div className="stat-label">{modules[k].plural}</div>
          </div>
        ))}
      </div>

      <div className="dash-grid">
        <div className="card">
          <h3>Risikomatrix brutto</h3>
          <Heatmap risks={store.risk} mode="gross" onSelect={() => go('risk')} />
        </div>
        <div className="card">
          <h3>Risikomatrix netto</h3>
          <Heatmap risks={store.risk} mode="net" onSelect={() => go('risk')} />
        </div>
        <div className="card">
          <h3>IKS – operative Wirksamkeit</h3>
          {effectiveness.map(({ v, n }) => (
            <div key={v} className="bar-row">
              <span className="bar-label">{v}</span>
              <span className="bar">
                <span
                  className={`bar-fill eff-${v.replace(/\s/g, '-')}`}
                  style={{ width: `${store.control.length ? (n / store.control.length) * 100 : 0}%` }}
                />
              </span>
              <span className="bar-num">{n}</span>
            </div>
          ))}
          <h3 style={{ marginTop: 16 }}>Rollenabdeckung der Prozessschritte</h3>
          <div className="bar-row">
            <span className="bar-label">mit verantw. Rolle (R)</span>
            <span className="bar">
              <span className="bar-fill eff-Wirksam" style={{ width: `${coverage}%` }} />
            </span>
            <span className="bar-num">{coverage}%</span>
          </div>
        </div>
        <div className="card">
          <h3>KPI-Ampel</h3>
          {store.kpi.map((k) => {
            const last = k.measurements.at(-1);
            return (
              <div key={k.id} className="kpi-row link" onClick={() => go('kpi', k.id)}>
                <TrafficLight status={kpiStatus(k)} />
                <span className="grow">{k.title}</span>
                <span className="mono small">
                  {last ? `${last.value} ${k.unit}` : '—'} / Ziel {k.target}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      <h3>Handlungsbedarf</h3>
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
              {c.code} {c.title} – <span className="muted">{c.operatingEffectiveness}</span>
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
        <strong>{title}</strong>
        <span className="count">{count}</span>
      </div>
      <div className="finding-list">{count ? children : <span className="ok small">✓ nichts offen</span>}</div>
    </div>
  );
}
