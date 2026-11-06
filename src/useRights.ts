import { useStore } from './store';
import { effectiveRights, type ModuleKey } from './permissions';
import { isOwner, ownerFields, type OwnKind } from './ownership';

/**
 * Rights of the logged-in user:
 * - everybody reads (employees: everything except the user management),
 * - owners edit the elements they own,
 * - administrators create, delete and edit everything.
 */
export function useRights() {
  const s = useStore();
  const user = s.user.find((u) => u.id === s.currentUserId);
  const rights = effectiveRights(user);
  const active = !!user && user.status === 'Aktiv';
  const isAdmin = active && user.systemRoles.includes('admin');
  return {
    user,
    rights,
    isAdmin,
    canRead: (m: ModuleKey) => rights[m] !== 'none',
    /** administrator level: create, delete, manage */
    canEdit: (m: ModuleKey) => rights[m] === 'edit',
    canCreate: (m: ModuleKey) => rights[m] === 'edit',
    /** edit an existing element: administrators and its owners */
    canEditEntity: (kind: OwnKind, entity: unknown) => isAdmin || (active && isOwner(user.id, kind, entity, s)),
    isOwnerOf: (kind: OwnKind, entity: unknown) => active && isOwner(user.id, kind, entity, s),
    /** ownership-defining fields stay with administrators */
    canEditField: (kind: OwnKind, key: string) => isAdmin || !(ownerFields[kind] ?? []).includes(key),
  };
}
