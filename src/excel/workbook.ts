// Excel export and import for all modules (administrators only; see the buttons in the modules and the sidebar).
import type { Workbook, Worksheet } from 'exceljs';
import type { AnyEntity, Audit, AuditFinding, EntityKind, EntityMap, Kpi, Mandate, ProcessModel, Raci, Role, StepAssignment, User } from '../types';
import { modules, kindOrder } from '../schema';
import { blankEntity, blankFinding, emptyAssignment, mandateState, mandateStateLabel, now, parseElements, uid } from '../logic';
import { emptyDiagram } from '../bpmn/templates';
import { t, useLang } from '../i18n';
import {
  columnsOf,
  exportSheetName,
  findingCols,
  headerOf,
  headerVariants,
  measurementCols,
  normHeader,
  processCols,
  sheetNames,
  stepCols,
  type Col,
} from './columns';
import { cellText, fromCell, toCell, type Lookup, type RefKind } from './codec';

/** Store data the Excel functions work on. */
export type Data = { [K in EntityKind]: EntityMap[K][] } & { processes: ProcessModel[] };

export type SheetKind = EntityKind | 'processes' | 'steps' | 'findings' | 'measurements';

const loadExcel = async () => {
  const mod = await import('exceljs');
  return ((mod as unknown as { default?: typeof import('exceljs') }).default ?? mod) as typeof import('exceljs');
};

const FONT = 'Arial';
const NAVY = 'FF1B2A41';
const BANDS = ['FFDCE7F3', 'FFEFE3F7', 'FFE6F4EA', 'FFFFF1D6', 'FFE9ECEF', 'FFFCE4EC', 'FFE3F2FD'];
const FIELD_NOTE = 'Feld im GRC Studio';

function lookup(d: Data): Lookup {
  const byId = (kind: RefKind) => (kind === 'processes' ? d.processes : (d[kind] as AnyEntity[]));
  return {
    codeOf: (kind, id) => byId(kind).find((e) => e.id === id)?.code ?? '',
    idOf: (kind, code) => {
      const c = code.trim().toLowerCase();
      return byId(kind).find((e) => e.code.toLowerCase() === c || e.id.toLowerCase() === c)?.id;
    },
    userName: (id) => d.user.find((u) => u.id === id)?.title ?? '',
    userId: (name) => {
      const n = name.trim().toLowerCase();
      return d.user.find((u) => u.title.toLowerCase() === n || u.code.toLowerCase() === n || u.email.toLowerCase() === n)?.id;
    },
  };
}

// ---- export ---------------------------------------------------------------------------

interface SheetSpec {
  kind: SheetKind;
  title: string;
  hint: string;
  cols: Col[];
  rows: unknown[][];
}

