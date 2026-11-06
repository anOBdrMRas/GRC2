// Ownership and assignments: who owns an element (may edit it) and what is assigned to a person.
import type { Audit, Control, EntityKind, Kpi, Mandate, Opportunity, Position, ProcessModel, Risk, Role, User } from './types';
import { allFindings, isOpenFinding, orgIssues, parseElements, roleHolders, rolesOfUser, type FindingRef, type OrgIssue } from './logic';

/** Everything ownership is derived from (the store satisfies this). */
export interface OwnershipData {
  user: User[];
  role: Role[];
  position: Position[];
  mandate: Mandate[];
  risk: Risk[];
  opportunity: Opportunity[];
  control: Control[];
  kpi: Kpi[];
  audit: Audit[];
  processes: ProcessModel[];
}

export type OwnKind = EntityKind | 'processes';

/** Fields that define ownership: only administrators may change them, so owners cannot hand their responsibility on. */
export const ownerFields: Partial<Record<OwnKind, string[]>> = {
  role: ['roleOwnerUserId'],
  position: ['reportsToDisciplinaryId'],
  risk: ['ownerRoleId'],
  opportunity: ['ownerRoleId'],
  control: ['ownerRoleId'],
  kpi: ['ownerRoleId'],
  mandate: ['grantedByUserId', 'grantedByBody'],
  audit: ['leadAuditorUserId'],
  processes: ['ownerRoleId'],
};

/** How ownership is determined, per element type (shown in the rights overview). */
export const ownershipRule: Partial<Record<OwnKind, string>> = {
  processes: 'Inhaber der Rolle „Prozessverantwortlicher“',
  role: 'Rollenverantwortlicher',
  position: 'Inhaber der disziplinarisch übergeordneten Stelle (Vorgesetzter)',
  risk: 'Inhaber der Rolle „Risikoeigner“',
  opportunity: 'Inhaber der verantwortlichen Rolle',
  control: 'Inhaber der Rolle „Kontrollverantwortlicher“',
  kpi: 'Inhaber der Rolle „Verantwortlich für Messung“',
  mandate: 'Erteilende Person (Delegierender)',
  audit: 'Leitender Auditor',
};

const holdersOfRole = (roleId: string, d: Pick<OwnershipData, 'role' | 'position' | 'user'>) => {
  const role = d.role.find((r) => r.id === roleId);
  return role ? roleHolders(role, d).map((h) => h.user.id) : [];
};

/** Persons who own an element. */
export function ownersOf(kind: OwnKind, entity: unknown, d: Pick<OwnershipData, 'role' | 'position' | 'user'>): string[] {
  const e = entity as Record<string, string>;
  switch (kind) {
    case 'role':
      return e.roleOwnerUserId ? [e.roleOwnerUserId] : [];
    case 'position': {
      const sup = e.reportsToDisciplinaryId;
      return !sup || sup === 'n/a' ? [] : d.user.filter((u) => u.positionId === sup).map((u) => u.id);
    }
    case 'processes':
    case 'risk':
    case 'opportunity':
    case 'control':
    case 'kpi':
      return e.ownerRoleId ? holdersOfRole(e.ownerRoleId, d) : [];
    case 'mandate':
      return e.grantedByUserId ? [e.grantedByUserId] : [];
    case 'audit':
      return e.leadAuditorUserId ? [e.leadAuditorUserId] : [];
    default:
      return [];
  }
}

export const isOwner = (userId: string | undefined, kind: OwnKind, entity: unknown, d: Pick<OwnershipData, 'role' | 'position' | 'user'>) =>
  !!userId && ownersOf(kind, entity, d).includes(userId);

export interface MyStep {
  process: ProcessModel;
  elementId: string;
  name: string;
  raci: string;
  role: Role;
}

/** Process steps a person takes part in through the roles of their position. */
export function stepsOfUser(userId: string, d: OwnershipData): MyStep[] {
  const roles = new Map(rolesOfUser(userId, d).map(({ role }) => [role.id, role]));
  const out: MyStep[] = [];
  for (const process of d.processes) {
    const names = new Map(parseElements(process.xml).map((e) => [e.id, e.name]));
    for (const [elementId, a] of Object.entries(process.assignments)) {
      if (!names.has(elementId)) continue;
      for (const r of a.roles) {
        const role = roles.get(r.roleId);
        if (role) out.push({ process, elementId, name: names.get(elementId)!, raci: r.raci, role });
      }
    }
  }
  return out;
}

export interface MyAssignments {
  user: User;
  position?: Position;
  roles: Role[];
  steps: MyStep[];
  mandates: Mandate[];
  controls: Control[];
  kpis: Kpi[];
  findings: FindingRef[];
  todos: OrgIssue[];
}

/** What is assigned to a person (read access, no ownership). */
export function assignmentsOf(user: User, d: OwnershipData): MyAssignments {
  const roles = rolesOfUser(user.id, d).map(({ role }) => role);
  const roleIds = new Set(roles.map((r) => r.id));
  return {
    user,
    position: d.position.find((p) => p.id === user.positionId),
    roles: [...new Map(roles.map((r) => [r.id, r])).values()],
    steps: stepsOfUser(user.id, d),
    mandates: d.mandate.filter((m) => m.recipientUserId === user.id),
    controls: d.control.filter((c) => roleIds.has(c.executorRoleId)),
    kpis: d.kpi.filter((k) => roleIds.has(k.evaluatorRoleId)),
    findings: allFindings(d.audit).filter(
      ({ finding: f }) => isOpenFinding(f) && (f.responsibleUserId === user.id || roleIds.has(f.responsibleRoleId)),
    ),
    todos: orgIssues(d).filter((i) => i.userId === user.id && i.kind !== 'role'),
  };
}

export interface MyOwnership {
  position: Position[];
  role: Role[];
  processes: ProcessModel[];
  risk: Risk[];
  opportunity: Opportunity[];
  control: Control[];
  kpi: Kpi[];
  mandate: Mandate[];
  audit: Audit[];
  /** open issues on owned elements and on the persons in owned positions */
  issues: OrgIssue[];
  count: number;
}

/** Elements a person owns and may therefore edit. */
export function ownershipOf(userId: string, d: OwnershipData): MyOwnership {
  const own = <T>(kind: OwnKind, xs: T[]) => xs.filter((x) => isOwner(userId, kind, x, d));
  const o = {
    position: own('position', d.position),
    role: own('role', d.role),
    processes: own('processes', d.processes),
    risk: own('risk', d.risk),
    opportunity: own('opportunity', d.opportunity),
    control: own('control', d.control),
    kpi: own('kpi', d.kpi),
    mandate: own('mandate', d.mandate),
    audit: own('audit', d.audit),
  };
  const ids = new Set(Object.values(o).flatMap((xs) => xs.map((x) => (x as { id: string }).id)));
  const team = new Set(d.user.filter((u) => o.position.some((p) => p.id === u.positionId)).map((u) => u.id));
  const issues = orgIssues(d).filter((i) => ids.has(i.id) || (i.kind === 'user' && team.has(i.id)));
  return { ...o, issues, count: ids.size };
}
