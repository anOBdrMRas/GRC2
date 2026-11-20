import type { ReactNode } from 'react';
import type { EntityKind, ProcessModel } from '../types';
import { useStore } from '../store';
import { useUi } from '../ui';
import { modules } from '../schema';
import { positionHolders } from '../logic';
import { assignmentsOf, ownershipOf, type MyStep } from '../ownership';
import { useRights } from '../useRights';
import { systemRoleById } from '../permissions';
import { CheckTiles, StatusBar } from './IaCockpit';
import { ExcelTools } from './ExcelTools';
import { imsChecks, workflowCounts } from '../quality';
import { openRejection, stageOf, isWfKind, type WfItem, type WfKind } from '../workflow';
import { MandateActions, pendingMandates } from './MandateViews';
import { StatusPill } from './common';
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
  const { user, isAdmin, isIa } = useRights();
  if (!user) return null;
  if (isAdmin) return <AdminHome />;
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

      <div className="home-grid">
        <div className="home-main">
          {isIa && <IaWaiting />}
          <MyMandateApprovals userId={user.id} />
          <RecordRisk userId={user.id} />
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
              <p className="small muted">{t('Hier sind Sie Owner. Diese Elemente dürfen Sie bearbeiten und fachlich freigeben.')}</p>
              <OwnerApprovals
                items={[
                  ...own.processes.map((item) => ({ kind: 'processes' as WfKind, item })),
                  ...own.instruction.map((item) => ({ kind: 'instruction' as WfKind, item })),
                  ...own.role.map((item) => ({ kind: 'role' as WfKind, item })),
                  ...own.position.map((item) => ({ kind: 'position' as WfKind, item })),
                  ...own.risk.map((item) => ({ kind: 'risk' as WfKind, item })),
                  ...own.opportunity.map((item) => ({ kind: 'opportunity' as WfKind, item })),
                ]}
              />
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
                          {isWfKind(kind) && <StatusPill status={(e as unknown as WfItem).status} />}
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
        </div>
        <aside className="home-side">
          <AssistantChat />
        </aside>
      </div>
    </div>
  );
}

/** Owner: drafts waiting for the business approval (and items sent back by I&A). */
function OwnerApprovals({ items }: { items: { kind: WfKind; item: WfItem }[] }) {
  const go = useUi((s) => s.go);
  const drafts = items.filter((x) => stageOf(x.item.status) === 'draft');
  const review = items.filter((x) => stageOf(x.item.status) === 'review');
  if (!drafts.length && !review.length) return null;
  return (
    <Card title="Freigabe-Workflow" count={drafts.length} tone={drafts.length ? 'warn' : undefined}>
      {drafts.map(({ kind, item }) => {
        const rej = openRejection(item);
        return (
          <div key={kind + item.id} className="small link" onClick={() => go(kind, item.id)}>
            ✎ <span className="mono">{item.code}</span> {item.title} – <b>{t('wartet auf Ihre fachliche Freigabe')}</b>
            {rej && (
              <span className="warn">
                {' '}
                ({t('zurückgewiesen')}: {rej.comment})
              </span>
            )}
          </div>
        );
      })}
      {review.map(({ kind, item }) => (
        <div key={kind + item.id} className="small link muted" onClick={() => go(kind, item.id)}>
          ⏳ <span className="mono">{item.code}</span> {item.title} – {t('liegt beim I&A-Team')}
        </div>
      ))}
    </Card>
  );
}

