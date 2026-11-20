// Change history of elements: who changed which field when (old and new value). Old states can be viewed, not restored.

export interface Change {
  key: string;
  from: unknown;
  to: unknown;
}

export type RevisionKind = 'create' | 'edit' | 'workflow' | 'import' | 'diagram' | 'assignment';

export interface Revision {
  at: string;
  byUserId: string;
  kind: RevisionKind;
  changes: Change[];
  /** text for changes without field values (diagram, step assignments); translated with `vars` */
  note?: string;
  vars?: Record<string, string>;
}

/** Fields that are not tracked: technical data, own history, workflow log, released copy, diagram and step assignments. */
const IGNORE = new Set(['id', 'createdAt', 'updatedAt', 'history', 'workflow', 'released', 'xml', 'assignments', 'callLinks']);

const same = (a: unknown, b: unknown) => JSON.stringify(a ?? '') === JSON.stringify(b ?? '');

/** Embedded images (rich text) are not copied into the history: it would fill the browser storage. */
const compact = (v: unknown) => (typeof v === 'string' && v.includes('src="data:') ? v.replace(/src="data:[^"]{1000,}"/g, 'src=""') : v);

/** Field changes between two states of an element. */
export function diff(before: object, after: object): Change[] {
  const a = before as Record<string, unknown>;
  const b = after as Record<string, unknown>;
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  return [...keys].filter((k) => !IGNORE.has(k) && !same(a[k], b[k])).map((k) => ({ key: k, from: compact(a[k]), to: compact(b[k]) }));
}

const MERGE_MS = 10 * 60_000;

/** Appends a revision; consecutive diagram changes of the same person within 10 minutes become one entry. */
export function withRevision<T extends object>(item: T, rev: Revision): T {
  const history = ((item as { history?: Revision[] }).history ?? []).slice();
  if (!rev.changes.length && !rev.note && rev.kind !== 'create') return item;
  const last = history[history.length - 1];
  if (rev.kind === 'diagram' && last?.kind === 'diagram' && last.byUserId === rev.byUserId && Date.parse(rev.at) - Date.parse(last.at) < MERGE_MS) {
    history[history.length - 1] = { ...last, at: rev.at };
  } else history.push(rev);
  return { ...item, history };
}

/** Records the changes from `before` to `after` on `after`. */
export function track<T extends object>(before: T, after: T, byUserId: string, kind: RevisionKind, note?: string, vars?: Record<string, string>): T {
  const changes = diff(before, after);
  return withRevision(after, { at: new Date().toISOString(), byUserId, kind, changes, ...(note ? { note, vars } : {}) });
}

export const revisionsOf = (item: unknown): Revision[] => (item as { history?: Revision[] }).history ?? [];

/** State of an element right after revision `index` (later changes are reverted). */
export function stateAt<T extends object>(item: T, index: number): T {
  const out = { ...(item as Record<string, unknown>) };
  const history = revisionsOf(item);
  for (let i = history.length - 1; i > index; i--) for (const c of history[i].changes) out[c.key] = c.from;
  return out as T;
}

export const revisionKindLabel: Record<RevisionKind, string> = {
  create: 'Angelegt',
  edit: 'Bearbeitet',
  workflow: 'Freigabe-Workflow',
  import: 'Excel-Import',
  diagram: 'Diagramm geändert',
  assignment: 'Zuordnung im Prozessschritt',
};