function addSheet(wb: Workbook, spec: SheetSpec, lang: 'de' | 'en', listSheet: Worksheet, listCol: { n: number }) {
  const ws = wb.addWorksheet(exportSheetName(spec.kind, lang), { views: [{ state: 'frozen', xSplit: 2, ySplit: 3 }] });
  const n = spec.cols.length;
  ws.getCell(1, 1).value = spec.title;
  ws.getCell(1, 1).font = { name: FONT, bold: true, size: 14, color: { argb: NAVY } };
  ws.getCell(1, 3).value = spec.hint;
  ws.getCell(1, 3).font = { name: FONT, size: 9, italic: true, color: { argb: 'FF5F6B7A' } };
  ws.getRow(1).height = 22;
  // section band
  let start = 1;
  let band = 0;
  for (let i = 1; i <= n + 1; i++) {
    if (i > n || spec.cols[i - 1].section !== spec.cols[start - 1].section) {
      const fill = { type: 'pattern' as const, pattern: 'solid' as const, fgColor: { argb: BANDS[band++ % BANDS.length] } };
      if (i - 1 > start) ws.mergeCells(2, start, 2, i - 1);
      const cell = ws.getCell(2, start);
      cell.value = t(spec.cols[start - 1].section);
      cell.font = { name: FONT, bold: true, size: 9, color: { argb: NAVY } };
      for (let j = start; j < i; j++) {
        ws.getCell(2, j).fill = fill;
        ws.getCell(3, j).fill = fill;
      }
      start = i;
    }
  }
  // headers with notes
  spec.cols.forEach((c, i) => {
    const cell = ws.getCell(3, i + 1);
    cell.value = headerOf(c);
    cell.font = { name: FONT, bold: true, size: 9, color: { argb: c.required ? NAVY : 'FF1F2933' } };
    cell.alignment = { wrapText: true, vertical: 'top' };
    cell.note = `${c.hint ? t(c.hint) + '\n\n' : ''}${t(FIELD_NOTE)}: ${c.key}`;
    ws.getColumn(i + 1).width = c.width;
  });
  ws.getRow(3).height = 42;
  // data
  spec.rows.forEach((values, r) => {
    const row = ws.getRow(4 + r);
    values.forEach((v, i) => {
      const cell = row.getCell(i + 1);
      cell.value = v as never;
      cell.font = { name: FONT, size: 9 };
      const k = spec.cols[i].kind;
      cell.alignment = { wrapText: k === 'long' || k === 'text', vertical: 'top' };
      if (k === 'date') cell.numFmt = lang === 'de' ? 'dd.mm.yyyy' : 'dd/mm/yyyy';
      if (k === 'computed') cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF1F3F5' } };
    });
  });
  const last = Math.max(4 + spec.rows.length + 200, 204);
  ws.autoFilter = { from: { row: 3, column: 1 }, to: { row: 3, column: n } };
  // dropdowns for list values
  spec.cols.forEach((c, i) => {
    const values = c.kind === 'select' ? (c.options ?? []).filter(Boolean).map((o) => t(o)) : c.kind === 'bool' ? [t('Ja'), t('Nein')] : null;
    if (!values?.length) return;
    const col = ++listCol.n;
    listSheet.getCell(1, col).value = t(c.label);
    values.forEach((v, j) => (listSheet.getCell(2 + j, col).value = v));
    const letter = listSheet.getColumn(col).letter;
    const range = `'${listSheet.name}'!$${letter}$2:$${letter}$${values.length + 1}`;
    const colLetter = ws.getColumn(i + 1).letter;
    (ws as unknown as { dataValidations: { add: (r: string, v: object) => void } }).dataValidations.add(`${colLetter}4:${colLetter}${last}`, {
      type: 'list',
      allowBlank: true,
      formulae: [range],
      showErrorMessage: true,
      errorStyle: 'warning',
      errorTitle: t('Ungültiger Wert'),
      error: t('Bitte einen Wert aus der Liste wählen.'),
    });
  });
  return ws;
}

function entitySpec(kind: EntityKind, d: Data, lk: Lookup): SheetSpec {
  const cols = columnsOf(kind);
  const rows = (d[kind] as AnyEntity[]).map((e) => {
    const rec = e as unknown as Record<string, unknown>;
    return cols.map((c) => {
      if (c.key === '#state') return t(mandateStateLabel[mandateState(e as Mandate)]);
      const m = c.key.match(/^roles\[(\d)\]\.(roleId|comment)$/);
      if (m) {
        const pr = (rec.roles as { roleId: string; comment: string }[])[Number(m[1])];
        return pr ? toCell(c, pr[m[2] as 'roleId' | 'comment'], lk) : null;
      }
      if (c.key === 'user.title')
        return toCell(
          c,
          d.user.filter((u) => u.positionId === e.id).map((u) => u.id),
          lk,
        );
      if (c.key === 'user.positionSince') return toCell(c, d.user.find((u) => u.positionId === e.id)?.positionSince, lk);
      return toCell(c, rec[c.key], lk);
    });
  });
  return {
    kind,
    title: t(modules[kind].plural),
    hint: t('Export aus GRC Studio vom {date}. Änderungen hier können über „⬆ Excel“ wieder importiert werden.', {
      date: new Date().toLocaleDateString(),
    }),
    cols,
    rows,
  };
}

