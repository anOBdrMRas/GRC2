import type { EntityKind } from '../types';
import { useStore } from '../store';
import { useUi } from '../ui';
import { modules } from '../schema';
import { activityTypes, allFindings, isHighRisk, isOpenFinding, isOverdueFinding, kpiStatus, parseElements, scoreOf, today } from '../logic';
import { Heatmap } from './Heatmap';
import { findingTypes } from '../schema';
import { t } from '../i18n';
import { useRights } from '../useRights';
import { TrafficLight } from './common';

/** Figures shown in the I&A cockpit (counts and charts). */
function useCockpit() {
  const store = useStore();
  const go = useUi((s) => s.go);
  const now = today();
  // Process coverage: activities that have a responsible (R) role.
  const steps = store.processes.flatMap((p) =>
    parseElements(p.xml)
      .filter((e) => activityTypes.includes(e.type))
      .map((e) => ({ p, e, a: p.assignments[e.id] })),
  );
  const withRole = steps.filter((s) => s.a?.roles.some((r) => r.raci === 'R'));
  const coverage = steps.length ? Math.round((withRole.length / steps.length) * 100) : 0;
  const openFindings = allFindings(store.audit).filter(({ finding }) => isOpenFinding(finding));
  const overdueFindings = openFindings.filter(({ finding }) => isOverdueFinding(finding, now));
  const effectiveness = ['Wirksam', 'Eingeschränkt wirksam', 'Nicht wirksam', 'Nicht geprüft'].map((v) => ({
    v,
    n: store.control.filter((c) => c.operatingEffectiveness === v).length,
  }));
  return { store, go, steps, coverage, openFindings, overdueFindings, effectiveness };
}

/** Counts per module (clickable). */
export function CockpitStats() {
  const { store, go, steps } = useCockpit();
  const { canRead } = useRights();
  return (
    <>
      <div className="stat-grid wide">
        <div className="stat clickable" onClick={() => go('processes')}>
          <div className="stat-num">{store.processes.length}</div>
          <div className="stat-label">{t('Prozesse · {n} Aktivitäten', { n: steps.length })}</div>
        </div>
        {(['risk', 'opportunity', 'control', 'role', 'position', 'mandate', 'kpi', 'audit', 'user'] as EntityKind[])
          .filter((k) => canRead(k))
          .map((k) => (
            <div key={k} className="stat clickable" style={{ borderColor: modules[k].color }} onClick={() => go(k)}>
              <div className="stat-num">{store[k].length}</div>
              <div className="stat-label">{t(modules[k].plural)}</div>
            </div>
          ))}
      </div>
    </>
  );
}

/** Risk matrices, ICS effectiveness, role coverage, KPI traffic lights, audit findings. */
export function CockpitCharts() {
  const { store, go, coverage, effectiveness, openFindings, overdueFindings } = useCockpit();
  const byDepartment = [...new Set(store.risk.map((r) => r.department || t('ohne Bereich')))]
    .map((dept) => {
      const rs = store.risk.filter((r) => (r.department || t('ohne Bereich')) === dept);
      return { dept, n: rs.length, high: rs.filter((r) => isHighRisk(scoreOf(r))).length };
    })
    .sort((a, b) => b.high - a.high || b.n - a.n);
  const maxDept = Math.max(1, ...byDepartment.map((d) => d.n));
  return (
    <>
      <div className="dash-grid">
        <div className="card">
          <h3>{t('Risikomatrix')}</h3>
          <Heatmap risks={store.risk} onSelect={() => go('risk')} />
        </div>
        <div className="card">
          <h3>{t('Risiken je Bereich')}</h3>
          {byDepartment.length === 0 && <div className="muted small">{t('Keine Risiken erfasst.')}</div>}
          {byDepartment.map(({ dept, n, high }) => (
            <div key={dept} className="bar-row" title={t('{n} davon höhere Risiken (> 8)', { n: high })}>
              <span className="bar-label">{dept}</span>
              <span className="bar">
                <span className="bar-fill dept-high" style={{ width: `${(high / maxDept) * 100}%` }} />
                <span className="bar-fill dept-other" style={{ width: `${((n - high) / maxDept) * 100}%` }} />
              </span>
              <span className="bar-num">{n}</span>
            </div>
          ))}
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
                    <span
                      className={`bar-fill ftype-bar-${ft.replace(/\s/g, '-')}`}
                      style={{ width: `${openFindings.length ? (n / openFindings.length) * 100 : 0}%` }}
                    />
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
    </>
  );
}
