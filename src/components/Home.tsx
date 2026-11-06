import type { ReactNode } from 'react';
import type { EntityKind, ProcessModel } from '../types';
import { useStore } from '../store';
import { useUi } from '../ui';
import { modules } from '../schema';
import { positionHolders } from '../logic';
import { assignmentsOf, ownershipOf, type MyStep } from '../ownership';
import { useRights } from '../useRights';
import { systemRoleById } from '../permissions';
import { ProcessLandscape } from './ProcessLandscape';
import { AssistantChat } from './AssistantChat';
import { MandateStatePill } from './MandateViews';
import { FindingLine } from './AuditViews';
import { Tag } from './common';
import { t } from '../i18n';

function Card({ title, count, children, tone }: { title: string; count?: number; children: ReactNode; tone?: 'warn' }) {
  return (
    <div className={`home-card ${tone ?? ''}`}>
      <div className="home-card-head">
        <b>{t(title)}</b>
        {count !== undefined && <span className="count">{count}</span>}
      </div>
      {children}
    </div>
  );
}

/** Process steps grouped by process. */
function StepList({ steps }: { steps: MyStep[] }) {
  const openStep = useUi((s) => s.openStep);
  const go = useUi((s) => s.go);
  const byProcess = new Map<string, { process: ProcessModel; steps: MyStep[] }>();
  for (const s of steps) {
    const g = byProcess.get(s.process.id) ?? { process: s.process, steps: [] };
    g.steps.push(s);
    byProcess.set(s.process.id, g);
  }
  if (!steps.length) return <div className="muted small">{t('Keinen Prozessschritten zugeordnet.')}</div>;
  return (
    <div className="home-steps">
      {[...byProcess.values()].map(({ process, steps }) => (
        <div key={process.id} className="home-step-group">
          <div className="link small" onClick={() => go('processes', process.id)}>
            <b>{process.title}</b> <span className="muted">· {process.area ?? t(process.category)}</span>
          </div>
          {steps.map((s, i) => (
            <div key={s.elementId + i} className="home-step link" onClick={() => openStep(process.id, s.elementId)}>
              <b className={`raci raci-${s.raci}`}>{s.raci}</b>
              <span className="grow">{s.name}</span>
              <span className="small muted">{s.role.title}</span>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

const raciHint = 'R = durchführend · A = verantwortlich · C = konsultiert · I = informiert';

export function Home() {
  const d = useStore();
  const go = useUi((s) => s.go);
  const setDraftOpen = useUi((s) => s.setDraftOpen);
  const { user, isAdmin } = useRights();
  if (!user) return null;
  const mine = assignmentsOf(user, d);
  const own = ownershipOf(user.id, d);
  const supervisor = mine.position && d.position.find((p) => p.id === mine.position!.reportsToDisciplinaryId);
  const supervisorNames = supervisor
    ? positionHolders(supervisor, d.user)
        .map((u) => u.title)
        .join(', ')
    : '';

  const tags = (kind: EntityKind, items: { id: string; code: string; title: string }[]) => (
    <div className="tags">
      {items.map((e) => (
        <Tag key={e.id} color={modules[kind].color} onClick={() => go(kind, e.id)}>
          {e.code} {e.title}
        </Tag>
      ))}
    </div>
  );

  const ownCards: [string, EntityKind | 'processes', { id: string; code: string; title: string }[], string][] = [
    ['Prozesse', 'processes', own.processes, 'als Prozessverantwortliche/r'],
    ['Stellen (Ihr Team)', 'position', own.position, 'als Vorgesetzte/r'],
    ['Rollen', 'role', own.role, 'als Rollenverantwortliche/r'],
    ['Risiken', 'risk', own.risk, 'als Risikoeigner'],
    ['Chancen', 'opportunity', own.opportunity, 'als Verantwortliche/r'],
    ['Controls', 'control', own.control, 'als Kontrollverantwortliche/r'],
    ['KPI', 'kpi', own.kpi, 'als Messverantwortliche/r'],
    ['Erteilte Übertragungen', 'mandate', own.mandate, 'Überwachungspflicht als Delegierende/r'],
    ['Audits', 'audit', own.audit, 'als leitende/r Auditor/in'],
  ];

  return (
    <div className="home">
      <div className="home-head">
        <div>
          <div className="muted small">{t('Ihre Startseite')}</div>
          <h2>{t('Willkommen, {name}', { name: user.title })}</h2>
          <div className="row gap-s home-who">
            {mine.position && (
              <Tag color={modules.position.color} onClick={() => go('position', mine.position!.id)}>
                {mine.position.title}
              </Tag>
            )}
            {mine.roles.map((r) => (
              <Tag key={r.id} color={modules.role.color} onClick={() => go('role', r.id)}>
                {r.title}
              </Tag>
            ))}
            <span className="sysrole-pill">{user.systemRoles.map((id) => t(systemRoleById.get(id)?.name ?? id)).join(', ')}</span>
            {own.count > 0 && <span className="owner-pill">🔑 {t('Owner von {n} Elementen', { n: own.count })}</span>}
          </div>
        </div>
      </div>

      <section className="home-section">
        <ProcessLandscape compact />
      </section>

      <div className="home-grid">
        <div className="home-main">
          <section className="home-section assigned">
            <h3>👤 {t('Mir zugewiesen')}</h3>
            <p className="small muted">{t('Diese Elemente betreffen Sie. Sie können sie lesen; bearbeitet werden sie von den Ownern.')}</p>
            {mine.todos.length > 0 && (
              <Card title="Für mich zu tun" count={mine.todos.length} tone="warn">
                {mine.todos.map((i, n) => (
                  <div key={n} className="small link" onClick={() => go(i.kind, i.id)}>
                    {i.text}
                  </div>
                ))}
              </Card>
            )}
            <div className="home-cards">
              <Card title="Meine Stelle">
                {mine.position ? (
                  <>
                    <div className="link" onClick={() => go('position', mine.position!.id)}>
                      <b>{mine.position.title}</b> <span className="mono small muted">{mine.position.code}</span>
                    </div>
                    <div className="small muted">
                      {t('seit')} {user.positionSince || '–'} · {t('Vorgesetzte/r')}: {supervisorNames || '–'}
                    </div>
                    {mine.position.purpose && <div className="small">{mine.position.purpose}</div>}
                  </>
                ) : (
                  <span className="muted small">{t('Keiner Stelle zugeordnet.')}</span>
                )}
              </Card>
              <Card title="Meine Rollen" count={mine.roles.length}>
                {mine.roles.length ? tags('role', mine.roles) : <span className="muted small">{t('Keiner Rolle zugeordnet.')}</span>}
              </Card>
            </div>
            <Card title="Meine Prozessschritte" count={new Set(mine.steps.map((s) => s.process.id + s.elementId)).size}>
              <StepList steps={mine.steps} />
              <div className="small muted">{t(raciHint)}</div>
            </Card>
            <div className="home-cards">
              {mine.mandates.length > 0 && (
                <Card title="Übertragungen an mich" count={mine.mandates.length}>
                  {mine.mandates.map((m) => (
                    <div key={m.id} className="row gap-s small link" onClick={() => go('mandate', m.id)}>
                      <span className="grow">{m.title}</span>
                      <MandateStatePill mandate={m} />
                    </div>
                  ))}
                </Card>
              )}
              {(mine.controls.length > 0 || mine.kpis.length > 0) && (
                <Card title="Durchführung & Auswertung">
                  {mine.controls.length > 0 && tags('control', mine.controls)}
                  {mine.kpis.length > 0 && tags('kpi', mine.kpis)}
                </Card>
              )}
              {mine.findings.length > 0 && (
                <Card title="Offene Audit-Feststellungen" count={mine.findings.length}>
                  {mine.findings.map(({ audit, finding }) => (
                    <FindingLine key={finding.id} audit={audit} finding={finding} />
                  ))}
                </Card>
              )}
            </div>
          </section>

          {own.count > 0 && (
            <section className="home-section owned">
              <h3>🔑 {t('In meiner Verantwortung')}</h3>
              <p className="small muted">
                {t('Hier sind Sie Owner. Diese Elemente dürfen Sie bearbeiten – neue anlegen kann nur die Administration.')}
              </p>
              {own.issues.length > 0 && (
                <Card title="Handlungsbedarf bei meinen Elementen" count={own.issues.length} tone="warn">
                  {own.issues.map((i, n) => (
                    <div key={n} className="small link" onClick={() => go(i.kind, i.id)}>
                      {i.text}
                    </div>
                  ))}
                </Card>
              )}
              <div className="home-cards">
                {ownCards
                  .filter(([, , items]) => items.length)
                  .map(([title, kind, items, why]) => (
                    <Card key={title} title={title} count={items.length}>
                      <div className="small muted">{t(why)}</div>
                      {items.map((e) => (
                        <div key={e.id} className="row gap-s owned-item">
                          <span className="link grow" onClick={() => go(kind, e.id)}>
                            <span className="mono small muted">{e.code}</span> {e.title}
                          </span>
                          {kind === 'position' && (
                            <span className="small muted">
                              {positionHolders(e as never, d.user)
                                .map((u) => u.title)
                                .join(', ') || t('unbesetzt')}
                            </span>
                          )}
                          <button className="small-btn" onClick={() => go(kind, e.id)}>
                            ✎ {t('Bearbeiten')}
                          </button>
                        </div>
                      ))}
                    </Card>
                  ))}
              </div>
            </section>
          )}

          {isAdmin && (
            <section className="home-section admin">
              <h3>⚙ {t('Administration')}</h3>
              <p className="small muted">{t('Neue Elemente anlegen – Owner bearbeiten danach die bestehenden.')}</p>
              <div className="row gap wrap">
                <button
                  className="primary"
                  onClick={() => {
                    go('processes');
                    setDraftOpen(true);
                  }}
                >
                  ✨ {t('Prozess mit KI entwerfen')}
                </button>
                {(['role', 'position', 'mandate', 'risk', 'control', 'kpi', 'audit', 'user'] as EntityKind[]).map((k) => (
                  <button
                    key={k}
                    onClick={() => {
                      const e = d.createEntity(k, k === 'user' ? t('Neuer Benutzer') : t('Neue(s) {label}', { label: t(modules[k].label) }));
                      go(k, e.id);
                    }}
                  >
                    + {t(modules[k].label)}
                  </button>
                ))}
                <button onClick={() => go('dashboard')}>◧ {t('GRC-Cockpit')}</button>
              </div>
            </section>
          )}
        </div>
        <aside className="home-side">
          <AssistantChat />
        </aside>
      </div>
    </div>
  );
}
