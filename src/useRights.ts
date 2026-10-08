import { useStore } from './store';
import { effectiveRights, type ModuleKey } from './permissions';

/** Rights of the (simulated) logged-in user. */
export function useRights() {
  const user = useStore((s) => s.user.find((u) => u.id === s.currentUserId));
  const rights = effectiveRights(user);
  return {
    user,
    rights,
    canRead: (m: ModuleKey) => rights[m] !== 'none',
    canEdit: (m: ModuleKey) => rights[m] === 'edit',
  };
}
