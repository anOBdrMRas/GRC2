// Content administration: custom fields and additional dropdown values per module, maintained by administrators.
import type { EntityKind } from './types';
import { modules, type FieldDef, type ModuleDef, type SectionDef } from './schema';

export type ConfigModule = EntityKind | 'processes';
export type CustomFieldType = 'text' | 'textarea' | 'number' | 'date' | 'bool' | 'select' | 'multiselect' | 'user';

export interface CustomField {
  /** stable key under which the value is stored on the element ("x_…") */
  key: string;
  label: string;
  type: CustomFieldType;
  /** section title of the module (or NEW_SECTION) */
  section: string;
  options?: string[];
  /** deleted: hidden, stored values are kept */
  removed?: boolean;
}

export interface ContentConfig {
  extraFields: Partial<Record<ConfigModule, CustomField[]>>;
  /** additional values for existing dropdowns, key "module.fieldKey" */
  extraOptions: Record<string, string[]>;
}

export const emptyConfig = (): ContentConfig => ({ extraFields: {}, extraOptions: {} });

export const NEW_SECTION = 'Weitere Angaben';

export const customTypeLabels: Record<CustomFieldType, string> = {
  text: 'Text',
  textarea: 'Langtext',
  number: 'Zahl',
  date: 'Datum',
  bool: 'Ja/Nein',
  select: 'Auswahl',
  multiselect: 'Mehrfachauswahl',
  user: 'Person',
};

/** Key for a new custom field from its label. */
export function customKey(label: string, existing: string[]): string {
  const base =
    'x_' +
    (label
      .toLowerCase()
      .normalize('NFKD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^\w]+/g, '_')
      .replace(/^_+|_+$/g, '')
      .slice(0, 30) || 'feld');
  let key = base;
  for (let i = 2; existing.includes(key); i++) key = `${base}_${i}`;
  return key;
}

const toFieldDef = (c: CustomField): FieldDef => ({
  key: c.key,
  label: c.label,
  type: c.type === 'user' ? 'ref' : c.type,
  refKind: c.type === 'user' ? 'user' : undefined,
  options: c.type === 'select' ? ['', ...(c.options ?? [])] : c.type === 'multiselect' ? (c.options ?? []) : undefined,
  wide: c.type === 'textarea',
  custom: true,
  plain: c.options,
});

/** Sections of a module with the additional dropdown values and custom fields of the configuration. */
export function withConfig(sections: SectionDef[], module: ConfigModule, config: ContentConfig | undefined): SectionDef[] {
  if (!config) return sections;
  const out = sections.map((s) => ({
    ...s,
    fields: s.fields.map((f) => {
      const extra = config.extraOptions[`${module}.${f.key}`];
      if (!extra?.length || !f.options) return f;
      return { ...f, options: [...f.options, ...extra.filter((o) => !f.options!.includes(o))], plain: [...(f.plain ?? []), ...extra] };
    }),
  }));
  for (const c of config.extraFields[module] ?? []) {
    if (c.removed) continue;
    let sec = out.find((s) => s.title === c.section);
    if (!sec) {
      sec = out.find((s) => s.title === NEW_SECTION);
      if (!sec) {
        sec = { title: NEW_SECTION, fields: [] };
        out.push(sec);
      }
    }
    sec.fields = [...sec.fields, toFieldDef(c)];
  }
  return out;
}

/** Module definition including the content configuration. */
export function moduleDef(kind: EntityKind, config: ContentConfig | undefined): ModuleDef {
  return { ...modules[kind], sections: withConfig(modules[kind].sections, kind, config) };
}
