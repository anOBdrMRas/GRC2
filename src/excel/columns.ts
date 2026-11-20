// Excel columns derived from the module schema (src/schema.ts): one definition for export and import.
import type { EntityKind } from '../types';
import { modules, type FieldDef } from '../schema';
import { withConfig, type ContentConfig } from '../contentConfig';
import { useStore } from '../store';
import { t } from '../i18n';
import { en } from '../i18n.en';

/** treatment actions per risk in the Excel sheet (more are kept on import) */
export const RISK_ACTION_COLS = 6;

export type ColKind =
  | 'id'
  | 'text'
  | 'long'
  | 'number'
  | 'date'
  | 'bool'
  | 'select'
  | 'multi'
  | 'ref'
  | 'refs'
  | 'iso'
  | 'annex'
  | 'sysroles'
  | 'computed';

export interface Col {
  /** stable key, also written into the header comment ("Feld im GRC Studio: key") */
  key: string;
  /** German label (translated at export time) */
  label: string;
  section: string;
  kind: ColKind;
  /** for ref/refs: the referenced module ('user' = by name, 'processes' = process ID) */
  refKind?: EntityKind | 'processes';
  allowNA?: boolean;
  options?: string[];
  /** number: allowed range 1..max (scales) */
  max?: number;
  required?: boolean;
  hint?: string;
  width: number;
  /** label variables (e.g. role number) */
  vars?: Record<string, string | number>;
}

const widthOf = (k: ColKind) =>
  ({
    id: 11,
    text: 24,
    long: 40,
    number: 13,
    date: 12,
    bool: 10,
    select: 18,
    multi: 24,
    ref: 16,
    refs: 20,
    iso: 20,
    annex: 20,
    sysroles: 20,
    computed: 16,
  })[k];

function fieldCols(f: FieldDef, section: string): Col[] {
  const c = (k: ColKind, extra: Partial<Col> = {}): Col[] => [
    {
      key: f.key,
      label: f.label,
      section,
      kind: k,
      hint: f.hint,
      width: widthOf(k),
      required: (f.key === 'code' && f.type !== 'readonly') || f.key === 'title',
      ...extra,
    },
  ];
  switch (f.type) {
    case 'readonly':
      return f.key === 'code' ? c('id', { hint: f.hint }) : [];
    case 'riskActions':
      return Array.from({ length: RISK_ACTION_COLS }, (_, k) => k + 1).flatMap((i) => [
        { key: `actions[${i - 1}].text`, label: 'Maßnahme {i}', vars: { i }, section, kind: 'long' as ColKind, width: 34 },
        {
          key: `actions[${i - 1}].ownerUserId`,
          label: 'Verantwortlich für Maßnahme {i}',
          vars: { i },
          section,
          kind: 'ref' as ColKind,
          refKind: 'user' as EntityKind,
          width: 22,
        },
      ]);
    case 'text':
      return f.key === 'code' ? c('id') : c('text');
    case 'textarea':
      return c('long');
    case 'number':
      return c('number');
    case 'scale':
      return c('number', { max: f.max ?? 5, hint: f.hint ?? `1–${f.max ?? 5}` });
    case 'date':
      return c('date');
    case 'bool':
      return c('bool');
    case 'select':
      return c('select', { options: f.options?.filter(Boolean) });
    case 'multiselect':
      return c('multi', { options: f.options, hint: f.hint ?? 'mehrere Werte mit Komma trennen' });
    case 'ref':
      return c('ref', { refKind: f.refKind, allowNA: f.allowNA, width: f.refKind === 'user' ? 22 : 16 });
    case 'refs':
      return c('refs', { refKind: f.refKind });
    case 'roleList':
      return c('refs', { refKind: 'role' });
    case 'processRefs':
      return c('refs', { refKind: 'processes' });
    case 'iso':
      return c('iso');
    case 'annexA':
      return c('annex');
    case 'systemRoles':
      return c('sysroles');
    case 'positionRoles':
      return [1, 2, 3, 4, 5].flatMap((i) => [
        {
          key: `roles[${i - 1}].roleId`,
          label: 'Rolle {i} (Rollen-ID)',
          vars: { i },
          section,
          kind: 'ref' as ColKind,
          refKind: 'role' as EntityKind,
          width: 12,
        },
        { key: `roles[${i - 1}].comment`, label: 'Kommentar zu Rolle {i}', vars: { i }, section, kind: 'text' as ColKind, width: 26 },
      ]);
    case 'positionHolders':
      return [
        {
          key: 'user.title',
          label: 'Stelleninhaber (Name)',
          section,
          kind: 'refs',
          refKind: 'user',
          width: 24,
          hint: 'Vor- und Nachname; mehrere Personen mit Komma trennen.',
        },
        { key: 'user.positionSince', label: 'Stelle seit', section, kind: 'date', width: 12 },
      ];
    default:
      // measurements, findings (own sheets), roleRelations, mandates (derived views)
      return [];
  }
}

