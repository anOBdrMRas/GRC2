import { useStore } from './store';
import { effectiveRights, type ModuleKey } from './permissions';
import { isOwner, ownerFields, type OwnKind } from './ownership';
import { isWfKind, stageOf } from './workflow';

/**
 * Rights of the logged-in user:
 * - everybody reads (employees: everything except the user management),
 * - owners edit the elements they own (processes, roles, positions only while in draft or released),
 * - the I&A team gives the quality approval in the workflow,
 * - administrators create, delete, edit everything and control the workflow.
 */
export function useRights() {
  const s = useStore();
  const user = s.user.find((u) => u.id === s.currentUserId);
  const rights = effectiveRights(user);
  const active = !!user && user.status === 'Aktiv';
  const isAdmin = active && user.systemRoles.includes('admin');
  const isIa = active && user.systemRoles.includes('ia');
  const owner = (kind: OwnKind, entity: unknown) => active && isOwner(user.id, kind, entity, s);
  /** while an element waits for the I&A review its content is frozen for owners */
  const inReview = (kind: OwnKind, entity: unknown) => isWfKind(kind) && stageOf((entity as { status?: string }).status) === 'review';
  return {
    user,
    rights,
    isAdmin,
    isIa,
    /** may give or refuse the I&A quality approval */
    canReview: isIa || isAdmin,
    canRead: (m: ModuleKey) => rights[m] !== 'none',
    /** administrator level: create, delete, manage */
    canEdit: (m: ModuleKey) => rights[m] === 'edit',
    canCreate: (m: ModuleKey) => rights[m] === 'edit',
    /** edit an existing element: administrators and its owners */
    canEditEntity: (kind: OwnKind, entity: unknown) => isAdmin || (owner(kind, entity) && !inReview(kind, entity)),
    isOwnerOf: owner,
    inReview,
    /** ownership-defining fields stay with administrators; the status of workflow elements is set by the workflow */
    canEditField: (kind: OwnKind, key: string) => isAdmin || !((ownerFields[kind] ?? []).includes(key) || (isWfKind(kind) && key === 'status')),
  };
}