/** Delegations the person has to grant or accept. */
function MyMandateApprovals({ userId }: { userId: string }) {
  const mandates = useStore((s) => s.mandate);
  const users = useStore((s) => s.user);
  const go = useUi((s) => s.go);
  const mine = pendingMandates(mandates).filter((p) => p.userId === userId);
  if (!mine.length) return null;
  const name = (id: string) => users.find((u) => u.id === id)?.title ?? '–';
  return (
    <section className="home-section mandate-home">
      <h3>
        ✍ {t('Delegationen: zu erteilen / anzunehmen')} <span className="count">{mine.length}</span>
      </h3>
      {mine.map(({ m, stage }) => (
        <div key={m.id} className="mandate-pending">
          <div>
            <span className="link" onClick={() => go('mandate', m.id)}>
              <span className="mono small muted">{m.code}</span> {m.title}
            </span>
            <div className="small muted">
              {stage === 'grant'
                ? t('Sie erteilen diese Delegation an {name}.', { name: name(m.recipientUserId) })
                : t('{name} hat Ihnen diese Delegation erteilt. Bitte prüfen und annehmen.', {
                    name: m.grantedByUserId ? name(m.grantedByUserId) : m.grantedByBody,
                  })}
            </div>
          </div>
          <MandateActions m={m} compact />
        </div>
      ))}
    </section>
  );
}

/** Everybody records risks and opportunities; the recorder's open drafts are listed. */
function RecordRisk({ userId }: { userId: string }) {
  const d = useStore();
  const create = useStore((s) => s.createEntity);
  const go = useUi((s) => s.go);
  const drafts = [
    ...d.risk.filter((r) => r.createdByUserId === userId && stageOf(r.status) !== 'released').map((e) => ({ kind: 'risk' as const, e })),
    ...d.opportunity
      .filter((o) => o.createdByUserId === userId && stageOf(o.status) !== 'released')
      .map((e) => ({ kind: 'opportunity' as const, e })),
  ];
  return (
    <section className="home-section record">
      <div className="row space">
        <h3>⚠ {t('Risiken und Chancen melden')}</h3>
        <div className="row gap-s">
          {(['risk', 'opportunity'] as const).map((k) => (
            <button
              key={k}
              onClick={() => {
                const e = create(k, t('Neue(s) {label}', { label: t(modules[k].label) }));
                go(k, e.id);
              }}
            >
              + {t(modules[k].label)}
            </button>
          ))}
        </div>
      </div>
      <p className="small muted">
        {t('Jede/r kann Risiken und Chancen erfassen. Der Owner bewertet und gibt fachlich frei, danach prüft das I&A-Team.')}
      </p>
      {drafts.map(({ kind, e }) => (
        <div key={e.id} className="small link row gap-s" onClick={() => go(kind, e.id)}>
          <span className="mono muted">{e.code}</span> {e.title} <StatusPill status={e.status} />
        </div>
      ))}
    </section>
  );
}

/** I&A team member: approvals waiting in the I&A cockpit. */
function IaWaiting() {
  const d = useStore();
  const go = useUi((s) => s.go);
  const n = [...d.processes, ...d.role, ...d.position, ...d.risk, ...d.opportunity].filter((x) => stageOf(x.status) === 'review').length;
  return (
    <section className="home-section ia-home">
      <div className="row space">
        <h3>✓ {t('I&A-Freigaben')}</h3>
        <button className="primary" onClick={() => go('ia')}>
          {t('Zum I&A-Cockpit')}
        </button>
      </div>
      <p className="small">{n ? t('{n} Elemente warten auf Ihre Qualitätsfreigabe.', { n }) : t('Keine offenen Freigaben.')}</p>
    </section>
  );
}