/** Columns of a module sheet. */
export function columnsOf(kind: EntityKind, config: ContentConfig | undefined = useStore.getState().config): Col[] {
  // incl. custom fields and dropdown values of the content administration
  const cols = withConfig(modules[kind].sections, kind, config).flatMap((s) => s.fields.flatMap((f) => fieldCols(f, s.title)));
  // the ID always comes first
  cols.sort((a, b) => (a.kind === 'id' ? -1 : 0) - (b.kind === 'id' ? -1 : 0));
  if (kind === 'risk')
    cols.push(
      ...(['#score', '#high'] as const).map((key) => ({
        key,
        label: { '#score': 'Risiko-Score', '#high': 'Höheres Risiko?' }[key],
        section: 'Ergebnis (berechnet)',
        kind: 'computed' as ColKind,
        width: 14,
        hint: 'Wird berechnet – beim Import ignoriert.',
      })),
    );
  if (kind === 'mandate')
    cols.push({
      key: '#state',
      label: 'Zustand',
      section: 'Ergebnis (berechnet)',
      kind: 'computed',
      width: 16,
      hint: 'Wird berechnet – beim Import ignoriert.',
    });
  return cols;
}

export const findingCols: Col[] = [
  { key: 'auditCode', label: 'Audit-ID', section: 'Feststellung', kind: 'ref', refKind: 'audit', width: 11, required: true },
  { key: 'code', label: 'ID', section: 'Feststellung', kind: 'id', width: 9, required: true },
  {
    key: 'type',
    label: 'Art',
    section: 'Feststellung',
    kind: 'select',
    options: ['Hauptabweichung', 'Nebenabweichung', 'Beobachtung', 'Verbesserungspotenzial', 'Positive Feststellung'],
    width: 20,
  },
  { key: 'clause', label: 'Normkapitel', section: 'Feststellung', kind: 'iso', width: 16 },
  { key: 'description', label: 'Beschreibung', section: 'Feststellung', kind: 'long', width: 40 },
  { key: 'evidence', label: 'Nachweis / Beleg', section: 'Feststellung', kind: 'long', width: 30 },
  { key: 'processId', label: 'Prozess', section: 'Bezug', kind: 'ref', refKind: 'processes', width: 11 },
  { key: 'elementId', label: 'Prozessschritt (Element-ID)', section: 'Bezug', kind: 'text', width: 18 },
  { key: 'riskIds', label: 'Risiken', section: 'Bezug', kind: 'refs', refKind: 'risk', width: 16 },
  { key: 'controlIds', label: 'Controls', section: 'Bezug', kind: 'refs', refKind: 'control', width: 16 },
  { key: 'responsibleRoleId', label: 'Verantwortliche Rolle', section: 'Maßnahme', kind: 'ref', refKind: 'role', width: 14 },
  { key: 'responsibleUserId', label: 'Verantwortliche Person', section: 'Maßnahme', kind: 'ref', refKind: 'user', width: 22 },
  { key: 'rootCause', label: 'Ursache', section: 'Maßnahme', kind: 'long', width: 30 },
  { key: 'correctiveAction', label: 'Korrekturmaßnahme', section: 'Maßnahme', kind: 'long', width: 36 },
  { key: 'dueDate', label: 'Frist', section: 'Maßnahme', kind: 'date', width: 12 },
  {
    key: 'status',
    label: 'Status',
    section: 'Maßnahme',
    kind: 'select',
    options: ['Offen', 'In Bearbeitung', 'Umgesetzt', 'Wirksamkeit geprüft', 'Geschlossen'],
    width: 18,
  },
  { key: 'verifiedAt', label: 'Wirksamkeit geprüft am', section: 'Wirksamkeit', kind: 'date', width: 13 },
  { key: 'verifiedByUserId', label: 'Geprüft durch', section: 'Wirksamkeit', kind: 'ref', refKind: 'user', width: 22 },
  { key: 'verificationResult', label: 'Ergebnis der Prüfung', section: 'Wirksamkeit', kind: 'long', width: 30 },
];

