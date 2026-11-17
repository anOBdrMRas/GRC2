import { useEffect, useMemo, useRef, useState } from 'react';
import type { AssignableKind, ProcessModel } from '../types';
import { useStore } from '../store';
import { useUi } from '../ui';
import { modules, type FieldDef } from '../schema';
import { activityTypes, allFindings, assignedIds, auditDate, emptyAssignment, isOpenFinding, parseElements } from '../logic';
import { BpmnEditor, type BpmnEditorHandle, type SelectedElement } from '../bpmn/BpmnEditor';
import { StepPanel } from './StepPanel';
import { ConfirmButton, Empty, StatusPill, download } from './common';
import { openFindingsByElement } from './AuditViews';
import { useRights } from '../useRights';
import { AiProcessDraft } from './AiDraft';
import { ProcessLandscape } from './ProcessLandscape';
import { WorkflowBar } from './WorkflowBar';
import { stepsOfUser } from '../ownership';
import { stageLabel, stageOf } from '../workflow';
import { ExcelTools } from './ExcelTools';
import { Field, FieldView } from './Fields';
import { withConfig } from '../contentConfig';
import { t } from '../i18n';

const categories: ProcessModel['category'][] = ['Führungsprozess', 'Kernprozess', 'Unterstützungsprozess'];

/** Administrator tools of the process module: new process, AI draft, BPMN and Excel import/export. */
function ProcessAdminTools() {
  const createProcess = useStore((s) => s.createProcess);
  const updateProcess = useStore((s) => s.updateProcess);
  const select = useUi((s) => s.select);
  const fileInput = useRef<HTMLInputElement>(null);
  const { canCreate } = useRights();
  const draftOpen = useUi((s) => s.draftOpen);
  const setDraftOpen = useUi((s) => s.setDraftOpen);
  const [naming, setNaming] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  if (!canCreate('processes')) return null;

  const importBpmn = async (file: File) => {
    const xml = await file.text();
    const p = createProcess(file.name.replace(/\.(bpmn|xml)$/i, ''));
    updateProcess(p.id, { xml });
    select('processes', p.id);
  };

  return (
    <div className="process-tools">
      <div className="row gap">
        <button className="primary" onClick={() => setNaming(true)}>
          {t('+ Prozess')}
        </button>
        <button onClick={() => setDraftOpen(true)}>✨ {t('Mit KI entwerfen')}</button>
        <button onClick={() => fileInput.current?.click()}>⬆ {t('BPMN importieren')}</button>
        <ExcelTools scope="processes" compact />
        <input
          ref={fileInput}
          type="file"
          accept=".bpmn,.xml"
          hidden
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) importBpmn(f);
            e.target.value = '';
          }}
        />
      </div>
      {draftOpen && <AiProcessDraft onClose={() => setDraftOpen(false)} />}
      {naming && (
        <form
          className="row gap"
          onSubmit={(e) => {
            e.preventDefault();
            const title = newTitle.trim();
            if (title) select('processes', createProcess(title).id);
            setNewTitle('');
            setNaming(false);
          }}
        >
          <input
            id="new-process-title"
            autoFocus
            placeholder={t('Name des Prozesses')}
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
          />
          <button type="submit" className="primary" disabled={!newTitle.trim()}>
            {t('Anlegen')}
          </button>
        </form>
      )}
    </div>
  );
}

/** Process module: the process landscape is the entry; a selected process opens its model. */
export function ProcessView() {
  const processes = useStore((s) => s.processes);
  const selectedId = useUi((s) => s.selected.processes);
  const select = useUi((s) => s.select);
  const { isOwnerOf } = useRights();
  const process = processes.find((p) => p.id === selectedId);

  if (!process) return <ProcessOverview />;

  return (
    <div className="process-view">
      <aside className="process-list">
        <button className="back-link" onClick={() => select('processes', undefined)}>
          ← {t('Prozesslandschaft')}
        </button>
        <ProcessAdminTools />
        {categories.map((cat) => (
          <div key={cat} className="proc-group">
            <div className="proc-group-title">{t(cat)}</div>
            {processes
              .filter((p) => p.category === cat)
              .sort((a, b) => (a.landscapeOrder ?? 99) - (b.landscapeOrder ?? 99))
              .map((p) => (
                <div key={p.id} className={`proc-item ${p.id === process.id ? 'selected' : ''}`} onClick={() => select('processes', p.id)}>
                  <div>
                    <span className="mono">{p.code}</span> {p.title}
                    {isOwnerOf('processes', p) && <span className="owner-badge">{t('Owner')}</span>}
                  </div>
                  <div className="muted small">
                    v{p.version} · {t(stageLabel[stageOf(p.status)])}
                  </div>
                </div>
              ))}
          </div>
        ))}
      </aside>
      <ProcessWorkspace key={process.id} process={process} />
    </div>
  );
}

