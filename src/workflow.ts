// Approval workflow for processes, roles, positions, risks and opportunities:
// draft (owner / recorder) → business approval by the owner → I&A review → released.
import type { Mandate, Opportunity, Position, ProcessModel, ReleasedSnapshot, Risk, Role, WorkflowEntry } from './types';
import { now } from './logic';

export type WfKind = 'role' | 'position' | 'processes' | 'risk' | 'opportunity';
export type WfItem = Role | Position | ProcessModel | Risk | Opportunity;

export const wfKinds: WfKind[] = ['processes', 'role', 'position', 'risk', 'opportunity'];
export const isWfKind = (k: string): k is WfKind => (wfKinds as string[]).includes(k);

/** Stored status values (unchanged from earlier versions) and their meaning in the workflow. */
export const WF = { draft: 'Entwurf', review: 'In Prüfung', released: 'Freigegeben', archived: 'Archiviert' } as const;

export type WfStage = 'draft' | 'review' | 'released' | 'archived';

export function stageOf(status: string | undefined): WfStage {
  if (status === WF.review) return 'review';
  if (status === WF.released) return 'released';
  if (status === WF.archived) return 'archived';
  return 'draft';
}

/** Label of a status in the workflow. */
export const stageLabel: Record<WfStage, string> = { draft: 'Entwurf', review: 'I&A-Review', released: 'Freigegeben', archived: 'Archiviert' };

export const stepLabel: Record<WorkflowEntry['step'], string> = {
  submitted: 'Fachlich freigegeben',
  approved: 'Qualität freigegeben (I&A)',
  rejected: 'Zurückgewiesen (I&A)',
  reopened: 'Nach Freigabe geändert',
  status: 'Status gesetzt (Administration)',
  granted: 'Erteilt (Erteilende/r)',
  accepted: 'Angenommen (Empfänger/in)',
  declined: 'Abgelehnt / zurückgegeben',
};

export const historyOf = (item: WfItem): WorkflowEntry[] => item.workflow ?? [];

/** Last entry of a given step. */
export const lastStep = (item: WfItem, step: WorkflowEntry['step']) => [...historyOf(item)].reverse().find((e) => e.step === step);

/** The I&A comment that sent a draft back (only while it is still a draft after the rejection). */
export function openRejection(item: WfItem) {
  const h = historyOf(item);
  const last = h[h.length - 1];
  return stageOf(item.status) === 'draft' && last?.step === 'rejected' ? last : undefined;
}

/** Next version number: 1.0 → 1.1, 0.9 → 1.0. */
export function bumpVersion(v: string): string {
  const n = parseFloat(v.replace(',', '.'));
  return Number.isFinite(n) ? (Math.round((n + 0.1) * 10) / 10).toFixed(1) : v || '1.0';
}

export type WfAction = 'submit' | 'approve' | 'reject' | 'reopen' | 'setStatus';

/** Patch for an element after a workflow action. */
export function workflowPatch(item: WfItem, action: WfAction, byUserId: string, comment = '', status?: string): Partial<WfItem> {
  const at = now();
  const entry = (step: WorkflowEntry['step'], next: string): WorkflowEntry => ({ step, byUserId, at, comment, status: next });
  const history = historyOf(item);
  switch (action) {
    case 'submit':
      return { status: WF.review, workflow: [...history, entry('submitted', WF.review)] };
    case 'approve':
      return {
        status: WF.released,
        // first release: 1.0, then 1.1, 1.2 …
        version: lastStep(item, 'approved') || parseFloat(item.version) >= 1 ? bumpVersion(item.version) : '1.0',
        // the changed draft is the released state now
        released: undefined,
        ...('lastReview' in item ? { lastReview: at.slice(0, 10) } : {}),
        workflow: [...history, entry('approved', WF.released)],
      };
    case 'reject':
      return { status: WF.draft, workflow: [...history, entry('rejected', WF.draft)] };
    case 'reopen':
      return { status: WF.draft, released: item.released ?? snapshotOf(item), workflow: [...history, entry('reopened', WF.draft)] };
    case 'setStatus':
      return { status: status ?? item.status, workflow: [...history, entry('status', status ?? item.status)] };
  }
}

/** Mandate approval: draft → granted by the grantor → accepted by the recipient (effective). */
export type MandateWfAction = 'grant' | 'accept' | 'decline';

export function mandateStage(m: Mandate): 'draft' | 'grant' | 'accept' | 'done' | 'revoked' {
  if (m.status === 'Widerrufen') return 'revoked';
  if (m.status !== 'Erteilt') return 'grant';
  return m.acceptedAt ? 'done' : 'accept';
}

export function mandatePatch(m: Mandate, action: MandateWfAction, byUserId: string, comment = ''): Partial<Mandate> {
  const at = now();
  const history = m.workflow ?? [];
  const entry = (step: WorkflowEntry['step'], status: string): WorkflowEntry => ({ step, byUserId, at, comment, status });
  switch (action) {
    case 'grant':
      return { status: 'Erteilt', validFrom: m.validFrom || at.slice(0, 10), workflow: [...history, entry('granted', 'Erteilt')] };
    case 'accept':
      return { acceptedAt: at.slice(0, 10), workflow: [...history, entry('accepted', 'Erteilt')] };
    case 'decline':
      return { status: 'Entwurf', acceptedAt: '', workflow: [...history, entry('declined', 'Entwurf')] };
  }
}

/** Copy of the released element (kept while a changed draft waits for approval). */
export function snapshotOf(item: WfItem): ReleasedSnapshot {
  const copy = JSON.parse(JSON.stringify(item)) as Record<string, unknown>;
  delete copy.workflow;
  delete copy.released;
  return { ...copy, releasedAt: lastStep(item, 'approved')?.at ?? '' } as ReleasedSnapshot;
}

/** Days since an ISO timestamp. */
export const daysSince = (iso: string | undefined, today = new Date()) =>
  iso ? Math.max(0, Math.floor((today.getTime() - Date.parse(iso)) / 86_400_000)) : 0;
