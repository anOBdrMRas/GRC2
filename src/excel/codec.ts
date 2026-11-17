// Converts between stored values and Excel cell values (both directions).
import type { EntityKind } from '../types';
import { isoById, isoCatalog, isoLabel } from '../iso';
import { systemRoles } from '../permissions';
import { en } from '../i18n.en';
import { t } from '../i18n';
import type { Col } from './columns';

export type RefKind = EntityKind | 'processes';

/** Lookups between internal ids, display codes and user names. */
export interface Lookup {
  codeOf: (kind: RefKind, id: string) => string;
  idOf: (kind: RefKind, code: string) => string | undefined;
  userName: (id: string) => string;
  userId: (name: string) => string | undefined;
}

export type CellValue = string | number | boolean | Date | null;

// ---- export ---------------------------------------------------------------------------

const list = (xs: string[]) => xs.filter(Boolean).join(', ');

/** Date in Excel: a real date (UTC midnight). */
const toDate = (s: unknown): CellValue => {
  if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}/.test(s)) return null;
  const [y, m, d] = s.slice(0, 10).split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
};

export function toCell(c: Col, value: unknown, lk: Lookup): CellValue {
  if (value === undefined || value === null || value === '') return null;
  switch (c.kind) {
    case 'id':
    case 'text':
    case 'long':
      return String(value);
    case 'number':
      return typeof value === 'number' ? value : Number(value) || null;
    case 'date':
      return toDate(value);
    case 'bool':
      return value ? t('Ja') : t('Nein');
    case 'select':
      return t(String(value));
    case 'ref': {
      const v = String(value);
      if (v === 'n/a') return 'n/a';
      return c.refKind === 'user' ? lk.userName(v) || null : lk.codeOf(c.refKind!, v) || null;
    }
    case 'refs': {
      const xs = Array.isArray(value) ? (value as string[]) : [];
      return list(xs.map((v) => (c.refKind === 'user' ? lk.userName(v) : lk.codeOf(c.refKind!, v)))) || null;
    }
    case 'iso':
      return list((Array.isArray(value) ? value : [value]).map((v) => isoLabel(String(v)))) || null;
    case 'annex':
      return list((value as string[]) ?? []) || null;
    case 'sysroles':
      return list(((value as string[]) ?? []).map((id) => t(systemRoles.find((r) => r.id === id)?.name ?? id))) || null;
    default:
      return null;
  }
}

// ---- import ---------------------------------------------------------------------------

/** Plain text of an ExcelJS cell value (rich text, formulas, hyperlinks). */
export function cellText(v: unknown): string {
  if (v === null || v === undefined) return '';
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (typeof v === 'object') {
    const o = v as { richText?: { text: string }[]; result?: unknown; text?: string; formula?: string };
    if (o.richText) return o.richText.map((r) => r.text).join('');
    if ('result' in o) return cellText(o.result);
    if (typeof o.text === 'string') return o.text;
    return '';
  }
  return String(v).trim();
}

/** German value for a (German or English) list value. */
const reverseEn = new Map<string, string>();
for (const [de, eng] of Object.entries(en)) if (!reverseEn.has(eng.toLowerCase())) reverseEn.set(eng.toLowerCase(), de);

function matchOption(options: string[], raw: string): string | undefined {
  const r = raw.trim().toLowerCase();
  return (
    options.find((o) => o.toLowerCase() === r) ??
    options.find((o) => (en[o] ?? '').toLowerCase() === r) ??
    (reverseEn.has(r) && options.includes(reverseEn.get(r)!) ? reverseEn.get(r) : undefined)
  );
}

const yes = ['ja', 'yes', 'x', 'true', 'wahr', '1', 'j', 'y'];
const no = ['nein', 'no', 'false', 'falsch', '0', 'n', ''];

function parseDate(v: unknown): string | null {
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (typeof v === 'number' && v > 20000 && v < 80000) return new Date(Date.UTC(1899, 11, 30) + v * 86_400_000).toISOString().slice(0, 10);
  const s = cellText(v);
  if (!s) return '';
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
  m = s.match(/^(\d{1,2})[./](\d{1,2})[./](\d{4})$/);
  if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  return null;
}

