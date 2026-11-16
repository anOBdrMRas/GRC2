// I&A cockpit: quality approval queue and quality overview for processes, roles and positions.
import { useState } from 'react';
import type { EntityKind } from '../types';
import { useStore } from '../store';
import { useUi, type View } from '../ui';
import { modules } from '../schema';
import { useRights } from '../useRights';
import { ownersOf } from '../ownership';
import { imsChecks, qualityGrade, workflowCounts, type Check, type CheckItem } from '../quality';
import { daysSince, lastStep, openRejection, stageOf, type WfItem, type WfKind } from '../workflow';
import { fmtTime } from './WorkflowBar';
import { t } from '../i18n';

const kindLabel = (k: WfKind) => (k === 'processes' ? 'Prozess' : modules[k].label);
const kindColor = (k: WfKind) => (k === 'processes' ? '#1f4e79' : modules[k].color);

/** Opens an element (or a process step). */
export function useOpenItem() {
  const go = useUi((s) => s.go);
  const openStep = useUi((s) => s.openStep);
  return (i: { kind: EntityKind | 'processes'; id: string; elementId?: string }) =>
    i.kind === 'processes' && i.elementId ? openStep(i.id, i.elementId) : go(i.kind as View, i.id);
}

/** Tiles with a count; a click expands the list of affected elements. */
export function CheckTiles({ checks, columns = 3 }: { checks: Check[]; columns?: number }) {
  const [open, setOpen] = useState<string | null>(null);
  const openItem = useOpenItem();
  const current = checks.find((c) => c.key === open);
  return (
    <div>
      <div className="check-grid" style={{ gridTemplateColumns: `repeat(auto-fill, minmax(${columns === 4 ? 190 : 220}px, 1fr))` }}>
        {checks.map((c) => (
          <button
            key={c.key}
            className={`check-tile ${c.items.length ? 'has' : 'none'} ${open === c.key ? 'active' : ''}`}
            onClick={() => setOpen(open === c.key ? null : c.key)}
          >
            <span className="check-num">{c.items.length}</span>
            <span className="check-label">{t(c.label)}</span>
          </button>
        ))}
      </div>
      {current && (
        <div className="check-list">
          <b className="small">{t(current.label)}</b>
          {current.items.length === 0 && <div className="ok small">✓ {t('nichts offen')}</div>}
          {current.items.slice(0, 60).map((i: CheckItem, n) => (
            <div key={n} className="small link" onClick={() => openItem(i)}>
              {i.label}
              {i.detail && <span className="muted"> – {i.detail}</span>}
            </div>
          ))}
          {current.items.length > 60 && <div className="small muted">… {t('und {n} weitere', { n: current.items.length - 60 })}</div>}
        </div>
      )}
    </div>
  );
}

/** Stacked bar of the workflow status of one module. */
export function StatusBar({ c }: { c: { draft: number; review: number; released: number; archived: number; total: number } }) {
  const pct = (n: number) => `${c.total ? (n / c.total) * 100 : 0}%`;
  return (
    <div
      className="wf-statusbar"
      title={`${t('Freigegeben')} ${c.released} · ${t('I&A-Review')} ${c.review} · ${t('Entwurf')} ${c.draft} · ${t('Archiviert')} ${c.archived}`}
    >
      <span className="seg released" style={{ width: pct(c.released) }} />
      <span className="seg review" style={{ width: pct(c.review) }} />
      <span className="seg draft" style={{ width: pct(c.draft) }} />
      <span className="seg archived" style={{ width: pct(c.archived) }} />
    </div>
  );
}