function extraSpecs(kind: EntityKind | 'processes', d: Data, lk: Lookup): SheetSpec[] {
  const hint = t('Gehört zum Blatt „{name}“ und wird mit ihm importiert.', { name: kind === 'processes' ? t('Prozesse') : t(modules[kind].plural) });
  if (kind === 'audit') {
    const rows = d.audit.flatMap((a) =>
      a.findings.map((f) =>
        findingCols.map((c) => (c.key === 'auditCode' ? a.code : toCell(c, (f as unknown as Record<string, unknown>)[c.key], lk))),
      ),
    );
    return [{ kind: 'findings', title: t('Audit-Feststellungen'), hint, cols: findingCols, rows }];
  }
  if (kind === 'kpi') {
    const rows = d.kpi.flatMap((k) => k.measurements.map((m) => [k.code, toCell(measurementCols[1], m.date, lk), m.value]));
    return [{ kind: 'measurements', title: t('Messwerte'), hint, cols: measurementCols, rows }];
  }
  if (kind === 'processes') {
    const rows = d.processes.flatMap((p) =>
      parseElements(p.xml)
        .filter((e) => /task|subProcess|callActivity/i.test(e.type))
        .map((e) => {
          const a = p.assignments[e.id] ?? emptyAssignment();
          const codes = (k: RefKind, ids: string[]) =>
            ids
              .map((id) => lk.codeOf(k, id))
              .filter(Boolean)
              .join(', ') || null;
          return [
            p.code,
            e.id,
            e.name,
            e.type,
            a.roles.map((r) => `${lk.codeOf('role', r.roleId)}:${r.raci}`).join(', ') || null,
            codes('risk', a.risks),
            codes('control', a.controls),
            codes('opportunity', a.opportunities),
            codes('kpi', a.kpis),
            a.note || null,
          ];
        }),
    );
    return [{ kind: 'steps', title: t('Prozessschritte'), hint, cols: stepCols, rows }];
  }
  return [];
}

function processSpec(d: Data, lk: Lookup): SheetSpec {
  const rows = d.processes.map((p) =>
    processCols.map((c) =>
      c.key === 'standards' ? p.standards.join(', ') || null : toCell(c, (p as unknown as Record<string, unknown>)[c.key], lk),
    ),
  );
  return {
    kind: 'processes',
    title: t('Prozesse'),
    hint: t('Steckbriefe der Prozesse. Das BPMN-Diagramm selbst wird im Prozessmodul als BPMN-Datei ex- und importiert.'),
    cols: processCols,
    rows,
  };
}

/** Builds the workbook for one module, or for all modules. */
export async function exportExcel(d: Data, which: EntityKind | 'processes' | 'all'): Promise<Blob> {
  const ExcelJS = await loadExcel();
  const lang = useLang.getState().lang;
  const lk = lookup(d);
  const wb = new ExcelJS.Workbook();
  wb.creator = 'GRC Studio';
  wb.created = new Date();
  const kinds: (EntityKind | 'processes')[] = which === 'all' ? ['processes', ...kindOrder] : [which];
  const specs = kinds.flatMap((k) =>
    k === 'processes' ? [processSpec(d, lk), ...extraSpecs(k, d, lk)] : [entitySpec(k, d, lk), ...extraSpecs(k, d, lk)],
  );
  const listSheet = wb.addWorksheet(lang === 'en' ? 'Lists' : 'Listen', { state: 'hidden' });
  const counter = { n: 0 };
  for (const s of specs) addSheet(wb, s, lang, listSheet, counter);
  // the hidden list sheet goes last
  const ordered = wb.worksheets;
  ordered.forEach((ws, i) => ((ws as unknown as { orderNo: number }).orderNo = ws === listSheet ? ordered.length : i));
  const buf = await wb.xlsx.writeBuffer();
  return new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
}

