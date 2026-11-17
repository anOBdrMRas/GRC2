// Content administration (administrators): additional dropdown values and custom fields per module.
import { useState } from 'react';
import { useStore } from '../store';
import { useUi } from '../ui';
import { kindOrder, modules, type FieldDef, type SectionDef } from '../schema';
import {
  NEW_SECTION,
  customKey,
  customTypeLabels,
  type ConfigModule,
  type ContentConfig,
  type CustomField,
  type CustomFieldType,
} from '../contentConfig';
import { PROFILE_SECTION, profileFields } from './ProcessView';
import { isWfKind } from '../workflow';
import { t } from '../i18n';

const configModules: ConfigModule[] = ['processes', ...kindOrder];
const moduleName = (m: ConfigModule) => (m === 'processes' ? t('Prozesse') : t(modules[m].plural));
const baseSections = (m: ConfigModule): SectionDef[] =>
  m === 'processes' ? [{ title: PROFILE_SECTION, fields: profileFields }] : modules[m].sections;

/** dropdowns whose values are set by a workflow are not extended */
const extendable = (m: ConfigModule, f: FieldDef) =>
  (f.type === 'select' || f.type === 'multiselect') && !(f.key === 'status' && (isWfKind(m) || m === 'mandate'));

const fieldTypeLabel: Partial<Record<FieldDef['type'], string>> = {
  text: 'Text',
  textarea: 'Langtext',
  number: 'Zahl',
  date: 'Datum',
  bool: 'Ja/Nein',
  select: 'Auswahl',
  multiselect: 'Mehrfachauswahl',
  scale: 'Skala',
  ref: 'Verweis',
  refs: 'Verweise',
  iso: 'Normreferenzen',
  readonly: 'automatisch',
};

export function ContentAdmin() {
  const config = useStore((s) => s.config);
  const setConfig = useStore((s) => s.setConfig);
  const [module, setModule] = useState<ConfigModule>('risk');
  const sections = baseSections(module);
  const custom = (config.extraFields[module] ?? []).filter((c) => !c.removed);
  const update = (fn: (c: ContentConfig) => ContentConfig) => setConfig(fn(structuredClone(config)));

  return (
    <div className="content-admin">
      <div className="module-head">
        <h2>{t('Inhaltsverwaltung')}</h2>
      </div>
      <p className="small muted">
        {t(
          'Hier ergänzt die Administration eigene Felder und zusätzliche Auswahlwerte. Die Änderungen gelten sofort in Masken und Excel. Standardfelder und -werte bleiben unverändert, damit bestehende Daten gültig bleiben.',
        )}
      </p>
      <div className="seg content-modules">
        {configModules.map((m) => (
          <button key={m} className={module === m ? 'active' : ''} onClick={() => setModule(m)}>
            {moduleName(m)}
          </button>
        ))}
      </div>

      <div className="content-grid">
        <section className="card">
          <h3>{t('Felder und Auswahlwerte')}</h3>
          {sections.map((sec) => (
            <div key={sec.title} className="content-section">
              <div className="content-section-title">{t(sec.title)}</div>
              {sec.fields
                .filter((f) => f.type !== 'riskGuide')
                .map((f) => (
                  <StandardField key={f.key} module={module} def={f} config={config} update={update} />
                ))}
              {custom
                .filter((c) => c.section === sec.title)
                .map((c) => (
                  <CustomFieldRow key={c.key} module={module} field={c} update={update} />
                ))}
            </div>
          ))}
          {custom.some((c) => !sections.some((s) => s.title === c.section)) && (
            <div className="content-section">
              <div className="content-section-title">{t(NEW_SECTION)}</div>
              {custom
                .filter((c) => !sections.some((s) => s.title === c.section))
                .map((c) => (
                  <CustomFieldRow key={c.key} module={module} field={c} update={update} />
                ))}
            </div>
          )}
        </section>
        <NewField module={module} sections={sections} config={config} update={update} />
      </div>
    </div>
  );
}

type Update = (fn: (c: ContentConfig) => ContentConfig) => void;

/** Option chips; `fixed` values cannot be removed. */
function Options({ fixed, extra, onAdd, onRemove }: { fixed: string[]; extra: string[]; onAdd: (v: string) => void; onRemove: (v: string) => void }) {
  const [value, setValue] = useState('');
  const add = () => {
    const v = value.trim();
    if (v && !fixed.includes(v) && !extra.includes(v)) onAdd(v);
    setValue('');
  };
  return (
    <div className="content-options">
      {fixed.map((o) => (
        <span key={o} className="opt-chip fixed" title={t('Standardwert')}>
          {t(o)}
        </span>
      ))}
      {extra.map((o) => (
        <span key={o} className="opt-chip">
          {o}
          <button className="tag-x" title={t('Entfernen')} onClick={() => onRemove(o)}>
            ×
          </button>
        </span>
      ))}
      <span className="opt-add">
        <input
          value={value}
          placeholder={t('neuer Wert')}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && add()}
          aria-label={t('neuer Wert')}
        />
        <button className="small-btn" onClick={add} disabled={!value.trim()}>
          + {t('Wert')}
        </button>
      </span>
    </div>
  );
}