export function IaCockpit() {
  const d = useStore();
  const act = useStore((s) => s.workflowAction);
  const { user, isAdmin } = useRights();
  const openItem = useOpenItem();
  const [comments, setComments] = useState<Record<string, string>>({});
  const name = (id: string) => d.user.find((u) => u.id === id)?.title ?? '–';
  const all: { kind: WfKind; item: WfItem }[] = [
    ...d.processes.map((item) => ({ kind: 'processes' as WfKind, item })),
    ...d.role.map((item) => ({ kind: 'role' as WfKind, item })),
    ...d.position.map((item) => ({ kind: 'position' as WfKind, item })),
  ];
  const waiting = all
    .filter((x) => stageOf(x.item.status) === 'review')
    .sort((a, b) => (lastStep(a.item, 'submitted')?.at ?? '').localeCompare(lastStep(b.item, 'submitted')?.at ?? ''));
  const atOwner = all.filter((x) => stageOf(x.item.status) === 'draft');
  const released = all
    .map((x) => ({ ...x, entry: lastStep(x.item, 'approved') }))
    .filter((x) => x.entry)
    .sort((a, b) => b.entry!.at.localeCompare(a.entry!.at))
    .slice(0, 10);
  const checks = imsChecks(d);
  const grade = qualityGrade(d, checks);
  const counts = workflowCounts(d);
  const owners = (kind: WfKind, item: WfItem) => ownersOf(kind, item, d).map(name).join(', ') || '–';
  const key = (kind: WfKind, id: string) => kind + id;

  return (
    <div className="ia-cockpit">
      <div className="module-head">
        <h2>{t('I&A-Cockpit')}</h2>
        <span className="small muted">{t('Integrity & Assurance: Qualitätsfreigabe von Prozessen, Rollen und Stellen')}</span>
      </div>

      <div className="ia-kpis">
        {(['processes', 'role', 'position'] as WfKind[]).map((k) => (
          <div key={k} className="ia-kpi" style={{ borderTopColor: kindColor(k) }}>
            <div className="row space">
              <b>{k === 'processes' ? t('Prozesse') : t(modules[k].plural)}</b>
              <span className={`grade ${grade[k] >= 80 ? 'good' : grade[k] >= 50 ? 'mid' : 'bad'}`}>{t('Qualität {n} %', { n: grade[k] })}</span>
            </div>
            <StatusBar c={counts[k]} />
            <div className="small muted">
              {t('{a} von {b} freigegeben', { a: counts[k].released, b: counts[k].total })} · {t('{n} im I&A-Review', { n: counts[k].review })} ·{' '}
              {t('{n} im Entwurf', { n: counts[k].draft })}
            </div>
          </div>
        ))}
      </div>

      <section className="ia-section">
        <h3>
          {t('Wartet auf I&A-Freigabe')} <span className="count">{waiting.length}</span>
        </h3>
        {waiting.length === 0 ? (
          <div className="ok small">✓ {t('Keine offenen Freigaben.')}</div>
        ) : (
          <table className="list ia-queue">
            <thead>
              <tr>
                <th>{t('Element')}</th>
                <th>{t('Owner')}</th>
                <th>{t('Fachlich freigegeben')}</th>
                <th>{t('wartet')}</th>
                <th>{t('Entscheidung')}</th>
              </tr>
            </thead>
            <tbody>
              {waiting.map(({ kind, item }) => {
                const sub = lastStep(item, 'submitted');
                const k = key(kind, item.id);
                const own = !isAdmin && sub?.byUserId === user?.id;
                return (
                  <tr key={k}>
                    <td>
                      <span className="ia-kind" style={{ color: kindColor(kind) }}>
                        {t(kindLabel(kind))}
                      </span>
                      <div className="link" onClick={() => openItem({ kind, id: item.id })}>
                        <span className="mono">{item.code}</span> {item.title}
                      </div>
                      <div className="small muted">v{item.version}</div>
                    </td>
                    <td className="small">{owners(kind, item)}</td>
                    <td className="small">
                      {sub ? (
                        <>
                          {name(sub.byUserId)}, {fmtTime(sub.at)}
                          {sub.comment && <div className="muted">„{sub.comment}“</div>}
                        </>
                      ) : (
                        '–'
                      )}
                    </td>
                    <td className="small">{t('{n} Tage', { n: daysSince(sub?.at) })}</td>
                    <td className="ia-decide">
                      <input
                        value={comments[k] ?? ''}
                        onChange={(e) => setComments({ ...comments, [k]: e.target.value })}
                        placeholder={t('Kommentar (für Zurückweisen erforderlich)')}
                      />
                      <div className="row gap-s">
                        <button className="small-btn" onClick={() => openItem({ kind, id: item.id })}>
                          {t('Öffnen')}
                        </button>
                        <button
                          className="small-btn primary"
                          disabled={own}
                          title={own ? t('Vier-Augen-Prinzip: Sie haben fachlich freigegeben.') : undefined}
                          onClick={() => act(kind, item.id, 'approve', comments[k]?.trim() ?? '')}
                        >
                          ✓ {t('Freigeben')}
                        </button>
                        <button
                          className="small-btn danger"
                          disabled={!comments[k]?.trim()}
                          onClick={() => act(kind, item.id, 'reject', comments[k].trim())}
                        >
                          ↩ {t('Zurückweisen')}
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </section>

      <div className="ia-grid">
        <section className="ia-section">
          <h3>
            {t('Beim Owner in Arbeit')} <span className="count">{atOwner.length}</span>
          </h3>
          {atOwner.length === 0 && <div className="muted small">–</div>}
          {atOwner.map(({ kind, item }) => {
            const rej = openRejection(item);
            return (
              <div key={key(kind, item.id)} className="ia-line">
                <span className="ia-kind" style={{ color: kindColor(kind) }}>
                  {t(kindLabel(kind))}
                </span>{' '}
                <span className="link" onClick={() => openItem({ kind, id: item.id })}>
                  <span className="mono">{item.code}</span> {item.title}
                </span>
                <span className="small muted"> · {owners(kind, item)}</span>
                {rej && (
                  <div className="small warn">
                    ↩ {t('zurückgewiesen')}: {rej.comment}
                  </div>
                )}
              </div>
            );
          })}
        </section>
        <section className="ia-section">
          <h3>{t('Zuletzt freigegeben')}</h3>
          {released.length === 0 && <div className="muted small">–</div>}
          {released.map(({ kind, item, entry }) => (
            <div key={key(kind, item.id) + entry!.at} className="ia-line">
              <span className="small muted">{fmtTime(entry!.at)}</span>{' '}
              <span className="link" onClick={() => openItem({ kind, id: item.id })}>
                <span className="mono">{item.code}</span> {item.title}
              </span>
              <span className="small muted">
                {' '}
                · v{item.version} · {name(entry!.byUserId)}
              </span>
            </div>
          ))}
        </section>
      </div>

      <section className="ia-section">
        <h3>{t('Qualitätsprüfungen')}</h3>
        <p className="small muted">
          {t('Automatische Prüfungen über Prozesse, Rollen und Stellen. Klick auf eine Kachel zeigt die betroffenen Elemente.')}
        </p>
        <CheckTiles checks={checks.filter((c) => c.module === 'processes' || c.module === 'role' || c.module === 'position' || c.key === 'review')} />
      </section>
    </div>
  );
}
