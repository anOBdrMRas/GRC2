import { useState } from 'react';
import type { FieldDef } from '../schema';
import { modules } from '../schema';
import type { AnyEntity, Measurement } from '../types';
import { annexA, isoById, isoCatalog, isoLabel } from '../iso';
import { useStore } from '../store';
import { useUi } from '../ui';
import { Picker, Tag } from './common';
import { today } from '../logic';

const annexAOptions = annexA.map(([id, title]) => ({ id, label: `${id} ${title}` }));
const isoOptions = isoCatalog.map((r) => ({ id: r.id, label: `${r.standard} ${r.clause}`, sub: r.title }));

export function Field({ def, value, onChange }: { def: FieldDef; value: unknown; onChange: (v: unknown) => void }) {
  return (
    <label className={`field ${def.wide || def.type === 'textarea' ? 'wide' : ''}`}>
      <span className="field-label">
        {def.label}
        {def.hint && <span className="hint"> · {def.hint}</span>}
      </span>
      <FieldInput def={def} value={value} onChange={onChange} />
    </label>
  );
}

function FieldInput({ def, value, onChange }: { def: FieldDef; value: unknown; onChange: (v: unknown) => void }) {
  const store = useStore();
  const go = useUi((s) => s.go);

  switch (def.type) {
    case 'text':
      return <input value={(value as string) ?? ''} onChange={(e) => onChange(e.target.value)} />;
    case 'textarea':
      return <textarea rows={3} value={(value as string) ?? ''} onChange={(e) => onChange(e.target.value)} />;
    case 'number':
      return <input type="number" value={(value as number) ?? 0} onChange={(e) => onChange(Number(e.target.value))} />;
    case 'date':
      return <input type="date" value={(value as string) ?? ''} onChange={(e) => onChange(e.target.value)} />;
    case 'bool':
      return (
        <span className="checkbox">
          <input type="checkbox" checked={!!value} onChange={(e) => onChange(e.target.checked)} /> {value ? 'Ja' : 'Nein'}
        </span>
      );
    case 'select':
      return (
        <select value={(value as string) ?? ''} onChange={(e) => onChange(e.target.value)}>
          {def.options!.map((o) => (
            <option key={o} value={o}>
              {o === 'higher' ? 'Höher ist besser' : o === 'lower' ? 'Niedriger ist besser' : o}
            </option>
          ))}
        </select>
      );
    case 'scale':
      return (
        <div className="scale">
          {[1, 2, 3, 4, 5].map((n) => (
            <button key={n} type="button" className={value === n ? 'active' : ''} onClick={() => onChange(n)}>
              {n}
            </button>
          ))}
        </div>
      );
    case 'multiselect': {
      const v = (value as string[]) ?? [];
      return (
        <div className="checks">
          {def.options!.map((o) => (
            <label key={o} className="checkbox">
              <input type="checkbox" checked={v.includes(o)} onChange={(e) => onChange(e.target.checked ? [...v, o] : v.filter((x) => x !== o))} />
              {o}
            </label>
          ))}
        </div>
      );
    }
    case 'ref': {
      const items = store[def.refKind!] as AnyEntity[];
      return (
        <select value={(value as string) ?? ''} onChange={(e) => onChange(e.target.value)}>
          <option value="">— nicht zugewiesen —</option>
          {items.map((i) => (
            <option key={i.id} value={i.id}>
              {i.code} {i.title}
            </option>
          ))}
        </select>
      );
    }
    case 'refs': {
      const v = (value as string[]) ?? [];
      const items = store[def.refKind!] as AnyEntity[];
      const byId = new Map(items.map((i) => [i.id, i]));
      return (
        <div>
          <div className="tags">
            {v.map((id) => (
              <Tag key={id} color={modules[def.refKind!].color} onClick={() => go(def.refKind!, id)} onRemove={() => onChange(v.filter((x) => x !== id))}>
                {byId.get(id) ? `${byId.get(id)!.code} ${byId.get(id)!.title}` : id}
              </Tag>
            ))}
          </div>
          <Picker options={items.map((i) => ({ id: i.id, label: `${i.code} ${i.title}` }))} exclude={v} onPick={(id) => onChange([...v, id])} />
        </div>
      );
    }
    case 'iso':
    case 'annexA': {
      const v = (value as string[]) ?? [];
      const opts = def.type === 'iso' ? isoOptions : annexAOptions;
      return (
        <div>
          <div className="tags">
            {v.map((id) => (
              <Tag key={id} onRemove={() => onChange(v.filter((x) => x !== id))}>
                <span title={def.type === 'iso' ? isoById.get(id)?.title : annexA.find(([a]) => a === id)?.[1]}>
                  {def.type === 'iso' ? isoLabel(id) : id}
                </span>
              </Tag>
            ))}
          </div>
          <Picker options={opts} exclude={v} placeholder="Normkapitel suchen (z. B. 6.1, A.5.19, Lieferant)…" onPick={(id) => onChange([...v, id])} />
        </div>
      );
    }
    case 'measurements':
      return <Measurements value={(value as Measurement[]) ?? []} onChange={onChange} />;
  }
}

function Measurements({ value, onChange }: { value: Measurement[]; onChange: (v: Measurement[]) => void }) {
  const [date, setDate] = useState(today());
  const [val, setVal] = useState('');
  const sorted = [...value].sort((a, b) => a.date.localeCompare(b.date));
  return (
    <div>
      <table className="mini">
        <thead>
          <tr>
            <th>Datum</th>
            <th>Wert</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {sorted.map((m, i) => (
            <tr key={i}>
              <td>{m.date}</td>
              <td>{m.value}</td>
              <td>
                <button className="link-btn" onClick={() => onChange(sorted.filter((_, j) => j !== i))}>
                  entfernen
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="row gap">
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        <input type="number" placeholder="Wert" value={val} onChange={(e) => setVal(e.target.value)} />
        <button
          type="button"
          disabled={val === ''}
          onClick={() => {
            onChange([...sorted, { date, value: Number(val) }].sort((a, b) => a.date.localeCompare(b.date)));
            setVal('');
          }}
        >
          Messwert erfassen
        </button>
      </div>
    </div>
  );
}