/** Administrator start page: state of the integrated management system and administration. */
function AdminHome() {
  const d = useStore();
  const go = useUi((s) => s.go);
  const select = useUi((s) => s.select);
  const setDraftOpen = useUi((s) => s.setDraftOpen);
  const { user } = useRights();
  const checks = imsChecks(d);
  const counts = workflowCounts(d);
  const open = checks.reduce((n, c) => n + c.items.length, 0);
  const notReleased =
    counts.processes.total + counts.role.total + counts.position.total - counts.processes.released - counts.role.released - counts.position.released;
  const tiles: [string, number, () => void][] = [
    ['Prozesse', d.processes.length, () => (select('processes', undefined), go('processes'))],
    ['Rollen', d.role.length, () => go('role')],
    ['Stellen', d.position.length, () => go('position')],
    ['Delegationen & Vollmachten', d.mandate.length, () => go('mandate')],
    ['Benutzer', d.user.filter((u) => u.status === 'Aktiv').length, () => go('user')],
  ];
  return (
    <div className="home admin-home">
      <div className="home-head">
        <div className="muted small">{t('Administration')}</div>
        <h2>{t('Willkommen, {name}', { name: user?.title ?? '' })}</h2>
        <div className="small muted">{t('Lagebild des integrierten Managementsystems (IMS)')}</div>
      </div>

      <div className="stat-grid wide">
        {tiles.map(([label, n, onClick]) => (
          <div key={label} className="stat clickable" onClick={onClick}>
            <div className="stat-num">{n}</div>
            <div className="stat-label">{t(label)}</div>
          </div>
        ))}
        <div className="stat clickable warn-stat" onClick={() => document.getElementById('ims-open')?.scrollIntoView({ behavior: 'smooth' })}>
          <div className="stat-num">{open}</div>
          <div className="stat-label">{t('offene Punkte')}</div>
        </div>
      </div>

      <section className="home-section">
        <div className="row space">
          <h3>{t('Freigabe-Workflow')}</h3>
          <button onClick={() => go('ia')}>✓ {t('I&A-Cockpit')}</button>
        </div>
        <div className="ia-kpis">
          {(['processes', 'instruction', 'role', 'position', 'risk', 'opportunity'] as WfKind[]).map((k) => (
            <div key={k} className="ia-kpi">
              <b>{k === 'processes' ? t('Prozesse') : t(modules[k].plural)}</b>
              <StatusBar c={counts[k]} />
              <div className="small muted">
                {t('{a} von {b} freigegeben', { a: counts[k].released, b: counts[k].total })} · {t('{n} im I&A-Review', { n: counts[k].review })} ·{' '}
                {t('{n} beim Owner (Entwurf)', { n: counts[k].draft })}
              </div>
            </div>
          ))}
        </div>
        <div className="small">{t('{n} Elemente sind noch nicht freigegeben.', { n: notReleased })}</div>
      </section>

      <section className="home-section" id="ims-open">
        <h3>{t('Wo es hakt')}</h3>
        <p className="small muted">{t('Klick auf eine Kachel zeigt die betroffenen Elemente; ein Klick auf ein Element öffnet es.')}</p>
        <CheckTiles checks={checks} columns={4} />
      </section>

      <div className="home-grid">
        <section className="home-section admin">
          <h3>{t('Anlegen')}</h3>
          <div className="row gap wrap">
            <button
              className="primary"
              onClick={() => {
                select('processes', undefined);
                go('processes');
                setDraftOpen(true);
              }}
            >
              ✨ {t('Prozess mit KI entwerfen')}
            </button>
            <button onClick={() => (select('processes', undefined), go('processes'))}>
              ⬆ {t('BPMN importieren')} / + {t('Prozess')}
            </button>
            {(['role', 'position', 'mandate', 'risk', 'control', 'kpi', 'audit', 'user'] as EntityKind[]).map((k) => (
              <button
                key={k}
                onClick={() => {
                  const e = d.createEntity(
                    k,
                    k === 'user'
                      ? t('Neuer Benutzer')
                      : k === 'mandate'
                        ? t('Neue Übertragung')
                        : t('Neue(s) {label}', { label: t(modules[k].label) }),
                  );
                  go(k, e.id);
                }}
              >
                + {t(modules[k].label)}
              </button>
            ))}
          </div>
        </section>
        <section className="home-section admin">
          <h3>{t('Daten')}</h3>
          <div className="row gap wrap">
            <ExcelTools scope="all" />
          </div>
          <p className="small muted">{t('Excel-Import und -Export gibt es zusätzlich in jedem Modul.')}</p>
        </section>
      </div>
    </div>
  );
}