// ---- import ---------------------------------------------------------------------------

export interface ImportMessage {
  sheet: string;
  row?: number;
  text: string;
  level: 'warn' | 'error';
}

export interface ImportSummary {
  kind: SheetKind;
  sheet: string;
  created: number;
  updated: number;
  unchanged: number;
  skipped: number;
}

export interface ImportResult {
  summaries: ImportSummary[];
  messages: ImportMessage[];
  /** new store state for the changed collections */
  patch: Partial<Data>;
  changes: number;
}

interface SheetRows {
  kind: SheetKind;
  ws: Worksheet;
  /** column index (1-based) per column key */
  colIndex: Map<string, number>;
  cols: Col[];
  /** data rows: [excel row number, row] */
  rows: [number, (c: Col) => unknown][];
}

const noteText = (n: unknown): string => {
  if (!n) return '';
  if (typeof n === 'string') return n;
  const o = n as { texts?: { text: string }[] };
  return o.texts?.map((x) => x.text).join('') ?? '';
};

function readSheet(kind: SheetKind, ws: Worksheet, cols: Col[], messages: ImportMessage[]): SheetRows | null {
  // header row: the first of rows 1-10 in which at least two columns are recognised
  const variants = new Map<string, Col>();
  for (const c of cols) for (const v of headerVariants(c)) if (!variants.has(v)) variants.set(v, c);
  const byKey = new Map(cols.map((c) => [c.key, c]));
  let headerRow = 0;
  let colIndex = new Map<string, number>();
  const unknown: string[] = [];
  for (let r = 1; r <= Math.min(10, ws.rowCount); r++) {
    const found = new Map<string, number>();
    const unk: string[] = [];
    ws.getRow(r).eachCell({ includeEmpty: false }, (cell, colNo) => {
      const m = noteText(cell.note).match(/(?:Feld im GRC Studio|Field in GRC Studio):\s*(\S+)/);
      const byNote = m && byKey.get(m[1]);
      const byHeader = variants.get(normHeader(cellText(cell.value)));
      const c = byNote || byHeader;
      if (c && !found.has(c.key)) found.set(c.key, colNo);
      else if (!c && cellText(cell.value)) unk.push(cellText(cell.value));
    });
    if (found.size >= 2) {
      headerRow = r;
      colIndex = found;
      unknown.push(...unk);
      break;
    }
  }
  if (!headerRow) {
    messages.push({ sheet: ws.name, text: t('Keine passenden Spaltenköpfe gefunden – Blatt übersprungen.'), level: 'error' });
    return null;
  }
  if (unknown.length)
    messages.push({ sheet: ws.name, text: t('Nicht erkannte Spalten werden ignoriert: {cols}', { cols: unknown.join(', ') }), level: 'warn' });
  const rows: SheetRows['rows'] = [];
  for (let r = headerRow + 1; r <= ws.rowCount; r++) {
    const row = ws.getRow(r);
    const first = row.getCell(1);
    // template example row
    if (/beispiel|example/i.test(noteText(first.note))) continue;
    const get = (c: Col) => {
      const i = colIndex.get(c.key);
      return i ? row.getCell(i).value : undefined;
    };
    const hasData = [...colIndex.entries()].some(([key, i]) => byKey.get(key)?.kind !== 'computed' && cellText(row.getCell(i).value) !== '');
    if (hasData) rows.push([r, get]);
  }
  return { kind, ws, colIndex, cols, rows };
}

const findSheet = (wb: Workbook, kind: SheetKind) => {
  const names = sheetNames(kind).map((n) => n.toLowerCase());
  return wb.worksheets.find((ws) => ws.state !== 'hidden' && names.includes(ws.name.toLowerCase()));
};