function StandardField({ module, def, config, update }: { module: ConfigModule; def: FieldDef; config: ContentConfig; update: Update }) {
  const key = `${module}.${def.key}`;
  const extra = config.extraOptions[key] ?? [];
  return (
    <div className="content-field">
      <div className="content-field-head">
        <span title={t('Standardfeld')}>🔒</span> <b>{t(def.label)}</b>
        <span className="muted small"> · {t(fieldTypeLabel[def.type] ?? 'Sonderfeld')}</span>
      </div>
      {extendable(module, def) && (
        <Options
          fixed={(def.options ?? []).filter(Boolean)}
          extra={extra}
          onAdd={(v) =>
            update((c) => {
              c.extraOptions[key] = [...(c.extraOptions[key] ?? []), v];
              return c;
            })
          }
          onRemove={(v) =>
            update((c) => {
              c.extraOptions[key] = (c.extraOptions[key] ?? []).filter((x) => x !== v);
              return c;
            })
          }
        />
      )}
    </div>
  );
}

function CustomFieldRow({ module, field, update }: { module: ConfigModule; field: CustomField; update: Update }) {
  const store = useStore();
  const setNotice = useUi((s) => s.setNotice);
  const change = (patch: Partial<CustomField>) =>
    update((c) => {
      c.extraFields[module] = (c.extraFields[module] ?? []).map((f) => (f.key === field.key ? { ...f, ...patch } : f));
      return c;
    });
  const remove = () => {
    const items = (module === 'processes' ? store.processes : store[module]) as unknown as Record<string, unknown>[];
    const used = items.filter(
      (e) => e[field.key] !== undefined && e[field.key] !== '' && !(Array.isArray(e[field.key]) && !(e[field.key] as unknown[]).length),
    ).length;
    change({ removed: true });
    if (used) setNotice(t('Feld „{name}“ ausgeblendet. Vorhandene Werte (Elemente: {n}) bleiben gespeichert.', { name: field.label, n: used }));
  };
  return (
    <div className="content-field custom">
      <div className="content-field-head">
        <span title={t('Eigenes Feld')}>✎</span>{' '}
        <input className="content-label" value={field.label} aria-label={t('Bezeichnung')} onChange={(e) => change({ label: e.target.value })} />
        <span className="muted small"> · {t(customTypeLabels[field.type])}</span>
        <button className="small-btn danger" onClick={remove}>
          {t('Feld löschen')}
        </button>
      </div>
      {(field.type === 'select' || field.type === 'multiselect') && (
        <Options
          fixed={[]}
          extra={field.options ?? []}
          onAdd={(v) => change({ options: [...(field.options ?? []), v] })}
          onRemove={(v) => change({ options: (field.options ?? []).filter((x) => x !== v) })}
        />
      )}
    </div>
  );
}

function NewField({ module, sections, config, update }: { module: ConfigModule; sections: SectionDef[]; config: ContentConfig; update: Update }) {
  const [label, setLabel] = useState('');
  const [type, setType] = useState<CustomFieldType>('text');
  const [section, setSection] = useState(NEW_SECTION);
  const [options, setOptions] = useState('');
  const sectionTitles = [...sections.map((s) => s.title), NEW_SECTION];
  const add = () => {
    const all = config.extraFields[module] ?? [];
    const field: CustomField = {
      key: customKey(label, [...all.map((f) => f.key), ...sections.flatMap((s) => s.fields.map((f) => f.key))]),
      label: label.trim(),
      type,
      section,
      options:
        type === 'select' || type === 'multiselect'
          ? [
              ...new Set(
                options
                  .split(/[\n,;]/)
                  .map((x) => x.trim())
                  .filter(Boolean),
              ),
            ]
          : undefined,
    };
    update((c) => {
      c.extraFields[module] = [...(c.extraFields[module] ?? []), field];
      return c;
    });
    setLabel('');
    setOptions('');
  };
  return (
    <section className="card content-new">
      <h3>+ {t('Feld hinzufügen')}</h3>
      <label className="field">
        <span className="field-label">{t('Bezeichnung')}</span>
        <input value={label} onChange={(e) => setLabel(e.target.value)} />
      </label>
      <label className="field">
        <span className="field-label">{t('Typ')}</span>
        <select value={type} onChange={(e) => setType(e.target.value as CustomFieldType)}>
          {(Object.keys(customTypeLabels) as CustomFieldType[]).map((k) => (
            <option key={k} value={k}>
              {t(customTypeLabels[k])}
            </option>
          ))}
        </select>
      </label>
      <label className="field">
        <span className="field-label">{t('Abschnitt')}</span>
        <select value={section} onChange={(e) => setSection(e.target.value)}>
          {sectionTitles.map((s) => (
            <option key={s} value={s}>
              {t(s)}
            </option>
          ))}
        </select>
      </label>
      {(type === 'select' || type === 'multiselect') && (
        <label className="field">
          <span className="field-label">
            {t('Auswahlwerte')}
            <span className="hint"> · {t('ein Wert pro Zeile')}</span>
          </span>
          <textarea rows={4} value={options} onChange={(e) => setOptions(e.target.value)} />
        </label>
      )}
      <button className="primary" disabled={!label.trim() || ((type === 'select' || type === 'multiselect') && !options.trim())} onClick={add}>
        + {t('Feld hinzufügen')}
      </button>
      <p className="small muted">{t('Das Feld erscheint sofort in der Maske des Moduls und als Spalte im Excel-Export.')}</p>
    </section>
  );
}
