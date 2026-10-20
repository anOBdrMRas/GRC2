import { useEffect, useMemo, useRef, useState } from 'react';
import type { Audit, AuditFinding, ProcessModel } from '../types';
import { useStore } from '../store';
import { useUi } from '../ui';
import { modules, auditTypes, findingStatuses, findingTypes } from '../schema';
import {
  activityTypes,
  allFindings,
  auditDate,
  blankFinding,
  independenceConflicts,
  isOpenFinding,
  isOverdueFinding,
  nextFindingCode,
  parseElements,
  today,
} from '../logic';
import { isoById, isoCatalog, isoLabel } from '../iso';
import { dateLocale, t } from '../i18n';
import { ConfirmButton, Empty, Picker, StatusPill, Tag } from './common';

// ---- small building blocks -------------------------------------------------

const typeClass: Record<string, string> = {
  Hauptabweichung: 'major',
  Nebenabweichung: 'minor',
  Beobachtung: 'obs',
  Verbesserungspotenzial: 'ofi',
  'Positive Feststellung': 'positive',
};

export function FindingTypePill({ type }: { type: string }) {
  return <span className={`pill ftype ftype-${typeClass[type] ?? 'obs'}`}>{t(type)}</span>;
}

export const auditTypeColor: Record<string, string> = {
  'Internes Audit': '#0c8599',
  Zertifizierungsaudit: '#7048e8',
  Systemaudit: '#1971c2',
  Kundenaudit: '#e8590c',
  Lieferantenaudit: '#2f9e44',
};

function clauseTitle(id: string) {
  const r = isoById.get(id);
  if (!r) return id;
  return `${isoLabel(id)} – ${r.standard === 'ISO 27001' ? r.title : t(r.title)}`;
}

/** "P-001 › Step name" for a finding's process step. */
export function useStepLabel() {
  const processes = useStore((s) => s.processes);
  return (processId: string, elementId: string) => {
    const p = processes.find((x) => x.id === processId);
    if (!p) return '–';
    const el = elementId ? parseElements(p.xml).find((e) => e.id === elementId) : undefined;
    return el ? `${p.code} › ${el.name}` : `${p.code} ${p.title}`;
  };
}

/** Open findings per BPMN element of a process (for diagram badges). */
export function openFindingsByElement(audits: Audit[], processId: string) {
  const out: Record<string, number> = {};
  for (const { finding } of allFindings(audits)) {
    if (finding.processId === processId && finding.elementId && isOpenFinding(finding)) out[finding.elementId] = (out[finding.elementId] ?? 0) + 1;
  }
  return out;
}

/** Clickable finding line used in the process panel, control/risk/role views. */
export function FindingLine({ audit, finding }: { audit: Audit; finding: AuditFinding }) {
  const openFinding = useUi((s) => s.openFinding);
  const overdue = isOverdueFinding(finding);
  return (
    <div className="finding-line link" onClick={() => openFinding(audit.id, finding.id)} title={finding.description}>
      <span className="mono">{finding.code}</span>
      <FindingTypePill type={finding.type} />
      <span className="grow clamp-2">{finding.description || audit.title}</span>
      <span className={`small ${overdue ? 'warn' : 'muted'}`}>
        {overdue ? `⚠ ${finding.dueDate}` : t(finding.status)}
      </span>
    </div>
  );
}

// ---- process references field ---------------------------------------------

export function ProcessRefs({ value, onChange }: { value: string[]; onChange: (v: string[]) => void }) {
  const processes = useStore((s) => s.processes);
  const go = useUi((s) => s.go);
  return (
    <div>
      <div className="tags">
        {value.map((id) => {
          const p = processes.find((x) => x.id === id);
          return (
            <Tag key={id} onClick={() => go('processes', id)} onRemove={() => onChange(value.filter((x) => x !== id))}>
              {p ? `${p.code} ${p.title}` : id}
            </Tag>
          );
        })}
      </div>
      <Picker
        options={processes.map((p) => ({ id: p.id, label: `${p.code} ${p.title}`, sub: t(p.category) }))}
        exclude={value}
        placeholder={t('Prozess hinzufügen…')}
        onPick={(id) => onChange([...value, id])}
      />
    </div>
  );
}

// ---- findings editor (inside an audit) ---------------------------------------