const same = (a: unknown, b: unknown) => JSON.stringify(a ?? '') === JSON.stringify(b ?? '');

/** Reads a workbook and computes the changes without applying them. `only` restricts it to one module. */
export async function importExcel(file: ArrayBuffer, d: Data, only?: EntityKind | 'processes'): Promise<ImportResult> {
  const ExcelJS = await loadExcel();
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(file);
  const messages: ImportMessage[] = [];
  const summaries: ImportSummary[] = [];

  // which sheets: by name; a single-module import falls back to the first visible sheet
  const order: (EntityKind | 'processes')[] = ['user', 'role', 'position', 'mandate', 'risk', 'opportunity', 'control', 'kpi', 'audit', 'processes'];
  const wanted = only ? [only] : order;
  const sheets: SheetRows[] = [];
  for (const kind of wanted) {
    let ws = findSheet(wb, kind);
    if (!ws && only) ws = wb.worksheets.find((w) => w.state !== 'hidden');
    if (!ws) continue;
    const s = readSheet(kind, ws, kind === 'processes' ? processCols : columnsOf(kind), messages);
    if (s) sheets.push(s);
  }
  const extra: [SheetKind, Col[]][] = [];
  if (!only || only === 'audit') extra.push(['findings', findingCols]);
  if (!only || only === 'kpi') extra.push(['measurements', measurementCols]);
  if (!only || only === 'processes') extra.push(['steps', stepCols]);
  for (const [kind, cols] of extra) {
    const ws = findSheet(wb, kind);
    const s = ws && readSheet(kind, ws, cols, messages);
    if (s) sheets.push(s);
  }
  if (!sheets.length) {
    messages.push({ sheet: '–', text: t('Die Datei enthält kein passendes Blatt.'), level: 'error' });
    return { summaries, messages, patch: {}, changes: 0 };
  }

  // pass 1: ids for all rows (existing by code, otherwise new) so that references within the file resolve
  const work: Data = { ...d, processes: [...d.processes] } as Data;
  for (const k of kindOrder) (work as Record<string, unknown>)[k] = [...(d[k] as AnyEntity[])];
  const idCol = (s: SheetRows) => s.cols.find((c) => c.kind === 'id')!;
  const target = new Map<SheetRows, (string | null)[]>();
  for (const s of sheets) {
    if (s.kind === 'findings' || s.kind === 'measurements' || s.kind === 'steps') continue;
    const list = (s.kind === 'processes' ? work.processes : (work[s.kind as EntityKind] as AnyEntity[])) as {
      id: string;
      code: string;
      title: string;
    }[];
    const prefix = s.kind === 'processes' ? 'P' : modules[s.kind as EntityKind].codePrefix;
    const ids: (string | null)[] = [];
    const seen = new Set<string>();
    for (const [rowNo, get] of s.rows) {
      let code = cellText(get(idCol(s)));
      const titleCol = s.cols.find((c) => c.key === 'title');
      if (!code && titleCol && !cellText(get(titleCol))) {
        ids.push(null);
        continue;
      }
      if (code && seen.has(code.toLowerCase())) {
        messages.push({ sheet: s.ws.name, row: rowNo, text: t('ID {id} kommt mehrfach vor – Zeile übersprungen.', { id: code }), level: 'error' });
        ids.push(null);
        continue;
      }
      const existing = code && list.find((e) => e.code.toLowerCase() === code.toLowerCase());
      if (existing) ids.push(existing.id);
      else {
        if (!code) code = nextCodeOf(list, prefix);
        const id = s.kind === 'user' && /^U-\d+$/.test(code) && !list.some((e) => e.id === code) ? code : uid();
        list.push({ id, code, title: '' } as never);
        ids.push(id);
      }
      seen.add(code.toLowerCase());
    }
    target.set(s, ids);
  }
  // user names inside the file must resolve before other sheets refer to them
  const userSheet = sheets.find((s) => s.kind === 'user');
  if (userSheet) {
    const ids = target.get(userSheet)!;
    const nameCol = userSheet.cols.find((c) => c.key === 'title')!;
    userSheet.rows.forEach(([, get], i) => {
      const u = work.user.find((x) => x.id === ids[i]);
      if (u && !u.title) (u as { title: string }).title = cellText(get(nameCol));
    });
  }
  const lk = lookup(work);

  // pass 2: values
  const patch: Partial<Data> = {};
  let changes = 0;
  for (const s of sheets) {
    const sum: ImportSummary = { kind: s.kind, sheet: s.ws.name, created: 0, updated: 0, unchanged: 0, skipped: 0 };
    const warnAt = (row: number) => (text: string) => messages.push({ sheet: s.ws.name, row, text, level: 'warn' });

    if (s.kind === 'findings' || s.kind === 'measurements' || s.kind === 'steps') {
      changes += importChildRows(s, d, patch, lk, sum, messages, warnAt);
      summaries.push(sum);
      continue;
    }

    const ids = target.get(s)!;
    const kind = s.kind as EntityKind | 'processes';
    const current = (kind === 'processes' ? d.processes : (d[kind] as AnyEntity[])) as unknown as Record<string, unknown>[];
    const result = [...(((patch as Record<string, unknown>)[kind] as Record<string, unknown>[] | undefined) ?? current)];
    const holderUpdates: { positionId: string; users: string[]; since?: string }[] = [];
    s.rows.forEach(([rowNo, get], i) => {
      const id = ids[i];
      if (!id) {
        sum.skipped++;
        return;
      }
      const warn = warnAt(rowNo);
      const old = current.find((e) => e.id === id);
      const fields: Record<string, unknown> = {};
      const roles: { roleId: string; comment: string }[] = [];
      let rolesTouched = false;
      for (const c of s.cols) {
        if (!s.colIndex.has(c.key) || c.kind === 'computed') continue;
        const raw = get(c);
        if (c.key === 'standards') {
          fields.standards = cellText(raw)
            .split(/[,;]/)
            .map((x) => x.trim())
            .filter(Boolean);
          continue;
        }
        const v = fromCell(c, raw, lk, warn);
        if (v === undefined) continue;
        const m = c.key.match(/^roles\[(\d)\]\.(roleId|comment)$/);
        if (m) {
          rolesTouched = true;
          const idx = Number(m[1]);
          roles[idx] = { roleId: roles[idx]?.roleId ?? '', comment: roles[idx]?.comment ?? '', [m[2]]: v as string };
          continue;
        }
        if (c.key === 'user.title') {
          holderUpdates.push({ positionId: id, users: v as string[] });
          continue;
        }
        if (c.key === 'user.positionSince') {
          const h = holderUpdates.find((x) => x.positionId === id);
          if (h) h.since = v as string;
          continue;
        }
        fields[c.key] = v;
      }
      if (rolesTouched) fields.roles = roles.filter((r) => r && r.roleId);
      if (fields.code === '' || fields.code === undefined) fields.code = lk.codeOf(kind, id) || (old?.code as string);
      if (old) {
        const changed = Object.keys(fields).some((k) => !same(fields[k], old[k]));
        if (changed) {
          sum.updated++;
          const idx = result.findIndex((e) => e.id === id);
          result[idx] = { ...result[idx], ...fields, updatedAt: now() };
        } else sum.unchanged++;
      } else {
        sum.created++;
        const base =
          kind === 'processes'
            ? ({
                id,
                code: fields.code,
                title: '',
                description: '',
                category: 'Kernprozess',
                ownerRoleId: '',
                version: '0.1',
                status: 'Entwurf',
                standards: [],
                nextReview: '',
                xml: emptyDiagram(String(fields.title ?? '')),
                assignments: {},
                callLinks: {},
                createdAt: now(),
                updatedAt: now(),
              } as unknown as Record<string, unknown>)
            : (blankEntity(kind, String(fields.code), '') as unknown as Record<string, unknown>);
        result.push({ ...base, ...fields, id });
      }
    });
    (patch as Record<string, unknown>)[kind] = result;

    // persons named as position holders: the position is stored on the user
    if (holderUpdates.length) {
      const users = [...((patch.user as User[] | undefined) ?? d.user)];
      for (const h of holderUpdates) {
        users.forEach((u, i) => {
          const listed = h.users.includes(u.id);
          if (listed && (u.positionId !== h.positionId || (h.since && u.positionSince !== h.since)))
            users[i] = { ...u, positionId: h.positionId, positionSince: h.since || u.positionSince, updatedAt: now() };
          else if (!listed && u.positionId === h.positionId) users[i] = { ...u, positionId: '', positionSince: '', updatedAt: now() };
        });
      }
      patch.user = users;
    }
    changes += sum.created + sum.updated;
    summaries.push(sum);
  }

  // incompatible roles are symmetric
  if (patch.role) {
    const roles = (patch.role as Role[]).map((r) => ({ ...r }));
    for (const r of roles)
      for (const o of r.incompatibleRoleIds) {
        const other = roles.find((x) => x.id === o);
        if (other && !other.incompatibleRoleIds.includes(r.id)) other.incompatibleRoleIds = [...other.incompatibleRoleIds, r.id];
      }
    patch.role = roles;
  }
  return { summaries, messages, patch, changes };
}

