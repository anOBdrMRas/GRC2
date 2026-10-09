import { useMemo, useRef, useState, type ReactNode } from 'react';
import type { Level, Traffic } from '../logic';
import { useUi, type ExportFile } from '../ui';
import { levelLabel } from '../logic';
import { t } from '../i18n';

export function LevelBadge({ level, score }: { level: Level; score?: number }) {
  return (
    <span className={`badge level-${level}`}>
      {t(levelLabel[level])}
      {score !== undefined && ` (${score})`}
    </span>
  );
}

export function TrafficLight({ status }: { status: Traffic }) {
  const label = t({ green: 'im Ziel', yellow: 'Warnung', red: 'kritisch', none: 'keine Werte' }[status]);
  return <span className={`dot dot-${status}`} title={label} />;
}

export function Tag({ children, color, onRemove, onClick }: { children: ReactNode; color?: string; onRemove?: () => void; onClick?: () => void }) {
  return (
    <span className="tag" style={color ? { borderColor: color } : undefined}>
      <span className={onClick ? 'link' : undefined} onClick={onClick}>
        {children}
      </span>
      {onRemove && (
        <button className="tag-x" onClick={onRemove} title={t('Entfernen')}>
          ×
        </button>
      )}
    </span>
  );
}

export interface PickOption {
  id: string;
  label: string;
  sub?: string;
}

/** Searchable picker used to add references (entities, ISO clauses, …). */
export function Picker({
  options,
  exclude = [],
  placeholder = t('Suchen und hinzufügen…'),
  onPick,
  onCreate,
}: {
  options: PickOption[];
  exclude?: string[];
  placeholder?: string;
  onPick: (id: string) => void;
  onCreate?: (label: string) => void;
}) {
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const blurTimer = useRef<number>(undefined);
  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return options
      .filter((o) => !exclude.includes(o.id))
      .filter((o) => !needle || `${o.label} ${o.sub ?? ''}`.toLowerCase().includes(needle))
      .slice(0, 50);
  }, [options, exclude, q]);

  const pick = (id: string) => {
    onPick(id);
    setQ('');
  };

  return (
    <div className="picker">
      <input
        value={q}
        placeholder={placeholder}
        onChange={(e) => {
          setQ(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => (blurTimer.current = window.setTimeout(() => setOpen(false), 150))}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            if (filtered[0]) pick(filtered[0].id);
            else if (onCreate && q.trim()) {
              onCreate(q.trim());
              setQ('');
            }
          }
          if (e.key === 'Escape') setOpen(false);
        }}
      />
      {open && (filtered.length > 0 || (onCreate && q.trim())) && (
        <div className="picker-list" onMouseDown={() => window.clearTimeout(blurTimer.current)}>
          {filtered.map((o) => (
            <div key={o.id} className="picker-item" onMouseDown={(e) => e.preventDefault()} onClick={() => pick(o.id)}>
              <div>{o.label}</div>
              {o.sub && <div className="muted small">{o.sub}</div>}
            </div>
          ))}
          {onCreate && q.trim() && (
            <div
              className="picker-item create"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                onCreate(q.trim());
                setQ('');
              }}
            >
              {t('+ Neu anlegen: „{name}“', { name: q.trim() })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <div className="empty">{children}</div>;
}

/** Opens the export dialog, which offers download and copy-to-clipboard. */
export function download(filename: string, content: string, type = 'application/octet-stream') {
  useUi.getState().setExportFile({ filename, content, type });
}

function saveFile({ filename, content, type }: ExportFile) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function ExportDialog() {
  const file = useUi((s) => s.exportFile);
  const close = useUi((s) => s.setExportFile);
  const [copied, setCopied] = useState(false);
  const area = useRef<HTMLTextAreaElement>(null);
  if (!file) return null;
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(file.content);
      setCopied(true);
    } catch {
      area.current?.select();
    }
  };
  return (
    <div className="modal-backdrop" onClick={() => close(null)}>
      <div className="modal" role="dialog" aria-label="Export" onClick={(e) => e.stopPropagation()}>
        <div className="row space">
          <h3>{t('Export')}: {file.filename}</h3>
          <button className="tag-x" onClick={() => close(null)} title={t('Schließen')}>
            ×
          </button>
        </div>
        <p className="muted small">{t('Falls der Download in dieser Umgebung blockiert ist, den Inhalt kopieren und als Datei speichern.')}</p>
        <textarea id="export-content" ref={area} readOnly rows={14} value={file.content} />
        <div className="row gap">
          <button className="primary" onClick={() => saveFile(file)}>
            {t('Herunterladen')}
          </button>
          <button onClick={copy}>{copied ? t('Kopiert ✓') : t('In Zwischenablage kopieren')}</button>
        </div>
      </div>
    </div>
  );
}

export function Notice() {
  const notice = useUi((s) => s.notice);
  const setNotice = useUi((s) => s.setNotice);
  if (!notice) return null;
  return (
    <div className="notice" role="alert">
      {notice}
      <button className="tag-x" onClick={() => setNotice(null)} title={t('Schließen')}>
        ×
      </button>
    </div>
  );
}

/** Two-step button: the first click arms it, the second executes. Replaces window.confirm. */
export function ConfirmButton({ label, confirmLabel, onConfirm, className = 'danger' }: { label: string; confirmLabel: string; onConfirm: () => void; className?: string }) {
  const [armed, setArmed] = useState(false);
  const timer = useRef<number>(undefined);
  return (
    <button
      className={`${className} ${armed ? 'armed' : ''}`}
      onClick={() => {
        window.clearTimeout(timer.current);
        if (armed) {
          setArmed(false);
          onConfirm();
        } else {
          setArmed(true);
          timer.current = window.setTimeout(() => setArmed(false), 4000);
        }
      }}
    >
      {armed ? confirmLabel : label}
    </button>
  );
}

const statusTone: Record<string, string> = {
  Freigegeben: 'ok',
  Aktiv: 'ok',
  'In Prüfung': 'warn',
  Entwurf: 'neutral',
  Inaktiv: 'neutral',
  Archiviert: 'neutral',
  Gesperrt: 'bad',
};

export function StatusPill({ status }: { status: string }) {
  return <span className={`pill pill-${statusTone[status] ?? 'neutral'}`}>{t(status)}</span>;
}
