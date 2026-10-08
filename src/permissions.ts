// System roles of the tool itself (not to be confused with organisational roles in the role module).
import type { User } from './types';

export type ModuleKey = 'processes' | 'risk' | 'opportunity' | 'control' | 'role' | 'kpi' | 'user';
export type Right = 'none' | 'read' | 'edit';

export const moduleLabels: Record<ModuleKey, string> = {
  processes: 'Prozesse',
  risk: 'Risiken',
  opportunity: 'Chancen',
  control: 'Controls (IKS)',
  role: 'Rollen',
  kpi: 'KPI',
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
  kpi: r,
  user: r,
  ...overrides,
});

export const systemRoles: SystemRole[] = [
  {
    id: 'admin',
    name: 'Administrator',
    description: 'Vollzugriff inkl. Benutzerverwaltung, Systemrollen und Datenimport.',
    rights: all('edit'),
  },
  {
    id: 'grc-manager',
    name: 'GRC-Manager',
    description: 'Pflegt alle Fachmodule und Prozesse, sieht die Benutzerverwaltung.',
    rights: all('edit', { user: 'read' }),
  },
  {
    id: 'process-modeler',
    name: 'Prozessmodellierer',
    description: 'Modelliert Prozesse und ordnet Elemente den Prozessschritten zu.',
    rights: all('read', { processes: 'edit', user: 'none' }),
  },
  {
    id: 'risk-manager',
    name: 'Risikomanager',
    description: 'Identifiziert und bewertet Risiken und Chancen.',
    rights: all('read', { risk: 'edit', opportunity: 'edit', user: 'none' }),
  },
  {
    id: 'control-owner',
    name: 'IKS-Verantwortlicher',
    description: 'Pflegt Kontrollen, SoA und dokumentiert Wirksamkeitsprüfungen.',
    rights: all('read', { control: 'edit', user: 'none' }),
  },
  {
    id: 'compliance',
    name: 'Compliance Officer',
    description: 'Pflegt Compliance-Risiken, Kontrollen und Rollen (Compliance-Funktion).',
    rights: all('read', { risk: 'edit', control: 'edit', role: 'edit', user: 'none' }),
  },
  {
    id: 'org-manager',
    name: 'Organisationsverantwortlicher',
    description: 'Pflegt Rollenbeschreibungen, Stelleninhaber und Berichtslinien.',
    rights: all('read', { role: 'edit', user: 'read' }),
  },
  {
    id: 'kpi-owner',
    name: 'KPI-Verantwortlicher',
    description: 'Definiert Kennzahlen und erfasst Messwerte.',
    rights: all('read', { kpi: 'edit', user: 'none' }),
  },
  {
    id: 'auditor',
    name: 'Auditor',
    description: 'Lesezugriff auf alle Inhalte inkl. Benutzer und Berechtigungen (interne/externe Audits).',
    rights: all('read'),
  },
  {
    id: 'reader',
    name: 'Leser',
    description: 'Lesezugriff auf Prozesse und Fachmodule, z. B. für Mitarbeitende.',
    rights: all('read', { user: 'none' }),
  },
];

export const systemRoleById = new Map(systemRoles.map((r) => [r.id, r]));

/** System role combinations that violate segregation of duties within the tool. */
export const systemRoleConflicts: [string, string, string][] = [
  ['admin', 'auditor', 'Administratoren dürfen sich nicht selbst prüfen.'],
  ['control-owner', 'auditor', 'Kontrollverantwortliche dürfen ihre Kontrollen nicht selbst auditieren.'],
];

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