function nextCodeOf(items: { code: string }[], prefix: string) {
  const max = items.reduce((m, i) => Math.max(m, parseInt(i.code.replace(/\D+/g, ''), 10) || 0), 0);
  return `${prefix}-${String(max + 1).padStart(3, '0')}`;
}

/** Findings, measurements and process steps belong to a parent element. */
function importChildRows(
  s: SheetRows,
  d: Data,
  patch: Partial<Data>,
  lk: Lookup,
  sum: ImportSummary,
  messages: ImportMessage[],
  warnAt: (row: number) => (text: string) => void,
): number {
  const parentCol = s.cols[0];
  if (s.kind === 'measurements') {
    const kpis = [...((patch.kpi as Kpi[] | undefined) ?? d.kpi)];
    const fresh = new Map<string, { date: string; value: number }[]>();
    for (const [rowNo, get] of s.rows) {
      const warn = warnAt(rowNo);
      const kpiId = fromCell(parentCol, get(parentCol), lk, warn) as string;
      const date = fromCell(measurementCols[1], get(measurementCols[1]), lk, warn) as string;
      const value = fromCell(measurementCols[2], get(measurementCols[2]), lk, warn) as number;
      if (!kpiId || !date) {
        sum.skipped++;
        continue;
      }
      fresh.set(kpiId, [...(fresh.get(kpiId) ?? []), { date, value }]);
    }
    for (const [kpiId, ms] of fresh) {
      const i = kpis.findIndex((k) => k.id === kpiId);
      if (i < 0) continue;
      const sorted = ms.sort((a, b) => a.date.localeCompare(b.date));
      if (same(sorted, kpis[i].measurements)) sum.unchanged++;
      else {
        sum.updated++;
        kpis[i] = { ...kpis[i], measurements: sorted, updatedAt: now() };
      }
    }
    patch.kpi = kpis;
    return sum.updated;
  }
  if (s.kind === 'findings') {
    const audits = [...((patch.audit as Audit[] | undefined) ?? d.audit)];
    const byAudit = new Map<string, { row: number; f: Partial<AuditFinding> }[]>();
    for (const [rowNo, get] of s.rows) {
      const warn = warnAt(rowNo);
      const auditId = fromCell(parentCol, get(parentCol), lk, warn) as string;
      if (!auditId) {
        sum.skipped++;
        continue;
      }
      const f: Record<string, unknown> = {};
      for (const c of findingCols.slice(1)) {
        if (!s.colIndex.has(c.key)) continue;
        const v = fromCell(c, get(c), lk, warn);
        if (v !== undefined) f[c.key] = c.key === 'clause' ? ((v as string[])[0] ?? '') : v;
      }
      byAudit.set(auditId, [...(byAudit.get(auditId) ?? []), { row: rowNo, f: f as Partial<AuditFinding> }]);
    }
    let maxNo = audits.flatMap((a) => a.findings).reduce((m, f) => Math.max(m, parseInt(f.code.replace(/\D+/g, ''), 10) || 0), 0);
    for (const [auditId, list] of byAudit) {
      const i = audits.findIndex((a) => a.id === auditId);
      if (i < 0) continue;
      const old = audits[i].findings;
      const next = list.map(({ f }) => {
        const prev = f.code ? old.find((o) => o.code.toLowerCase() === String(f.code).toLowerCase()) : undefined;
        if (prev) {
          const changed = Object.keys(f).some((k) => !same(f[k as keyof AuditFinding], prev[k as keyof AuditFinding]));
          if (changed) sum.updated++;
          else sum.unchanged++;
          return { ...prev, ...f };
        }
        sum.created++;
        const code = f.code || `F-${String(++maxNo).padStart(3, '0')}`;
        return { ...blankFinding(code), ...f, code };
      });
      audits[i] = { ...audits[i], findings: next, updatedAt: now() };
    }
    patch.audit = audits;
    return sum.created + sum.updated;
  }
  // process steps
  const processes = [...((patch.processes as ProcessModel[] | undefined) ?? d.processes)];
  const raciRe = /^\s*([^:\s]+)\s*:\s*([RACI])\s*$/i;
  for (const [rowNo, get] of s.rows) {
    const warn = warnAt(rowNo);
    const pid = fromCell(parentCol, get(parentCol), lk, warn) as string;
    const el = cellText(get(stepCols[1]));
    const i = processes.findIndex((p) => p.id === pid);
    if (i < 0 || !el) {
      sum.skipped++;
      continue;
    }
    if (!parseElements(processes[i].xml).some((e) => e.id === el)) {
      warn(t('Schritt {el} gibt es im Diagramm von {p} nicht – Zeile übersprungen.', { el, p: processes[i].code }));
      sum.skipped++;
      continue;
    }
    const old: StepAssignment = processes[i].assignments[el] ?? emptyAssignment();
    const a: StepAssignment = { ...old };
    if (s.colIndex.has('roles')) {
      a.roles = [];
      for (const part of cellText(get(stepCols[4]))
        .split(/[,;]/)
        .filter((x) => x.trim())) {
        const m = part.match(raciRe);
        const roleId = m && lk.idOf('role', m[1]);
        if (m && roleId) a.roles.push({ roleId, raci: m[2].toUpperCase() as Raci });
        else warn(t('„{col}“: „{value}“ ist unbekannt.', { col: t('Rollen (ID:RACI)'), value: part.trim() }));
      }
    }
    const keyMap: [string, keyof StepAssignment][] = [
      ['risks', 'risks'],
      ['controls', 'controls'],
      ['opportunities', 'opportunities'],
      ['kpis', 'kpis'],
    ];
    for (const [key, field] of keyMap) {
      const c = stepCols.find((x) => x.key === key)!;
      if (s.colIndex.has(key)) (a as unknown as Record<string, unknown>)[field] = fromCell(c, get(c), lk, warn);
    }
    if (s.colIndex.has('note')) a.note = cellText(get(stepCols[9]));
    if (same(a, old)) sum.unchanged++;
    else {
      sum.updated++;
      processes[i] = { ...processes[i], assignments: { ...processes[i].assignments, [el]: a }, updatedAt: now() };
    }
  }
  patch.processes = processes;
  void messages;
  return sum.updated;
}
