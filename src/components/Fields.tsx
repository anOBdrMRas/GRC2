import { useState } from 'react';
import type { FieldDef } from '../schema';
import { modules } from '../schema';
import type { AnyEntity, Measurement, RoleMember } from '../types';
import { systemRoleConflicts, systemRoles } from '../permissions';
import { annexA, isoById, isoCatalog, isoLabel } from '../iso';
import { useStore } from '../store';
import { useUi } from '../ui';
import { Picker, Tag } from './common';
import { today } from '../logic';
import { t } from '../i18n';

const annexAOptions = annexA.map(([id, title]) => ({ id, label: `${id} ${title}` }));
// ISO 27001 titles are kept in English; ISO 9001 / 37301 titles are German and get translated.
const isoTitle = (id: string) => {
  const r = isoById.get(id);
  return !r ? '' : r.standard === 'ISO 27001' ? r.title : t(r.title);
};
const isoOptions = () => isoCatalog.map((r) => ({ id: r.id, label: `${r.standard} ${r.clause}`, sub: isoTitle(r.id) }));

export function Field({ def, value, onChange, entityId }: { def: FieldDef; value: unknown; onChange: (v: unknown) => void; entityId?: string }) {
  return (
    <label className={`field ${def.wide || def.type === 'textarea' ? 'wide' : ''}`}>
      <span className="field-label">
        {t(def.label)}
        {def.hint && <span className="hint"> · {t(def.hint)}</span>}
      </span>
      <FieldInput def={def} value={value} onChange={onChange} entityId={entityId} />
    </label>
  );
}

function FieldInput({ def, value, onChange, entityId }: { def: FieldDef; value: unknown; onChange: (v: unknown) => void; entityId?: string }) {
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
          <input type="checkbox" checked={!!value} onChange={(e) => onChange(e.target.checked)} /> {value ? t('Ja') : t('Nein')}
        </span>
      );
    case 'select':
      return (
        <select value={(value as string) ?? ''} onChange={(e) => onChange(e.target.value)}>
          {def.options!.map((o) => (
            <option key={o} value={o}>
              {o === 'higher' ? t('Höher ist besser') : o === 'lower' ? t('Niedriger ist besser') : t(o)}
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
              {t(o)}
            </label>
          ))}
        </div>
      );
    }
    case 'ref': {
      const items = store[def.refKind!] as AnyEntity[];
      return (
        <select value={(value as string) ?? ''} onChange={(e) => onChange(e.target.value)}>
          <option value="">{t('— nicht zugewiesen —')}</option>
          {def.allowNA && <option value="n/a">{t('n/a (nicht anwendbar)')}</option>}
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
      const opts = def.type === 'iso' ? isoOptions() : annexAOptions;
      return (
        <div>
          <div className="tags">
            {v.map((id) => (
              <Tag key={id} onRemove={() => onChange(v.filter((x) => x !== id))}>
                <span title={def.type === 'iso' ? isoTitle(id) : annexA.find(([a]) => a === id)?.[1]}>
                  {def.type === 'iso' ? isoLabel(id) : id}
                </span>
              </Tag>
            ))}
          </div>
          <Picker options={opts} exclude={v} placeholder={t('Normkapitel suchen (z. B. 6.1, A.5.19, Lieferant)…')} onPick={(id) => onChange([...v, id])} />
        </div>
      );
    }
    case 'measurements':
      return <Measurements value={(value as Measurement[]) ?? []} onChange={onChange} />;
    case 'members':
      return <Members value={(value as RoleMember[]) ?? []} onChange={onChange} />;
    case 'readonly':
      return <div className="readonly-value mono">{(value as string) || '–'}</div>;
    case 'roleChecks':
      return <RoleChecks value={(value as string[]) ?? []} selfId={entityId} onChange={onChange} />;
    case 'systemRoles':
      return <SystemRolePicker value={(value as string[]) ?? []} onChange={onChange} />;
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
            <th>{t('Datum')}</th>
            <th>{t('Wert')}</th>
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
                  {t('entfernen')}
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="row gap">
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        <input type="number" placeholder={t('Wert')} value={val} onChange={(e) => setVal(e.target.value)} />
        <button
          type="button"
          disabled={val === ''}
          onClick={() => {
            onChange([...sorted, { date, value: Number(val) }].sort((a, b) => a.date.localeCompare(b.date)));
            setVal('');
          }}
        >
          {t('Messwert erfassen')}
        </button>
      </div>
    </div>
  );
}

