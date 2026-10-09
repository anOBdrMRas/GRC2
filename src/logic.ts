import type { AnyEntity, AssignableKind, EntityKind, EntityMap, Kpi, ProcessModel, Risk, Role, StepAssignment, User } from './types';

export const uid = () => Math.random().toString(36).slice(2, 10);
export const now = () => new Date().toISOString();
export const today = () => new Date().toISOString().slice(0, 10);

export function riskScore(likelihood: number, impact: number) {
  return (likelihood || 0) * (impact || 0);
}

export type Level = 'low' | 'medium' | 'high' | 'critical';

export function riskLevel(score: number): Level {
  if (score >= 15) return 'critical';
  if (score >= 10) return 'high';
  if (score >= 5) return 'medium';
  return 'low';
}

export const levelLabel: Record<Level, string> = {
  low: 'Gering',
  medium: 'Mittel',
  high: 'Hoch',
  critical: 'Kritisch',
};

export type Traffic = 'green' | 'yellow' | 'red' | 'none';

export function kpiStatus(k: Kpi): Traffic {
  const last = k.measurements.at(-1);
  if (!last) return 'none';
  const v = last.value;
  if (k.direction === 'higher') {
    if (v >= k.target) return 'green';
    if (v > k.critical) return 'yellow';
    return 'red';
  }
  if (v <= k.target) return 'green';
  if (v < k.critical) return 'yellow';
  return 'red';
}

export function emptyAssignment(): StepAssignment {
  return { risks: [], opportunities: [], controls: [], roles: [], kpis: [], note: '' };
}

/** Maps entity kind to the key used in StepAssignment. */
export const assignmentKey = {
  risk: 'risks',
  opportunity: 'opportunities',
  control: 'controls',
  kpi: 'kpis',
} as const;

export function assignedIds(a: StepAssignment, kind: AssignableKind): string[] {
  return kind === 'role' ? a.roles.map((r) => r.roleId) : a[assignmentKey[kind]];
}

export function blankEntity<K extends EntityKind>(kind: K, code: string, title = ''): EntityMap[K] {
  const common = { id: uid(), code, title, description: '', createdAt: now(), updatedAt: now() };
  const byKind: { [P in EntityKind]: EntityMap[P] } = {
    risk: {
      ...common,
      category: 'Operativ',
      cause: '',
      consequence: '',
      affectedAssets: '',
      protectionGoals: [],
      complianceObligation: '',
      interestedParties: '',
      ownerRoleId: '',
      likelihood: 3,
      impact: 3,
      treatment: 'Reduzieren',
      treatmentPlan: '',
      residualLikelihood: 2,
      residualImpact: 2,
      acceptedBy: '',
      acceptedAt: '',
      status: 'Identifiziert',
      lastAssessment: today(),
      nextReview: '',
      isoRefs: [],
    },
    opportunity: {
      ...common,
      category: 'Effizienz',
      benefit: '',
      likelihood: 3,
      benefitScore: 3,
      measures: '',
      ownerRoleId: '',
      status: 'Identifiziert',
      nextReview: '',
      isoRefs: ['9001:6.1'],
    },
    control: {
      ...common,
      objective: '',
      controlType: 'Präventiv',
      automation: 'Manuell',
      frequency: 'Ereignisbezogen',
      keyControl: false,
      ownerRoleId: '',
      executorRoleId: '',
      evidence: '',
      annexA: [],
      soaApplicable: 'Ja',
      soaJustification: '',
      implementation: 'Geplant',
      designEffectiveness: 'Nicht geprüft',
      operatingEffectiveness: 'Nicht geprüft',
      testMethod: 'Einsichtnahme',
      lastTest: '',
      nextTest: '',
      testResult: '',
      mitigatesRiskIds: [],
      isoRefs: [],
    },
    role: {
      ...common,
      roleType: 'Fachrolle',
      mandatory: false,
      orgUnit: 'Generic',
      members: [],
      roleOwnerUserId: '',
      responsibilities: '',
      authorities: '',
      competencies: '',
      trainings: '',
      deputyRoleId: '',
      incompatibleRoleIds: [],
      complianceRelevant: false,
      appointmentRequired: false,
      appointedAt: '',
      appointedByUserId: '',
      appointmentDocument: '',
      reportsToFunctionalRoleId: '',
      reportsToDisciplinaryRoleId: '',
      criticality: 'Normal',
      continuityNote: '',
      version: '0.1',
      status: 'Entwurf',
      lastReview: '',
      nextReview: '',
      isoRefs: ['9001:5.3'],
    },
    user: {
      ...common,
      email: '',
      department: '',
      jobTitle: '',
      status: 'Aktiv',
      systemRoles: ['reader'],
      validUntil: '',
    },
    kpi: {
      ...common,
      objective: '',
      formula: '',
      unit: '%',
      direction: 'higher',
      target: 95,
      warning: 90,
      critical: 85,
      frequency: 'Monatlich',
      dataSource: '',
      ownerRoleId: '',
      evaluatorRoleId: '',
      measurements: [],
      isoRefs: ['9001:9.1'],
    },
  };
  return byKind[kind];
}

export interface Usage {
  process: ProcessModel;
  elementId: string;
  elementName: string;
  raci?: string;
}

export const activityTypes = [
  'task',
  'userTask',
  'manualTask',
  'serviceTask',
  'scriptTask',
  'businessRuleTask',
  'sendTask',
  'receiveTask',
  'subProcess',
  'callActivity',
];

export interface ParsedElement {
  id: string;
  type: string;
  name: string;
  /** number of enclosing sub processes */
  depth: number;
}

const BPMN_MODEL_NS = 'http://www.omg.org/spec/BPMN/20100524/MODEL';
const parseCache = new Map<string, ParsedElement[]>();