export const measurementCols: Col[] = [
  { key: 'kpiCode', label: 'KPI-ID', section: 'Messwerte', kind: 'ref', refKind: 'kpi', width: 11, required: true },
  { key: 'date', label: 'Datum', section: 'Messwerte', kind: 'date', width: 12, required: true },
  { key: 'value', label: 'Wert', section: 'Messwerte', kind: 'number', width: 12, required: true },
];

export const processCols: Col[] = [
  { key: 'code', label: 'ID', section: 'Steckbrief', kind: 'id', width: 10, required: true },
  { key: 'title', label: 'Bezeichnung', section: 'Steckbrief', kind: 'text', width: 30, required: true },
  {
    key: 'category',
    label: 'Prozesskategorie',
    section: 'Steckbrief',
    kind: 'select',
    options: ['Führungsprozess', 'Kernprozess', 'Unterstützungsprozess'],
    width: 20,
  },
  { key: 'area', label: 'Prozessbereich', section: 'Steckbrief', kind: 'text', width: 18 },
  { key: 'ownerRoleId', label: 'Prozessverantwortlicher', section: 'Steckbrief', kind: 'ref', refKind: 'role', width: 14 },
  { key: 'version', label: 'Version', section: 'Steckbrief', kind: 'text', width: 9 },
  {
    key: 'status',
    label: 'Freigabestatus',
    section: 'Steckbrief',
    kind: 'select',
    options: ['Entwurf', 'In Prüfung', 'Freigegeben', 'Archiviert'],
    width: 14,
  },
  { key: 'nextReview', label: 'Nächste Überprüfung', section: 'Steckbrief', kind: 'date', width: 12 },
  { key: 'standards', label: 'Relevante Managementsysteme', section: 'Steckbrief', kind: 'text', width: 22 },
  { key: 'description', label: 'Zweck & Anwendungsbereich', section: 'ISO 9001 4.4', kind: 'long', width: 36 },
  { key: 'inputs', label: 'Eingaben (Inputs)', section: 'ISO 9001 4.4', kind: 'long', width: 26 },
  { key: 'outputs', label: 'Ergebnisse (Outputs)', section: 'ISO 9001 4.4', kind: 'long', width: 26 },
  { key: 'resources', label: 'Ressourcen', section: 'ISO 9001 4.4', kind: 'long', width: 26 },
];

/** Process columns incl. custom fields and dropdown values of the content administration. */
export function processColumns(config: ContentConfig | undefined = useStore.getState().config): Col[] {
  const base = processCols.map((c) => {
    const extra = config?.extraOptions[`processes.${c.key}`];
    return extra?.length && c.options ? { ...c, options: [...c.options, ...extra.filter((o) => !c.options!.includes(o))] } : c;
  });
  const custom = withConfig([], 'processes', config).flatMap((s) => s.fields.flatMap((f) => fieldCols(f, s.title)));
  return [...base, ...custom];
}