export function FindingsEditor({ value, auditId, onChange }: { value: AuditFinding[]; auditId?: string; onChange: (v: AuditFinding[]) => void }) {
  const audits = useStore((s) => s.audit);
  const stepLabel = useStepLabel();
  const focusFindingId = useUi((s) => s.focusFindingId);
  const clearFindingFocus = useUi((s) => s.clearFindingFocus);
  const [open, setOpen] = useState<string | null>(focusFindingId);
  const focusRow = useRef<HTMLTableRowElement>(null);
  const audit = audits.find((a) => a.id === auditId);

  useEffect(() => {
    if (!focusFindingId || !value.some((f) => f.id === focusFindingId)) return;
    setOpen(focusFindingId);
    clearFindingFocus();
    // let the expanded row render, then bring it into view
    window.setTimeout(() => focusRow.current?.scrollIntoView({ block: 'center' }), 50);
  }, [focusFindingId, value, clearFindingFocus]);

  const set = (id: string, patch: Partial<AuditFinding>) => onChange(value.map((f) => (f.id === id ? { ...f, ...patch } : f)));

  return (
    <div className="findings">
      {value.length > 0 && (
        <table className="list findings-table">
          <thead>
            <tr>
              <th>ID</th>
              <th>{t('Typ')}</th>
              <th>{t('Beschreibung')}</th>
              <th>{t('Frist')}</th>
              <th>{t('Status')}</th>
            </tr>
          </thead>
          <tbody>
            {value.map((f) => {
              const overdue = isOverdueFinding(f);
              const expanded = open === f.id;
              return [
                <tr
                  key={f.id}
                  ref={expanded ? focusRow : undefined}
                  className={expanded ? 'selected' : ''}
                  onClick={() => setOpen(expanded ? null : f.id)}
                >
                  <td className="mono">{f.code}</td>
                  <td>
                    <FindingTypePill type={f.type} />
                  </td>
                  <td className="ellipsis-cell" title={`${f.description}\n${stepLabel(f.processId, f.elementId)}`}>
                    {f.description || <span className="muted">{t('(ohne Beschreibung)')}</span>}
                  </td>
                  <td className={overdue ? 'warn' : undefined}>
                    {f.dueDate || '–'}
                    {overdue && ' ⚠'}
                  </td>
                  <td>
                    <StatusPill status={f.status} />
                  </td>
                </tr>,
                expanded && (
                  <tr key={f.id + '-edit'} className="finding-edit-row">
                    <td colSpan={5}>
                      <FindingForm finding={f} onChange={(patch) => set(f.id, patch)} onDelete={() => onChange(value.filter((x) => x.id !== f.id))} />
                    </td>
                  </tr>
                ),
              ];
            })}
          </tbody>
        </table>
      )}
      <button
        type="button"
        className="add-row"
        onClick={() => {
          const f = { ...blankFinding(nextFindingCode(audits)), processId: audit?.processIds[0] ?? '' };
          onChange([...value, f]);
          setOpen(f.id);
        }}
      >
        + {t('Feststellung')}
      </button>
    </div>
  );
}

