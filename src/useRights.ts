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
  /** risks and opportunities: the person who recorded it may edit it while it is a draft */
  const recorder = (kind: OwnKind, entity: unknown) =>
    active &&
    (kind === 'risk' || kind === 'opportunity') &&
    (entity as { createdByUserId?: string }).createdByUserId === user.id &&
    stageOf((entity as { status?: string }).status) === 'draft';
  /** may manage a module (create, edit, delete, owner fields): administrators everywhere, the I&A team in the GRC modules */
  const manage = (kind: OwnKind) => active && rights[kind as ModuleKey] === 'edit';
  const everybodyRecords = (m: ModuleKey) => active && (m === 'risk' || m === 'opportunity');
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
    /** risks and opportunities are recorded by everybody, all other elements by administrators and the I&A team */
    canCreate: (m: ModuleKey) => rights[m] === 'edit' || everybodyRecords(m),
    /** administrators; the recorder deletes an own draft that was never submitted */
    canManage: manage,
    canDelete: (kind: OwnKind, entity: unknown) =>
      manage(kind) || (recorder(kind, entity) && !((entity as { workflow?: unknown[] }).workflow ?? []).length),
    isRecorder: recorder,
    /** edit an existing element: administrators and its owners */
    canEditEntity: (kind: OwnKind, entity: unknown) => manage(kind) || ((owner(kind, entity) || recorder(kind, entity)) && !inReview(kind, entity)),
    isOwnerOf: owner,
    inReview,
    /** ownership-defining fields stay with administrators; the status of workflow elements is set by the workflow */
    canEditField: (kind: OwnKind, key: string, entity?: unknown) =>
      manage(kind) ||
      !(
        ((ownerFields[kind] ?? []).includes(key) && !(entity !== undefined && recorder(kind, entity))) ||
        (isWfKind(kind) && key === 'status') ||
        // delegations are granted and accepted in their workflow
        (kind === 'mandate' && (key === 'status' || key === 'acceptedAt'))
      ),
  };
}