export const stepCols: Col[] = [
  { key: 'processCode', label: 'Prozess', section: 'Schritt', kind: 'ref', refKind: 'processes', width: 10, required: true },
  {
    key: 'elementId',
    label: 'Schritt-ID',
    section: 'Schritt',
    kind: 'text',
    width: 18,
    required: true,
    hint: 'Element-ID im BPMN-Diagramm – nicht ändern.',
  },
  { key: 'name', label: 'Schritt', section: 'Schritt', kind: 'text', width: 36, hint: 'Nur zur Information, der Name wird im Diagramm gepflegt.' },
  { key: 'type', label: 'Typ', section: 'Schritt', kind: 'text', width: 14, hint: 'Nur zur Information.' },
  {
    key: 'roles',
    label: 'Rollen (ID:RACI)',
    section: 'Zuordnungen',
    kind: 'text',
    width: 26,
    hint: 'z. B. „RO-003:R, RO-006:C“ – RACI: R, A, C oder I.',
  },
  { key: 'instructions', label: 'Work Instructions', section: 'Zuordnungen', kind: 'refs', refKind: 'instruction', width: 16 },
  { key: 'risks', label: 'Risiken', section: 'Zuordnungen', kind: 'refs', refKind: 'risk', width: 16 },
  { key: 'controls', label: 'Controls', section: 'Zuordnungen', kind: 'refs', refKind: 'control', width: 16 },
  { key: 'opportunities', label: 'Chancen', section: 'Zuordnungen', kind: 'refs', refKind: 'opportunity', width: 14 },
  { key: 'kpis', label: 'KPI', section: 'Zuordnungen', kind: 'refs', refKind: 'kpi', width: 14 },
  { key: 'note', label: 'Beschreibung', section: 'Zuordnungen', kind: 'long', width: 30 },
];

/** Header text in the current language. */
export const headerOf = (c: Col) => t(c.label, c.vars) + (c.required ? ' *' : '');

/** Normalised header for matching: lower case, without "*" and bracketed additions. */
export const normHeader = (s: string) =>
  s
    .toLowerCase()
    .replace(/\*/g, '')
    .replace(/\([^)]*\)/g, '')
    .replace(/\s+/g, ' ')
    .trim();

/** All header spellings (German and English) a column is recognised by. */
export function headerVariants(c: Col): string[] {
  const fill = (s: string) => (c.vars ? s.replace(/\{(\w+)\}/g, (m, k) => String(c.vars![k] ?? m)) : s);
  const de = fill(c.label);
  const out = new Set([normHeader(de), normHeader(fill(en[c.label] ?? c.label))]);
  return [...out].filter(Boolean);
}

/** Sheet names a module is recognised by (German, English, template names). */
export function sheetNames(kind: EntityKind | 'processes' | 'steps' | 'findings' | 'measurements'): string[] {
  const special: Record<string, string[]> = {
    processes: ['Prozesse', 'Processes'],
    steps: ['Prozessschritte', 'Process steps'],
    findings: ['Feststellungen', 'Findings', 'Audit-Feststellungen'],
    measurements: ['Messwerte', 'Measurements'],
    mandate: ['Delegationen & Vollmachten', 'Delegations & powers', 'Delegations & powers of attorney'],
    position: ['Stellen', 'Positions'],
    role: ['Rollen', 'Roles'],
  };
  if (special[kind]) return special[kind];
  const p = modules[kind as EntityKind].plural;
  return [p, en[p] ?? p];
}

/** Sheet name for export (Excel allows 31 characters, no []:*?/\). */
export function exportSheetName(kind: EntityKind | 'processes' | 'steps' | 'findings' | 'measurements', lang: 'de' | 'en') {
  const names = sheetNames(kind);
  const name = lang === 'en' ? (names.find((n, i) => i > 0 && n.length <= 31) ?? names[0]) : names[0];
  return name.replace(/[[\]:*?/\\]/g, '').slice(0, 31);
}
