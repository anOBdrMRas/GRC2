import { useRef, useState } from 'react';
import type { AssignableKind, ProcessModel } from '../types';
import { useStore } from '../store';
import { useUi } from '../ui';
import { modules } from '../schema';
import { activityTypes, assignedIds, emptyAssignment, parseElements } from '../logic';
import { BpmnEditor, type BpmnEditorHandle, type SelectedElement } from '../bpmn/BpmnEditor';
import { StepPanel } from './StepPanel';
import { ConfirmButton, Empty, download } from './common';
import { useRights } from '../useRights';
import { t } from '../i18n';

const categories: ProcessModel['category'][] = ['Führungsprozess', 'Kernprozess', 'Unterstützungsprozess'];

export function ProcessView() {
  const processes = useStore((s) => s.processes);
  const createProcess = useStore((s) => s.createProcess);
  const updateProcess = useStore((s) => s.updateProcess);
  const selectedId = useUi((s) => s.selected.processes);
  const select = useUi((s) => s.select);
  const fileInput = useRef<HTMLInputElement>(null);
  const editable = useRights().canEdit('processes');
  const [naming, setNaming] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const process = processes.find((p) => p.id === selectedId) ?? processes[0];

  const importBpmn = async (file: File) => {
    const xml = await file.text();
    const p = createProcess(file.name.replace(/\.(bpmn|xml)$/i, ''));
    updateProcess(p.id, { xml });
    select('processes', p.id);
  };

  return (
    <div className="process-view">
      <aside className="process-list">
        <div className="module-head">
          <h2>{t('Prozesse')}</h2>
        </div>
        {editable ? (
        <div className="row gap">
          <button className="primary" onClick={() => setNaming(true)}>
            {t('+ Prozess')}
          </button>
          <button onClick={() => fileInput.current?.click()}>{t('BPMN importieren')}</button>
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
        ) : (
          <span className="badge readonly">{t('Nur Lesen')}</span>
        )}
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
            <input id="new-process-title" autoFocus placeholder={t('Name des Prozesses')} value={newTitle} onChange={(e) => setNewTitle(e.target.value)} />
            <button type="submit" className="primary" disabled={!newTitle.trim()}>
              {t('Anlegen')}
            </button>
          </form>
        )}
        {categories.map((cat) => (
          <div key={cat} className="proc-group">
            <div className="proc-group-title">{t(cat)}</div>
            {processes
              .filter((p) => p.category === cat)
              .map((p) => (
                <div key={p.id} className={`proc-item ${p.id === process?.id ? 'selected' : ''}`} onClick={() => select('processes', p.id)}>
                  <div>
                    <span className="mono">{p.code}</span> {p.title}
                  </div>
                  <div className="muted small">
                    v{p.version} · {t(p.status)}
                  </div>
                </div>
              ))}
          </div>
        ))}
      </aside>
      {process ? <ProcessWorkspace key={process.id} process={process} /> : <Empty>{t('Noch keine Prozesse vorhanden.')}</Empty>}
    </div>
  );
}

type Tab = 'model' | 'profile' | 'matrix';

function ProcessWorkspace({ process }: { process: ProcessModel }) {
  const [tab, setTab] = useState<Tab>('model');
  const [selected, setSelected] = useState<SelectedElement | null>(null);
  const editor = useRef<BpmnEditorHandle>(null);
  const updateProcess = useStore((s) => s.updateProcess);
  const deleteProcess = useStore((s) => s.deleteProcess);
  const focusElementId = useUi((s) => s.focusElementId);
  const clearFocus = useUi((s) => s.clearFocus);
  const openStep = useUi((s) => s.openStep);
  const select = useUi((s) => s.select);
  const editable = useRights().canEdit('processes');

  // A focus request coming from a module switches back to the model tab.
  if (focusElementId && tab !== 'model') setTab('model');

  const fileBase = `${process.code}_${process.title.replace(/[^\wäöüÄÖÜß-]+/g, '_')}`;

  return (
    <section className="workspace">
      <div className="workspace-head">
        <div>
          <div className="muted small">
            {process.code} · {t(process.category)} · v{process.version} · {t(process.status)}
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
          {editable ? (
            <ConfirmButton
              label={t('Löschen')}
              confirmLabel={t('Prozess wirklich löschen?')}
              onConfirm={() => {
                deleteProcess(process.id);
                select('processes', undefined);
              }}
            />
          ) : (
            <span className="badge readonly">{t('Nur Lesen')}</span>
          )}
        </div>
      </div>

      {tab === 'model' && (
        <div className="model-area">
          <BpmnEditor
            ref={editor}
            process={process}
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
          <ProcessProfile process={process} />
        </fieldset>
      )}
      {tab === 'matrix' && <StepMatrix process={process} onOpen={(el) => openStep(process.id, el)} />}
    </section>
  );
}