/** Landscape on top, list of all processes below. */
function ProcessOverview() {
  const d = useStore();
  const select = useUi((s) => s.select);
  const { isOwnerOf } = useRights();
  const [cat, setCat] = useState<string>('');
  const [mine, setMine] = useState(false);
  const [stage, setStage] = useState<string>('');
  const steps = stepsOfUser(d.currentUserId, d);
  const involvement = (p: ProcessModel) => new Set(steps.filter((s) => s.process.id === p.id).map((s) => s.elementId)).size;
  const roleName = (id: string) => d.role.find((r) => r.id === id)?.title ?? '–';
  const rows = d.processes
    .filter(
      (p) => (!cat || p.category === cat) && (!stage || stageOf(p.status) === stage) && (!mine || involvement(p) > 0 || isOwnerOf('processes', p)),
    )
    .sort((a, b) => categories.indexOf(a.category) - categories.indexOf(b.category) || (a.landscapeOrder ?? 99) - (b.landscapeOrder ?? 99));

  return (
    <div className="process-overview">
      <div className="module-head">
        <h2>{t('Prozesslandschaft')}</h2>
        <span className="small muted">{t('Klick auf einen Prozess öffnet das Prozessmodell.')}</span>
      </div>
      <ProcessAdminTools />
      <ProcessLandscape compact />
      <div className="module-head" style={{ marginTop: 8 }}>
        <h3>{t('Alle Prozesse ({n})', { n: d.processes.length })}</h3>
        <div className="filter-bar">
          {['', ...categories].map((c) => (
            <button key={c || 'all'} className={`chip ${cat === c ? 'active' : ''}`} onClick={() => setCat(c)}>
              {c ? t(c) : t('Alle')}
            </button>
          ))}
          <select value={stage} onChange={(e) => setStage(e.target.value)} aria-label={t('Freigabestatus')}>
            <option value="">{t('Alle Status')}</option>
            {(['draft', 'review', 'released', 'archived'] as const).map((s) => (
              <option key={s} value={s}>
                {t(stageLabel[s])}
              </option>
            ))}
          </select>
          <label className="checkbox small">
            <input type="checkbox" checked={mine} onChange={(e) => setMine(e.target.checked)} /> {t('nur meine')}
          </label>
        </div>
      </div>
      <div className="table-wrap">
        <table className="list">
          <thead>
            <tr>
              <th>ID</th>
              <th>{t('Prozess')}</th>
              <th>{t('Prozesskategorie')}</th>
              <th>{t('Prozessbereich')}</th>
              <th>{t('Prozessverantwortlicher')}</th>
              <th>{t('Freigabestatus')}</th>
              <th>{t('Meine Beteiligung')}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((p) => {
              const n = involvement(p);
              return (
                <tr key={p.id} onClick={() => select('processes', p.id)}>
                  <td className="mono">{p.code}</td>
                  <td>{p.title}</td>
                  <td>{t(p.category)}</td>
                  <td>{p.area ?? '–'}</td>
                  <td>{roleName(p.ownerRoleId)}</td>
                  <td>
                    <StatusPill status={p.status} />
                  </td>
                  <td className="small">
                    {isOwnerOf('processes', p) && <span className="owner-badge">{t('Owner')}</span>}{' '}
                    {n > 0 ? (n === 1 ? t('1 Schritt') : t('{n} Schritte', { n })) : ''}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {rows.length === 0 && <Empty>{t('Keine Einträge.')}</Empty>}
      </div>
    </div>
  );
}

type Tab = 'model' | 'profile' | 'matrix';

function ProcessWorkspace({ process: current }: { process: ProcessModel }) {
  const [tab, setTab] = useState<Tab>('model');
  // a changed draft of a released process: the released state can be shown instead (read-only)
  const [showReleased, setShowReleased] = useState(false);
  const viewingReleased = showReleased && !!current.released;
  const process = viewingReleased ? ({ ...current, ...current.released, workflow: current.workflow } as ProcessModel) : current;
  const [selected, setSelected] = useState<SelectedElement | null>(null);
  const editor = useRef<BpmnEditorHandle>(null);
  const updateProcess = useStore((s) => s.updateProcess);
  const deleteProcess = useStore((s) => s.deleteProcess);
  const focusElementId = useUi((s) => s.focusElementId);
  const clearFocus = useUi((s) => s.clearFocus);
  const openStep = useUi((s) => s.openStep);
  const select = useUi((s) => s.select);
  const { canEditEntity, isOwnerOf, canManage } = useRights();
  const isAdmin = canManage('processes');
  const editable = canEditEntity('processes', current) && !viewingReleased;
  const audits = useStore((s) => s.audit);
  const findingCounts = useMemo(() => openFindingsByElement(audits, process.id), [audits, process.id]);

  // A focus request coming from a module switches back to the model tab.
  if (focusElementId && tab !== 'model') setTab('model');

  const fileBase = `${process.code}_${process.title.replace(/[^\wäöüÄÖÜß-]+/g, '_')}`;

  return (
    <section className="workspace">
      <div className="workspace-head">
        <div>
          <div className="breadcrumb small">
            <span className="link" onClick={() => select('processes', undefined)}>
              {t('Prozesslandschaft')}
            </span>
            {' › '}
            {t(process.category)}
            {process.area && ` › ${process.area}`}
          </div>
          <h2>{process.title}</h2>
        </div>
        <div className="tabs">
          <button className={tab === 'model' ? 'active' : ''} onClick={() => setTab('model')}>
            {t('Modell (BPMN)')}
          </button>
          <button className={tab === 'profile' ? 'active' : ''} onClick={() => setTab('profile')}>
            {t('Steckbrief')}
          </button>
          <button className={tab === 'matrix' ? 'active' : ''} onClick={() => setTab('matrix')}>
            {t('Schrittmatrix')}
          </button>
        </div>
        <div className="row gap">
          {tab === 'model' && (
            <>
              <button onClick={async () => download(`${fileBase}.bpmn`, await editor.current!.saveXml(), 'application/xml')}>⬇ BPMN</button>
              <button onClick={async () => download(`${fileBase}.svg`, await editor.current!.saveSvg(), 'image/svg+xml')}>⬇ SVG</button>
            </>
          )}
          {editable && !isAdmin && <span className="owner-badge big">🔑 {t('Owner – Sie dürfen bearbeiten')}</span>}
          {isOwnerOf('processes', process) && isAdmin && <span className="owner-badge">{t('Owner')}</span>}
          {isAdmin ? (
            <ConfirmButton
              label={t('Löschen')}
              confirmLabel={t('Prozess wirklich löschen?')}
              onConfirm={() => {
                deleteProcess(process.id);
                select('processes', undefined);
              }}
            />
          ) : (
            !editable && <span className="badge readonly">{t('Nur Lesen')}</span>
          )}
        </div>
      </div>

      <div className="workspace-wf">
        <span className="small muted">
          {process.code} · v{process.version}
        </span>
        <WorkflowBar kind="processes" item={current} showReleased={viewingReleased} onShowReleased={current.released ? setShowReleased : undefined} />
        {viewingReleased && (
          <div className="released-note small">
            🔒 {t('Freigegebener Stand v{v} – nur Lesen. Die Änderungen des Entwurfs sind noch nicht freigegeben.', { v: process.version })}
          </div>
        )}
      </div>
      {tab === 'model' && (
        <div className="model-area">
          <BpmnEditor
            key={viewingReleased ? 'released' : 'draft'}
            ref={editor}
            process={process}
            findingCounts={findingCounts}
            readOnly={!editable}
            focusElementId={focusElementId}
            onFocused={clearFocus}
            onSelect={setSelected}
            onXmlChange={(id, xml) => updateProcess(id, { xml })}
          />
          <StepPanel process={process} element={selected} readOnly={!editable} onOpenSubProcess={(id) => editor.current?.openSubProcess(id)} />
        </div>
      )}
      {tab === 'profile' && (
        <fieldset className="plain" disabled={!editable}>
          <ProcessProfile process={process} editable={editable} />
        </fieldset>
      )}
      {tab === 'profile' && <ProcessAudits process={process} />}
      {tab === 'matrix' && <StepMatrix process={process} onOpen={(el) => openStep(process.id, el)} />}
    </section>
  );
}

export const PROFILE_SECTION = 'Prozesssteckbrief (ISO 9001 4.4)';

export const profileFields: FieldDef[] = [
  { key: 'code', label: 'ID', type: 'readonly' },
  { key: 'title', label: 'Bezeichnung', type: 'text' },
  { key: 'category', label: 'Prozesskategorie', type: 'select', options: categories },
  { key: 'ownerRoleId', label: 'Prozessverantwortlicher', type: 'ref', refKind: 'role' },
  { key: 'area', label: 'Prozessbereich', type: 'text', hint: 'für die Prozesslandschaft' },
  { key: 'version', label: 'Version', type: 'text' },
  { key: 'status', label: 'Freigabestatus', type: 'select', options: ['Entwurf', 'In Prüfung', 'Freigegeben', 'Archiviert'] },
  { key: 'nextReview', label: 'Nächste Überprüfung', type: 'date' },
  { key: 'standards', label: 'Relevante Managementsysteme', type: 'multiselect', options: ['ISO 9001', 'ISO 14001', 'ISO 27001', 'ISO 37301'] },
  { key: 'description', label: 'Zweck & Anwendungsbereich', type: 'textarea', wide: true },
  { key: 'inputs', label: 'Eingaben (Inputs)', type: 'textarea', wide: true, hint: 'ISO 9001 4.4.1 a' },
  { key: 'outputs', label: 'Ergebnisse (Outputs)', type: 'textarea', wide: true, hint: 'ISO 9001 4.4.1 a' },
  { key: 'resources', label: 'Ressourcen', type: 'textarea', wide: true, hint: 'ISO 9001 4.4.1 d' },
];

/** Process profile: read view, "Bearbeiten" shows the inputs; changes are saved together. */
function ProcessProfile({ process, editable }: { process: ProcessModel; editable: boolean }) {
  const update = useStore((s) => s.updateProcess);
  const { canManage } = useRights();
  const isAdmin = canManage('processes');
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<Record<string, unknown>>({});
  const inEdit = editing && editable;
  const dirty = Object.keys(draft).length > 0;
  const setDirty = useUi((s) => s.setDirty);
  useEffect(() => setDirty(dirty), [dirty, setDirty]);
  useEffect(() => () => setDirty(false), [setDirty]);
  const values = { ...process, ...(inEdit ? draft : {}) } as unknown as Record<string, unknown>;
  // custom fields and dropdown values of the content administration
  const config = useStore((s) => s.config);
  const fields = useMemo(
    () => withConfig([{ title: PROFILE_SECTION, fields: profileFields }], 'processes', config).flatMap((s) => s.fields),
    [config],
  );
  const locked = (key: string) =>
    key === 'status'
      ? 'wird über den Freigabe-Workflow gesetzt'
      : key === 'ownerRoleId' && !isAdmin
        ? 'Nur Administration und I&A-Team ändern die Ownership.'
        : false;

  return (
    <div className="profile">
      <fieldset className={inEdit ? 'editing' : 'reading'}>
        <legend>{t('Prozesssteckbrief (ISO 9001 4.4)')}</legend>
        {editable && (
          <div className="row gap profile-actions">
            {!inEdit ? (
              <button className="primary" onClick={() => setEditing(true)}>
                ✎ {t('Bearbeiten')}
              </button>
            ) : (
              <>
                <button
                  className="primary"
                  disabled={!dirty}
                  onClick={() => {
                    update(process.id, draft as Partial<ProcessModel>);
                    setDraft({});
                    setEditing(false);
                  }}
                >
                  ✓ {t('Speichern')}
                </button>
                <button
                  onClick={() => {
                    setDraft({});
                    setEditing(false);
                  }}
                >
                  {t('Abbrechen')}
                </button>
                {dirty && <span className="unsaved-note small">● {t('Ungespeicherte Änderungen')}</span>}
              </>
            )}
          </div>
        )}
        <div className="grid">
          {fields.map((f) =>
            inEdit ? (
              <Field key={f.key} def={f} value={values[f.key]} locked={locked(f.key)} onChange={(v) => setDraft((d) => ({ ...d, [f.key]: v }))} />
            ) : (
              <FieldView key={f.key} def={f} value={values[f.key]} />
            ),
          )}
        </div>
      </fieldset>
    </div>
  );
}

const matrixKinds: AssignableKind[] = ['role', 'risk', 'control', 'opportunity', 'kpi'];

function StepMatrix({ process, onOpen }: { process: ProcessModel; onOpen: (elementId: string) => void }) {
  const store = useStore();
  const steps = parseElements(process.xml).filter((e) => activityTypes.includes(e.type));
  const label = (kind: AssignableKind, id: string) => (store[kind] as { id: string; code: string }[]).find((e) => e.id === id)?.code ?? id;

  const cell = (kind: AssignableKind, elementId: string) => {
    const a = process.assignments[elementId] ?? emptyAssignment();
    if (kind === 'role') return a.roles.map((r) => `${label('role', r.roleId)} (${r.raci})`).join(', ');
    return assignedIds(a, kind)
      .map((id) => label(kind, id))
      .join(', ');
  };

  const stepFindings = (elementId: string) =>
    allFindings(store.audit)
      .filter(({ finding: f }) => f.processId === process.id && f.elementId === elementId)
      .map(({ finding: f }) => `${f.code}${isOpenFinding(f) ? '' : ' ✓'}`)
      .join(', ');

  const exportCsv = () => {
    const head = [t('Schritt-ID'), t('Schritt'), t('Typ'), ...matrixKinds.map((k) => t(modules[k].plural)), t('Audit-Feststellungen')];
    const rows = steps.map((s) => [s.id, s.name, s.type, ...matrixKinds.map((k) => cell(k, s.id)), stepFindings(s.id)]);
    const csv = [head, ...rows].map((r) => r.map((v) => `"${v.replace(/"/g, '""')}"`).join(';')).join('\n');
    download(`${process.code}_${t('Schrittmatrix')}.csv`, '﻿' + csv, 'text/csv');
  };

  return (
    <div className="matrix">
      <div className="row space">
        <p className="muted small">
          {t('Alle Aktivitäten inkl. Subprozess-Schritte mit ihren Zuordnungen. Klick auf eine Zeile öffnet den Schritt im Modell.')}
        </p>
        <button onClick={exportCsv}>⬇ CSV (Excel)</button>
      </div>
      <table className="list">
        <thead>
          <tr>
            <th>{t('Schritt')}</th>
            {matrixKinds.map((k) => (
              <th key={k} style={{ color: modules[k].color }}>
                {t(modules[k].plural)}
              </th>
            ))}
            <th style={{ color: modules.audit.color }}>{t('Audit-Feststellungen')}</th>
          </tr>
        </thead>
        <tbody>
          {steps.map((s) => (
            <tr key={s.id} onClick={() => onOpen(s.id)}>
              <td style={{ paddingLeft: 8 + s.depth * 20 }}>
                {s.depth > 0 && <span className="muted">↳ </span>}
                {s.type === 'subProcess' && '▣ '}
                {s.name}
              </td>
              {matrixKinds.map((k) => (
                <td key={k} className="small">
                  {cell(k, s.id) || <span className="muted">–</span>}
                </td>
              ))}
              <td className="small">{stepFindings(s.id) || <span className="muted">–</span>}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Audits that cover this process (shown below the process profile). */
function ProcessAudits({ process }: { process: ProcessModel }) {
  const audits = useStore((s) => s.audit);
  const go = useUi((s) => s.go);
  const related = audits
    .filter((a) => a.processIds.includes(process.id) || a.findings.some((f) => f.processId === process.id))
    .sort((a, b) => auditDate(b).localeCompare(auditDate(a)));
  return (
    <div className="profile">
      <fieldset>
        <legend>{t('Audits zu diesem Prozess')}</legend>
        {related.length === 0 && <div className="muted small">{t('Dieser Prozess wurde noch nicht auditiert.')}</div>}
        {related.map((a) => {
          const open = a.findings.filter((f) => f.processId === process.id && isOpenFinding(f)).length;
          return (
            <div key={a.id} className="row gap audit-line link" onClick={() => go('audit', a.id)}>
              <span className="mono">{a.code}</span>
              <span className="grow">{a.title}</span>
              <span className="small muted">
                {t(a.auditType)} · {auditDate(a) || '–'}
              </span>
              <StatusPill status={a.status} />
              <span className="small">{t('{n} offen', { n: open })}</span>
            </div>
          );
        })}
      </fieldset>
    </div>
  );
}