const isoByLabel = new Map(isoCatalog.map((r) => [`${r.standard} ${r.clause}`.toLowerCase().replace(/\s+/g, ' '), r.id]));
function parseIso(s: string): string | undefined {
  const x = s.trim();
  if (isoById.has(x)) return x;
  const key = x
    .toLowerCase()
    .replace(/^iso\/iec/, 'iso')
    .replace(/\s+/g, ' ');
  if (isoByLabel.has(key)) return isoByLabel.get(key);
  const m = key.match(/^(?:iso\s*)?(9001|27001|37301|14001)[\s:]+(.+)$/);
  if (m && isoById.has(`${m[1]}:${m[2].toUpperCase().startsWith('A') ? m[2].toUpperCase() : m[2]}`))
    return `${m[1]}:${m[2].toUpperCase().startsWith('A') ? m[2].toUpperCase() : m[2]}`;
  return undefined;
}

const split = (s: string) =>
  s
    .split(/[,;\n]/)
    .map((x) => x.trim())
    .filter(Boolean);

/**
 * Parses a cell into the stored value. `warn` receives problems (the value is then left empty).
 * Returns undefined for columns that are not imported.
 */
export function fromCell(c: Col, raw: unknown, lk: Lookup, warn: (msg: string) => void): unknown {
  const s = cellText(raw);
  const label = t(c.label, c.vars);
  switch (c.kind) {
    case 'computed':
      return undefined;
    case 'id':
    case 'text':
    case 'long':
      return typeof raw === 'number' ? String(raw) : s;
    case 'number': {
      // empty scale cells keep the current (or default) value
      if (!s) return c.max ? undefined : 0;
      const n =
        typeof raw === 'number'
          ? raw
          : Number(
              s
                .replace(/[^\d,.-]/g, '')
                .replace(/\.(?=\d{3}\b)/g, '')
                .replace(',', '.'),
            );
      if (Number.isFinite(n)) {
        if (c.max && (!Number.isInteger(n) || n < 1 || n > c.max)) {
          warn(t('„{col}“: {value} liegt außerhalb der Skala 1–{max}.', { col: label, value: s, max: c.max }));
          return undefined;
        }
        return n;
      }
      warn(t('„{col}“: „{value}“ ist keine Zahl.', { col: label, value: s }));
      return 0;
    }
    case 'date': {
      const d = parseDate(raw);
      if (d === null) {
        warn(t('„{col}“: „{value}“ ist kein Datum.', { col: label, value: s }));
        return '';
      }
      return d;
    }
    case 'bool': {
      if (typeof raw === 'boolean') return raw;
      const v = s.toLowerCase();
      if (yes.includes(v)) return true;
      if (!no.includes(v)) warn(t('„{col}“: „{value}“ ist weder Ja noch Nein.', { col: label, value: s }));
      return false;
    }
    case 'select': {
      if (!s) return '';
      const m = matchOption(c.options ?? [], s);
      if (m !== undefined) return m;
      warn(t('„{col}“: ungültiger Wert „{value}“.', { col: label, value: s }));
      return undefined;
    }
    case 'ref': {
      if (!s) return '';
      if (s.toLowerCase() === 'n/a') {
        if (c.allowNA) return 'n/a';
        warn(t('„{col}“: „n/a“ ist hier nicht erlaubt.', { col: label }));
        return '';
      }
      const id = c.refKind === 'user' ? lk.userId(s) : lk.idOf(c.refKind!, s);
      if (!id) warn(t('„{col}“: „{value}“ ist unbekannt.', { col: label, value: s }));
      return id ?? '';
    }
    case 'refs': {
      const out: string[] = [];
      for (const v of split(s)) {
        const id = c.refKind === 'user' ? lk.userId(v) : lk.idOf(c.refKind!, v);
        if (id) out.push(id);
        else warn(t('„{col}“: „{value}“ ist unbekannt.', { col: label, value: v }));
      }
      return out;
    }
    case 'iso': {
      const out: string[] = [];
      for (const v of split(s)) {
        const id = parseIso(v);
        if (id) out.push(id);
        else warn(t('„{col}“: Normkapitel „{value}“ ist unbekannt.', { col: label, value: v }));
      }
      return out;
    }
    case 'annex':
      return split(s).map((v) => v.toUpperCase());
    case 'sysroles': {
      const out: string[] = [];
      for (const v of split(s)) {
        const r = systemRoles.find(
          (x) =>
            x.id === v.toLowerCase() ||
            x.name.toLowerCase() === v.toLowerCase() ||
            t(x.name).toLowerCase() === v.toLowerCase() ||
            (en[x.name] ?? '').toLowerCase() === v.toLowerCase(),
        );
        if (r) out.push(r.id);
        else warn(t('„{col}“: Systemrolle „{value}“ ist unbekannt.', { col: label, value: v }));
      }
      return out.length ? out : ['employee'];
    }
  }
}
