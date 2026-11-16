// Approval workflow for processes, roles and positions:
// draft (owner) → business approval by the owner → I&A review → released.
import type { Position, ProcessModel, Role, WorkflowEntry } from './types';
import { now } from './logic';

export type WfKind = 'role' | 'position' | 'processes';
export type WfItem = Role | Position | ProcessModel;

export const isWfKind = (k: string): k is WfKind => k === 'role' || k === 'position' || k === 'processes';

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
        version: bumpVersion(item.version),
        ...('lastReview' in item ? { lastReview: at.slice(0, 10) } : {}),
        workflow: [...history, entry('approved', WF.released)],
      };
    case 'reject':
      return { status: WF.draft, workflow: [...history, entry('rejected', WF.draft)] };
    case 'reopen':
      return { status: WF.draft, workflow: [...history, entry('reopened', WF.draft)] };
    case 'setStatus':
      return { status: status ?? item.status, workflow: [...history, entry('status', status ?? item.status)] };
  }
}

/** Days since an ISO timestamp. */
export const daysSince = (iso: string | undefined, today = new Date()) =>
  iso ? Math.max(0, Math.floor((today.getTime() - Date.parse(iso)) / 86_400_000)) : 0;