function ProcessProfile({ process }: { process: ProcessModel }) {
  const update = useStore((s) => s.updateProcess);
  const roles = useStore((s) => s.role);
  const set = (patch: Partial<ProcessModel>) => update(process.id, patch);
  const text = (key: 'code' | 'title' | 'version', label: string) => (
    <label className="field">
      <span className="field-label">{t(label)}</span>
      <input value={process[key]} onChange={(e) => set({ [key]: e.target.value })} />
    </label>
  );
  const area = (key: 'description' | 'inputs' | 'outputs' | 'resources', label: string, hint?: string) => (
    <label className="field wide">
      <span className="field-label">
        {t(label)}
        {hint && <span className="hint"> · {t(hint)}</span>}
      </span>
      <textarea rows={3} value={process[key] ?? ''} onChange={(e) => set({ [key]: e.target.value })} />
    </label>
  );

  return (
    <div className="profile">
      <fieldset>
        <legend>{t('Prozesssteckbrief (ISO 9001 4.4)')}</legend>
        <div className="grid">
          {text('code', 'ID')}
          {text('title', 'Bezeichnung')}
          <label className="field">
            <span className="field-label">{t('Prozesskategorie')}</span>
            <select value={process.category} onChange={(e) => set({ category: e.target.value as ProcessModel['category'] })}>
              {categories.map((c) => (
                <option key={c} value={c}>
                  {t(c)}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span className="field-label">{t('Prozessverantwortlicher')}</span>
            <select value={process.ownerRoleId} onChange={(e) => set({ ownerRoleId: e.target.value })}>
              <option value="">{t('— nicht zugewiesen —')}</option>
              {roles.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.code} {r.title}
                </option>
              ))}
            </select>
          </label>
          {text('version', 'Version')}
          <label className="field">
            <span className="field-label">{t('Freigabestatus')}</span>
            <select value={process.status} onChange={(e) => set({ status: e.target.value })}>
              {['Entwurf', 'In Prüfung', 'Freigegeben', 'Archiviert'].map((s) => (
                <option key={s} value={s}>
                  {t(s)}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span className="field-label">{t('Nächste Überprüfung')}</span>
            <input type="date" value={process.nextReview} onChange={(e) => set({ nextReview: e.target.value })} />
          </label>
          <label className="field">
            <span className="field-label">{t('Relevante Managementsysteme')}</span>
            <div className="checks">
              {['ISO 9001', 'ISO 27001', 'ISO 37301'].map((s) => (
                <label key={s} className="checkbox">
                  <input
                    type="checkbox"
                    checked={process.standards.includes(s)}
                    onChange={(e) => set({ standards: e.target.checked ? [...process.standards, s] : process.standards.filter((x) => x !== s) })}
                  />
                  {s}
                </label>
              ))}
            </div>
          </label>
          {area('description', 'Zweck & Anwendungsbereich')}
          {area('inputs', 'Eingaben (Inputs)', 'ISO 9001 4.4.1 a')}
          {area('outputs', 'Ergebnisse (Outputs)', 'ISO 9001 4.4.1 a')}
          {area('resources', 'Ressourcen', 'ISO 9001 4.4.1 d')}
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

  const exportCsv = () => {
    const head = [t('Schritt-ID'), t('Schritt'), t('Typ'), ...matrixKinds.map((k) => t(modules[k].plural))];
    const rows = steps.map((s) => [s.id, s.name, s.type, ...matrixKinds.map((k) => cell(k, s.id))]);
    const csv = [head, ...rows].map((r) => r.map((v) => `"${v.replace(/"/g, '""')}"`).join(';')).join('\n');
    download(`${process.code}_${t('Schrittmatrix')}.csv`, '﻿' + csv, 'text/csv');
  };

  return (
    <div className="matrix">
      <div className="row space">
        <p className="muted small">{t('Alle Aktivitäten inkl. Subprozess-Schritte mit ihren Zuordnungen. Klick auf eine Zeile öffnet den Schritt im Modell.')}</p>
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
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