function Members({ value, onChange }: { value: RoleMember[]; onChange: (v: RoleMember[]) => void }) {
  const users = useStore((s) => s.user);
  const go = useUi((s) => s.go);
  const set = (i: number, patch: Partial<RoleMember>) => onChange(value.map((m, j) => (j === i ? { ...m, ...patch } : m)));
  return (
    <div>
      {value.length > 0 && (
        <table className="mini wide-table">
          <thead>
            <tr>
              <th>{t('Person')}</th>
              <th>{t('Funktion')}</th>
              <th>{t('seit')}</th>
              <th title={t('Stellvertretung ist eingearbeitet (ISO 27001 A.5.29)')}>{t('eingearbeitet')}</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {value.map((m, i) => {
              const u = users.find((x) => x.id === m.userId);
              return (
                <tr key={m.userId + m.function}>
                  <td>
                    <span className="link" onClick={() => go('user', m.userId)}>
                      {u?.title ?? m.userId}
                    </span>
                    {u && u.status !== 'Aktiv' && <span className="warn small"> ({t(u.status)})</span>}
                  </td>
                  <td>
                    <select value={m.function} onChange={(e) => set(i, { function: e.target.value as RoleMember['function'] })}>
                      <option value="Inhaber">{t('Inhaber')}</option>
                      <option value="Stellvertretung">{t('Stellvertretung')}</option>
                    </select>
                  </td>
                  <td>
                    <input type="date" value={m.since} onChange={(e) => set(i, { since: e.target.value })} />
                  </td>
                  <td>
                    <input type="checkbox" checked={m.inducted} onChange={(e) => set(i, { inducted: e.target.checked })} />
                  </td>
                  <td>
                    <button type="button" className="tag-x" title={t('Entfernen')} onClick={() => onChange(value.filter((_, j) => j !== i))}>
                      ×
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
      <Picker
        options={users.map((u) => ({ id: u.id, label: u.title, sub: [u.jobTitle, u.department].filter(Boolean).join(' · ') }))}
        exclude={value.map((m) => m.userId)}
        placeholder={t('Person aus der Benutzerverwaltung hinzufügen…')}
        onPick={(userId) => onChange([...value, { userId, function: 'Inhaber', since: today(), inducted: true }])}
      />
    </div>
  );
}

function SystemRolePicker({ value, onChange }: { value: string[]; onChange: (v: string[]) => void }) {
  const conflicts = systemRoleConflicts.filter(([a, b]) => value.includes(a) && value.includes(b));
  return (
    <div>
      <div className="sysrole-grid">
        {systemRoles.map((r) => (
          <label key={r.id} className={`sysrole ${value.includes(r.id) ? 'on' : ''}`}>
            <input type="checkbox" checked={value.includes(r.id)} onChange={(e) => onChange(e.target.checked ? [...value, r.id] : value.filter((x) => x !== r.id))} />
            <span>
              <b>{t(r.name)}</b>
              <span className="muted small"> {t(r.description)}</span>
            </span>
          </label>
        ))}
      </div>
      {conflicts.map(([a, b, why]) => (
        <div key={a + b} className="warn-box small">
          ⚠ {t('Unvereinbare Systemrollen')}: {t(systemRoles.find((r) => r.id === a)?.name ?? a)} + {t(systemRoles.find((r) => r.id === b)?.name ?? b)}. {t(why)}
        </div>
      ))}
    </div>
  );
}

function RoleChecks({ value, selfId, onChange }: { value: string[]; selfId?: string; onChange: (v: string[]) => void }) {
  const roles = useStore((s) => s.role).filter((r) => r.id !== selfId);
  return (
    <div className="role-checks">
      {roles.map((r) => (
        <label key={r.id} className={`checkbox role-check ${value.includes(r.id) ? 'on' : ''}`}>
          <input type="checkbox" checked={value.includes(r.id)} onChange={(e) => onChange(e.target.checked ? [...value, r.id] : value.filter((x) => x !== r.id))} />
          <span className="mono">{r.code}</span> {r.title}
        </label>
      ))}
    </div>
  );
}