/** Extracts all BPMN model elements (document order, with sub process nesting) without a modeler instance. */
export function parseElements(xml: string): ParsedElement[] {
  const cached = parseCache.get(xml);
  if (cached) return cached;
  const out: ParsedElement[] = [];
  const doc = new DOMParser().parseFromString(xml, 'application/xml');
  const walk = (el: Element, depth: number) => {
    for (const child of Array.from(el.children)) {
      if (child.namespaceURI !== BPMN_MODEL_NS) continue;
      const id = child.getAttribute('id');
      const type = child.localName;
      if (id) {
        const name = (child.getAttribute('name') ?? '').replace(/\s+/g, ' ').trim();
        out.push({ id, type, name: name || `${type} ${id}`, depth });
      }
      walk(child, type === 'subProcess' ? depth + 1 : depth);
    }
  };
  walk(doc.documentElement, 0);
  if (parseCache.size > 50) parseCache.clear();
  parseCache.set(xml, out);
  return out;
}

export function elementNames(xml: string): Record<string, string> {
  return Object.fromEntries(parseElements(xml).map((e) => [e.id, e.name]));
}

/** Finds all process steps an entity is assigned to. */
export function findUsages(processes: ProcessModel[], kind: EntityKind, id: string): Usage[] {
  const out: Usage[] = [];
  if (kind === 'user') return out;
  for (const p of processes) {
    const names = elementNames(p.xml);
    for (const [elementId, a] of Object.entries(p.assignments)) {
      if (!(elementId in names)) continue;
      if (kind === 'role') {
        const r = a.roles.find((x) => x.roleId === id);
        if (r) out.push({ process: p, elementId, elementName: names[elementId], raci: r.raci });
      } else if (a[assignmentKey[kind]].includes(id)) {
        out.push({ process: p, elementId, elementName: names[elementId] });
      }
    }
  }
  return out;
}

export function entityName(e: AnyEntity | undefined) {
  return e ? `${e.code} ${e.title}` : '—';
}

export function residualScore(r: Risk) {
  return riskScore(r.residualLikelihood, r.residualImpact);
}

/** Fills fields added in later versions so older stored data keeps working. */
export const orgUnits = ['Generic', 'Technology', 'Operation', 'Marketing', 'Sales', 'Finance and Admin', 'Business Enablement', 'Other'];

/** Maps free-text organisational units of older data to the fixed list. */
const orgUnitMigration: Record<string, string> = {
  Fachbereiche: 'Generic',
  Geschäftsführung: 'Generic',
  Einkauf: 'Operation',
  Logistik: 'Operation',
  Finanzen: 'Finance and Admin',
  IT: 'Technology',
  'IT / ISMS': 'Technology',
  'Recht & Compliance': 'Business Enablement',
  Qualitätsmanagement: 'Business Enablement',
  Vertrieb: 'Sales',
  Marketing: 'Marketing',
};

type LegacyRole = Partial<Role> & { holders?: string; mandatoryBy?: string[]; systemPermissions?: unknown; directAccessToManagement?: boolean };

/** Fills fields added in later versions so older stored data keeps working. */
export function normalizeRole(r: LegacyRole): Role {
  const base = blankEntity('role', r.code ?? '', r.title ?? '');
  const { holders, mandatoryBy, systemPermissions: _sp, directAccessToManagement: _dam, ...rest } = r;
  const merged = { ...base, ...rest, id: r.id ?? base.id } as Role;
  if (holders && !r.members) merged.description = [merged.description, `Stelleninhaber (alt): ${holders}`].filter(Boolean).join('\n');
  if (r.mandatory === undefined) merged.mandatory = (mandatoryBy?.length ?? 0) > 0;
  if (!orgUnits.includes(merged.orgUnit)) merged.orgUnit = merged.orgUnit ? (orgUnitMigration[merged.orgUnit] ?? 'Other') : 'Generic';
  return merged;
}

export function normalizeUser(u: Partial<User>): User {
  const base = blankEntity('user', u.code ?? '', u.title ?? '');
  return { ...base, ...u, id: u.id ?? base.id } as User;
}

/** Persons assigned to a role, resolved to users. */
export function roleMembers(role: Role, users: User[]) {
  return role.members
    .map((m) => ({ ...m, user: users.find((u) => u.id === m.userId) }))
    .filter((m): m is typeof m & { user: User } => !!m.user);
}

/** Key positions need at least one inducted deputy (ISO 27001 A.5.29). */
export function continuityGap(role: Role) {
  if (role.criticality === 'Normal') return null;
  const deputies = role.members.filter((m) => m.function === 'Stellvertretung');
  if (deputies.length === 0 && !role.deputyRoleId) return 'Keine Stellvertretung benannt.';
  if (deputies.length > 0 && !deputies.some((d) => d.inducted)) return 'Stellvertretung ist nicht eingearbeitet.';
  return null;
}

export interface PersonSodConflict {
  user: User;
  role: Role;
  other: Role;
}

/** Persons who hold two roles that are declared incompatible (SoD check on person level). */
export function personSodConflicts(roles: Role[], users: User[]): PersonSodConflict[] {
  const out: PersonSodConflict[] = [];
  for (const role of roles) {
    for (const other of roles) {
      // each pair once, declared on either side
      if (role.id >= other.id) continue;
      if (!role.incompatibleRoleIds.includes(other.id) && !other.incompatibleRoleIds.includes(role.id)) continue;
      for (const m of role.members) {
        if (!other.members.some((o) => o.userId === m.userId)) continue;
        const user = users.find((u) => u.id === m.userId);
        if (user) out.push({ user, role, other });
      }
    }
  }
  return out;
}
