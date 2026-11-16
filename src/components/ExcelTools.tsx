// Excel export / import buttons with preview (administrators only).
import { useRef, useState } from 'react';
import type { EntityKind } from '../types';
import { useStore } from '../store';
import { useUi } from '../ui';
import { modules } from '../schema';
import { useRights } from '../useRights';
import { downloadBlob } from './common';
import { t } from '../i18n';
import type { Data, ImportResult } from '../excel/workbook';

type Scope = EntityKind | 'processes' | 'all';

const scopeName = (s: Scope) => (s === 'all' ? t('alle Module') : s === 'processes' ? t('Prozesse') : t(modules[s].plural));
const fileBase = (s: Scope) => (s === 'all' ? 'GRC-Studio' : s === 'processes' ? 'Prozesse' : modules[s].plural).replace(/[^\wäöüÄÖÜß-]+/g, '_');
const summaryLabel: Record<string, string> = {
  findings: 'Audit-Feststellungen',
  measurements: 'Messwerte',
  steps: 'Prozessschritte',
  processes: 'Prozesse',
};

const snapshot = (): Data => {
  const s = useStore.getState();
  return {
    risk: s.risk,
    opportunity: s.opportunity,
    control: s.control,
    role: s.role,
    position: s.position,
    mandate: s.mandate,
    kpi: s.kpi,
    user: s.user,
    audit: s.audit,
    processes: s.processes,
  };
};

/** "⬇ Excel" and "⬆ Excel" for one module or all modules. Renders nothing for non-administrators. */
export function ExcelTools({ scope, compact = false }: { scope: Scope; compact?: boolean }) {
  const { isAdmin } = useRights();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState<{ file: string; result: ImportResult } | null>(null);
  if (!isAdmin) return null;

  const exportNow = async () => {
    setBusy(true);
    try {
      const { exportExcel } = await import('../excel/workbook');
      const blob = await exportExcel(snapshot(), scope);
      downloadBlob(`${fileBase(scope)}_${new Date().toISOString().slice(0, 10)}.xlsx`, blob);
    } catch (e) {
      useUi.getState().setNotice(t('Excel-Export fehlgeschlagen: {msg}', { msg: String((e as Error)?.message ?? e) }));
    } finally {
      setBusy(false);
    }
  };

  const read = async (f: File) => {
    setBusy(true);
    try {
      const { importExcel } = await import('../excel/workbook');
      const result = await importExcel(await f.arrayBuffer(), snapshot(), scope === 'all' ? undefined : scope);
      setPreview({ file: f.name, result });
    } catch (e) {
      useUi.getState().setNotice(t('Die Excel-Datei konnte nicht gelesen werden: {msg}', { msg: String((e as Error)?.message ?? e) }));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <button onClick={exportNow} disabled={busy} title={t('Excel exportieren ({name})', { name: scopeName(scope) })}>
        ⬇ {compact ? 'Excel' : t('Excel exportieren')}
      </button>
      <button onClick={() => input.current?.click()} disabled={busy} title={t('Excel importieren ({name})', { name: scopeName(scope) })}>
        ⬆ {compact ? 'Excel' : t('Excel importieren')}
      </button>
      <input
        ref={input}
        type="file"
        accept=".xlsx"
        hidden
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = '';
          if (f) read(f);
        }}
      />
      {preview && <ImportPreview file={preview.file} scope={scope} result={preview.result} onClose={() => setPreview(null)} />}
    </>
  );
}

function ImportPreview({ file, scope, result, onClose }: { file: string; scope: Scope; result: ImportResult; onClose: () => void }) {
  const errors = result.messages.filter((m) => m.level === 'error');
  const warnings = result.messages.filter((m) => m.level === 'warn');
  const apply = () => {
    useStore.setState(result.patch as never);
    useUi.getState().setNotice(t('Import abgeschlossen: {n} Einträge neu oder geändert.', { n: result.changes }));
    onClose();
  };
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal import-preview" role="dialog" aria-label={t('Excel-Import prüfen')} onClick={(e) => e.stopPropagation()}>
        <div className="row space">
          <h3>
            {t('Excel-Import prüfen')}: {scopeName(scope)}
          </h3>
          <button className="tag-x" onClick={onClose} title={t('Schließen')}>
            ×
          </button>
        </div>
        <div className="small muted">{file}</div>
        <table className="list">
          <thead>
            <tr>
              <th>{t('Blatt')}</th>
              <th>{t('Bereich')}</th>
              <th>{t('neu')}</th>
              <th>{t('geändert')}</th>
              <th>{t('unverändert')}</th>
              <th>{t('übersprungen')}</th>
            </tr>
          </thead>
          <tbody>
            {result.summaries.map((s) => (
              <tr key={s.sheet + s.kind}>
                <td>{s.sheet}</td>
                <td>{t(summaryLabel[s.kind] ?? modules[s.kind as EntityKind]?.plural ?? s.kind)}</td>
                <td className={s.created ? 'ok' : 'muted'}>{s.created}</td>
                <td className={s.updated ? 'warn' : 'muted'}>{s.updated}</td>
                <td className="muted">{s.unchanged}</td>
                <td className={s.skipped ? 'warn' : 'muted'}>{s.skipped}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {(errors.length > 0 || warnings.length > 0) && (
          <div className="import-messages">
            <b className="small">
              {t('Hinweise')} ({errors.length + warnings.length})
            </b>
            {[...errors, ...warnings].slice(0, 150).map((m, i) => (
              <div key={i} className={`small ${m.level === 'error' ? 'warn' : ''}`}>
                {m.level === 'error' ? '✖' : '⚠'} {m.sheet}
                {m.row ? ` · ${t('Zeile')} ${m.row}` : ''}: {m.text}
              </div>
            ))}
          </div>
        )}
        <p className="small muted">
          {t(
            'Vorhandene Einträge werden über die ID erkannt und mit allen Spalten der Datei überschrieben; neue IDs werden angelegt. Werte mit Hinweis bleiben leer.',
          )}
        </p>
        <div className="row gap">
          <button className="primary" disabled={!result.changes} onClick={apply}>
            {result.changes ? t('{n} Änderungen importieren', { n: result.changes }) : t('Keine Änderungen')}
          </button>
          <button onClick={onClose}>{t('Abbrechen')}</button>
        </div>
      </div>
    </div>
  );
}
