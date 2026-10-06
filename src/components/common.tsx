import { useMemo, useRef, useState, type ReactNode } from 'react';
import type { Level, Traffic } from '../logic';
import { levelLabel } from '../logic';

export function LevelBadge({ level, score }: { level: Level; score?: number }) {
  return (
    <span className={`badge level-${level}`}>
      {levelLabel[level]}
      {score !== undefined && ` (${score})`}
    </span>
  );
}

export function TrafficLight({ status }: { status: Traffic }) {
  const label = { green: 'im Ziel', yellow: 'Warnung', red: 'kritisch', none: 'keine Werte' }[status];
  return <span className={`dot dot-${status}`} title={label} />;
}

export function Tag({ children, color, onRemove, onClick }: { children: ReactNode; color?: string; onRemove?: () => void; onClick?: () => void }) {
  return (
    <span className="tag" style={color ? { borderColor: color } : undefined}>
      <span className={onClick ? 'link' : undefined} onClick={onClick}>
        {children}
      </span>
      {onRemove && (
        <button className="tag-x" onClick={onRemove} title="Entfernen">
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
  placeholder = 'Suchen und hinzufügen…',
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
              + Neu anlegen: „{q.trim()}“
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

export function download(filename: string, content: string, type = 'application/octet-stream') {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