function FindingForm({ finding: f, onChange, onDelete }: { finding: AuditFinding; onChange: (p: Partial<AuditFinding>) => void; onDelete: () => void }) {
  const { processes, role, user, risk, control } = useStore();
  const process = processes.find((p) => p.id === f.processId);
  const steps = process ? parseElements(process.xml).filter((e) => activityTypes.includes(e.type)) : [];
  const label = (text: string, hint?: string) => (
    <span className="field-label">
      {t(text)}
      {hint && <span className="hint"> · {t(hint)}</span>}
    </span>
  );
  const select = (key: keyof AuditFinding, options: { value: string; label: string }[], empty = true) => (
    <select value={f[key] as string} onChange={(e) => onChange({ [key]: e.target.value })}>
      {empty && <option value="">{t('— nicht zugewiesen —')}</option>}
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
  const area = (key: keyof AuditFinding, text: string, hint?: string) => (
    <label className="field wide">
      {label(text, hint)}
      <textarea rows={2} value={f[key] as string} onChange={(e) => onChange({ [key]: e.target.value })} />
    </label>
  );
  const refs = (key: 'riskIds' | 'controlIds', items: { id: string; code: string; title: string }[], kind: 'risk' | 'control') => (
    <div>
      <div className="tags">
        {f[key].map((id) => {
          const e = items.find((x) => x.id === id);
          return (
            <Tag key={id} color={modules[kind].color} onRemove={() => onChange({ [key]: f[key].filter((x) => x !== id) })}>
              {e ? `${e.code} ${e.title}` : id}
            </Tag>
          );
        })}
      </div>
      <Picker options={items.map((e) => ({ id: e.id, label: `${e.code} ${e.title}` }))} exclude={f[key]} onPick={(id) => onChange({ [key]: [...f[key], id] })} />
    </div>
  );

  return (
    <div className="finding-form">
      <div className="grid">
        <label className="field">
          {label('Typ')}
          {select('type', findingTypes.map((x) => ({ value: x, label: t(x) })), false)}
        </label>
        <label className="field">
          {label('Status')}
          {select('status', findingStatuses.map((x) => ({ value: x, label: t(x) })), false)}
        </label>
        <label className="field">
          {label('Normkapitel')}
          {select('clause', isoCatalog.map((r) => ({ value: r.id, label: clauseTitle(r.id) })))}
        </label>
        <label className="field">
          {label('Frist')}
          <input type="date" value={f.dueDate} onChange={(e) => onChange({ dueDate: e.target.value })} />
        </label>
        {area('description', 'Feststellung')}
        {area('evidence', 'Nachweis / Evidenz')}
        <label className="field">
          {label('Prozess')}
          <select value={f.processId} onChange={(e) => onChange({ processId: e.target.value, elementId: '' })}>
            <option value="">{t('— nicht zugewiesen —')}</option>
            {processes.map((p) => (
              <option key={p.id} value={p.id}>
                {p.code} {p.title}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          {label('Prozessschritt')}
          <select value={f.elementId} disabled={!process} onChange={(e) => onChange({ elementId: e.target.value })}>
            <option value="">{t('— ganzer Prozess —')}</option>
            {steps.map((s) => (
              <option key={s.id} value={s.id}>
                {'  '.repeat(s.depth)}
                {s.name}
              </option>
            ))}
          </select>
        </label>
        <div className="field">
          {label('Betroffene Risiken')}
          {refs('riskIds', risk, 'risk')}
        </div>
        <div className="field">
          {label('Betroffene Controls')}
          {refs('controlIds', control, 'control')}
        </div>
        <label className="field">
          {label('Verantwortliche Rolle')}
          {select('responsibleRoleId', role.map((r) => ({ value: r.id, label: `${r.code} ${r.title}` })))}
        </label>
        <label className="field">
          {label('Verantwortliche Person')}
          {select('responsibleUserId', user.map((u) => ({ value: u.id, label: u.title })))}
        </label>
        {area('rootCause', 'Ursachenanalyse', 'ISO 9001 10.2.1 b')}
        {area('correctiveAction', 'Korrekturmaßnahme', 'ISO 9001 10.2.1 c')}
        <label className="field">
          {label('Wirksamkeit geprüft am')}
          <input type="date" value={f.verifiedAt} onChange={(e) => onChange({ verifiedAt: e.target.value })} />
        </label>
        <label className="field">
          {label('Wirksamkeit geprüft durch')}
          {select('verifiedByUserId', user.map((u) => ({ value: u.id, label: u.title })))}
        </label>
        {area('verificationResult', 'Ergebnis der Wirksamkeitsprüfung', 'ISO 9001 10.2.1 d')}
      </div>
      <div className="row space">
        <span className="muted small">{f.code}</span>
        <ConfirmButton label={t('Feststellung löschen')} confirmLabel={t('Wirklich löschen?')} onConfirm={onDelete} />
      </div>
    </div>
  );
}

// ---- warnings shown above the audit form ------------------------------------

export function AuditInsights({ audit }: { audit: Audit }) {
  const { role, user, processes } = useStore();
  const now = today();
  const conflicts = independenceConflicts(audit, role, user, processes);
  const overdue = audit.findings.filter((f) => isOverdueFinding(f, now));
  const open = audit.findings.filter(isOpenFinding);
  const issues: string[] = [];
  if (audit.certificateValidUntil && audit.auditType === 'Zertifizierungsaudit') {
    const days = Math.round((Date.parse(audit.certificateValidUntil) - Date.parse(now)) / 86_400_000);
    if (days < 0) issues.push(t('Zertifikat ist seit {date} abgelaufen.', { date: audit.certificateValidUntil }));
    else if (days < 180) issues.push(t('Zertifikat läuft in {n} Tagen ab ({date}).', { n: days, date: audit.certificateValidUntil }));
  }
  if (audit.status === 'Abgeschlossen' && open.length > 0) issues.push(t('Audit ist abgeschlossen, aber {n} Feststellungen sind noch offen.', { n: open.length }));
  if (auditDate(audit) && auditDate(audit) < now && ['Geplant', 'In Vorbereitung'].includes(audit.status))
    issues.push(t('Termin {date} ist verstrichen, Status ist noch „{status}“.', { date: auditDate(audit), status: t(audit.status) }));
  if (!audit.leadAuditorUserId && !audit.externalLeadAuditor) issues.push(t('Kein leitender Auditor benannt.'));

  return (
    <div className="insights">
      {(issues.length > 0 || overdue.length > 0 || conflicts.length > 0) && (
        <div className="insight warn-box">
          <div className="insight-title">⚠ {t('Handlungsbedarf')}</div>
          {issues.map((i) => (
            <div key={i} className="small">
              {i}
            </div>
          ))}
          {overdue.map((f) => (
            <div key={f.id} className="small">
              {t('Feststellung {code} ist überfällig (Frist {date}).', { code: f.code, date: f.dueDate })}
            </div>
          ))}
          {conflicts.map((c, i) => (
            <div key={i} className="small">
              {t('Unabhängigkeit (ISO 19011): {user} auditiert {process}, hält aber die Rolle „{role}“ mit Verantwortung im Prozess.', {
                user: c.user.title,
                process: `${c.process.code} ${c.process.title}`,
                role: c.reason,
              })}
            </div>
          ))}
        </div>
      )}
      <div className="insight">
        <div className="insight-title">{t('Feststellungen')}</div>
        <div className="row gap wrap small">
          {findingTypes.map((ft) => {
            const n = audit.findings.filter((f) => f.type === ft).length;
            return n > 0 ? (
              <span key={ft} className="row gap-s">
                <FindingTypePill type={ft} /> {n}
              </span>
            ) : null;
          })}
          {audit.findings.length === 0 && <span className="muted">{t('Noch keine Feststellungen erfasst.')}</span>}
          {audit.findings.length > 0 && (
            <span className="muted">
              · {t('{n} offen', { n: open.length })}
              {overdue.length > 0 && `, ${t('{n} überfällig', { n: overdue.length })}`}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

// ---- all findings across audits ---------------------------------------------

export function AuditFindingsList() {
  const audits = useStore((s) => s.audit);
  const { role, user } = useStore();
  const openFinding = useUi((s) => s.openFinding);
  const stepLabel = useStepLabel();
  const [filter, setFilter] = useState<'all' | 'open' | 'overdue'>('open');
  const [type, setType] = useState('');
  const rows = useMemo(
    () =>
      allFindings(audits)
        .filter(({ finding: f }) => (filter === 'all' ? true : filter === 'open' ? isOpenFinding(f) : isOverdueFinding(f)))
        .filter(({ finding: f }) => !type || f.type === type)
        .sort((a, b) => (a.finding.dueDate || '9999').localeCompare(b.finding.dueDate || '9999')),
    [audits, filter, type],
  );
  const responsible = (f: AuditFinding) =>
    [role.find((r) => r.id === f.responsibleRoleId)?.title, user.find((u) => u.id === f.responsibleUserId)?.title].filter(Boolean).join(' · ') || '–';

  return (
    <div className="module-full">
      <div className="filter-bar">
        {(['open', 'overdue', 'all'] as const).map((k) => (
          <button key={k} className={`chip ${filter === k ? 'active' : ''}`} onClick={() => setFilter(k)}>
            {t({ open: 'Offen', overdue: 'Überfällig', all: 'Alle' }[k])}
          </button>
        ))}
        <select className="inline-select" value={type} onChange={(e) => setType(e.target.value)}>
          <option value="">{t('Alle Typen')}</option>
          {findingTypes.map((ft) => (
            <option key={ft} value={ft}>
              {t(ft)}
            </option>
          ))}
        </select>
      </div>
      <div className="table-wrap">
        <table className="list">
          <thead>
            <tr>
              <th>ID</th>
              <th>{t('Typ')}</th>
              <th>{t('Feststellung')}</th>
              <th>{t('Audit')}</th>
              <th>{t('Prozessschritt')}</th>
              <th>{t('Verantwortlich')}</th>
              <th>{t('Frist')}</th>
              <th>{t('Status')}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ audit, finding: f }) => {
              const overdue = isOverdueFinding(f);
              return (
                <tr key={f.id} onClick={() => openFinding(audit.id, f.id)}>
                  <td className="mono">{f.code}</td>
                  <td>
                    <FindingTypePill type={f.type} />
                  </td>
                  <td>{f.description}</td>
                  <td className="small">
                    <span className="mono">{audit.code}</span> {audit.title}
                  </td>
                  <td className="small">{stepLabel(f.processId, f.elementId)}</td>
                  <td className="small">{responsible(f)}</td>
                  <td className={overdue ? 'warn' : undefined}>
                    {f.dueDate || '–'}
                    {overdue && ' ⚠'}
                  </td>
                  <td>
                    <StatusPill status={f.status} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {rows.length === 0 && <Empty>{t('Keine Feststellungen für diesen Filter.')}</Empty>}
      </div>
    </div>
  );
}

// ---- audit programme ---------------------------------------------------------

const coverageStandards: { label: string; prefix: string }[] = [
  { label: 'ISO 9001', prefix: '9001:' },
  { label: 'ISO 27001', prefix: '27001:' },
  { label: 'ISO 37301', prefix: '37301:' },
];

export function AuditProgram() {
  const audits = useStore((s) => s.audit);
  const processes = useStore((s) => s.processes);
  const go = useUi((s) => s.go);
  const years = [...new Set([today().slice(0, 4), ...audits.map((a) => (auditDate(a) || a.programYear).slice(0, 4)).filter(Boolean)])].sort();
  const [year, setYear] = useState(today().slice(0, 4));
  const inYear = audits
    .filter((a) => (auditDate(a) || a.programYear).startsWith(year) && a.status !== 'Abgesagt')
    .sort((a, b) => auditDate(a).localeCompare(auditDate(b)));
  const months = Array.from({ length: 12 }, (_, i) => i + 1);
  const monthOf = (d: string) => (d && d.startsWith(year) ? parseInt(d.slice(5, 7), 10) : 0);
  const monthName = (m: number) => new Date(2000, m - 1, 1).toLocaleString(dateLocale(), { month: 'short' });

  const auditedProcessIds = new Set(inYear.flatMap((a) => [...a.processIds, ...a.findings.map((f) => f.processId)]));
  const coveredClauses = new Set(inYear.flatMap((a) => [...a.criteria, ...a.findings.map((f) => f.clause)]));

  return (
    <div className="module-full">
      <div className="row gap">
        <span className="field-label">{t('Jahr')}</span>
        <select className="inline-select" value={year} onChange={(e) => setYear(e.target.value)}>
          {years.map((y) => (
            <option key={y}>{y}</option>
          ))}
        </select>
        <span className="legend-row small">
          {auditTypes.map((at) => (
            <span key={at} className="legend-item">
              <span className="swatch" style={{ background: auditTypeColor[at] }} /> {t(at)}
            </span>
          ))}
        </span>
      </div>
      <div className="table-wrap">
        <table className="program">
          <thead>
            <tr>
              <th>{t('Audit')}</th>
              {months.map((m) => (
                <th key={m}>{monthName(m)}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {inYear.map((a) => {
              const from = monthOf(auditDate(a)) || 0;
              const to = Math.max(from, monthOf(a.endDate) || from);
              return (
                <tr key={a.id} onClick={() => go('audit', a.id)}>
                  <td>
                    <span className="mono">{a.code}</span> {a.title}
                    <div className="small muted">
                      {t(a.auditType)} · <StatusPill status={a.status} />
                    </div>
                  </td>
                  {months.map((m) => (
                    <td key={m} className="program-cell">
                      {m >= from && m <= to && from > 0 && (
                        <span className="program-bar" style={{ background: auditTypeColor[a.auditType] ?? '#868e96' }} title={auditDate(a)}>
                          {m === from ? auditDate(a).slice(8, 10) : ''}
                        </span>
                      )}
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
        {inYear.length === 0 && <Empty>{t('Für {year} sind keine Audits geplant.', { year })}</Empty>}
      </div>

      <div className="dash-grid">
        <div className="card">
          <h3>{t('Prozessabdeckung {year}', { year })}</h3>
          {processes.map((p: ProcessModel) => (
            <div key={p.id} className="row gap small coverage-row">
              <span className={auditedProcessIds.has(p.id) ? 'ok' : 'warn'}>{auditedProcessIds.has(p.id) ? '✓' : '○'}</span>
              <span className="grow">
                <span className="mono">{p.code}</span> {p.title}
              </span>
              <span className="muted">{auditedProcessIds.has(p.id) ? t('auditiert') : t('nicht auditiert')}</span>
            </div>
          ))}
        </div>
        {coverageStandards.map(({ label, prefix }) => {
          // main clauses only; Annex A controls would dominate the list
          const clauses = isoCatalog.filter((r) => r.id.startsWith(prefix) && !r.clause.startsWith('A.'));
          const covered = clauses.filter((r) => coveredClauses.has(r.id));
          return (
            <div key={label} className="card">
              <h3>
                {label}: {t('{n} von {m} Kapiteln auditiert', { n: covered.length, m: clauses.length })}
              </h3>
              <div className="bar">
                <span className="bar-fill eff-Wirksam" style={{ width: `${(covered.length / clauses.length) * 100}%` }} />
              </div>
              <div className="tags coverage-tags">
                {clauses.map((r) => (
                  <span key={r.id} className={`clause-chip ${coveredClauses.has(r.id) ? 'on' : ''}`} title={clauseTitle(r.id)}>
                    {r.clause}
                  </span>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
