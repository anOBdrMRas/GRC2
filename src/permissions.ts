// System roles of the tool itself (not to be confused with organisational roles in the role module).
import type { User } from './types';

export type ModuleKey = 'processes' | 'risk' | 'opportunity' | 'control' | 'role' | 'position' | 'mandate' | 'kpi' | 'audit' | 'user';
export type Right = 'none' | 'read' | 'edit';

export const moduleLabels: Record<ModuleKey, string> = {
  processes: 'Prozesse',
  risk: 'Risiken',
  opportunity: 'Chancen',
  control: 'Controls (IKS)',
  role: 'Rollen',
  position: 'Stellen',
  mandate: 'Delegationen & Vollmachten',
  kpi: 'KPI',
  audit: 'Audits',
  user: 'Benutzerverwaltung',
};

export const moduleKeys = Object.keys(moduleLabels) as ModuleKey[];

export interface SystemRole {
  id: string;
  name: string;
  description: string;
  rights: Record<ModuleKey, Right>;
}

const all = (r: Right, overrides: Partial<Record<ModuleKey, Right>> = {}): Record<ModuleKey, Right> => ({
  processes: r,
  risk: r,
  opportunity: r,
  control: r,
  role: r,
  position: r,
  mandate: r,
  kpi: r,
  audit: r,
  user: r,
  ...overrides,
});

/**
 * Two system roles only. What a person may EDIT follows from ownership in the data
 * (role owner, process owner, supervisor of a position …), see src/ownership.ts.
 */
export const systemRoles: SystemRole[] = [
  {
    id: 'employee',
    name: 'Mitarbeiter',
    description: 'Liest alle Inhalte außer der Benutzerverwaltung. Bearbeitet die Elemente, deren Owner er ist.',
    rights: all('read', { user: 'none' }),
  },
  {
    id: 'admin',
    name: 'Administrator',
    description: 'Legt neue Elemente an, löscht und bearbeitet alles, pflegt Benutzer und Systemrollen.',
    rights: all('edit'),
  },
];

/** Maps system roles of earlier versions: administrators stay administrators, everybody else becomes an employee. */
export function migrateSystemRoles(ids: string[] | undefined): string[] {
  return ids?.includes('admin') ? ['admin'] : ['employee'];
}

export const systemRoleById = new Map(systemRoles.map((r) => [r.id, r]));

/** System role combinations that violate segregation of duties within the tool. */
export const systemRoleConflicts: [string, string, string][] = [];

const rank: Record<Right, number> = { none: 0, read: 1, edit: 2 };

export function effectiveRights(user: User | undefined): Record<ModuleKey, Right> {
  const out = all('none');
  if (!user || user.status !== 'Aktiv') return out;
  for (const id of user.systemRoles) {
    const role = systemRoleById.get(id);
    if (!role) continue;
    for (const m of moduleKeys) if (rank[role.rights[m]] > rank[out[m]]) out[m] = role.rights[m];
  }
  return out;
}

export function userSystemRoleConflicts(user: User) {
  return systemRoleConflicts.filter(([a, b]) => user.systemRoles.includes(a) && user.systemRoles.includes(b));
}

export const rightLabel: Record<Right, string> = { none: '–', read: 'Lesen', edit: 'Bearbeiten' };
