import type { AnyEntity, AssignableKind, Audit, AuditFinding, EntityKind, EntityMap, Kpi, Position, ProcessModel, Risk, Role, StepAssignment, User } from './types';

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
      incompatibleRoleIds: [],
      complianceRelevant: false,
      appointmentRequired: false,
      appointedAt: '',
      appointedByUserId: '',
      appointmentDocument: '',
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
      positionId: '',
      positionSince: '',
    },
    position: {
      ...common,
      orgUnit: 'Generic',
      isManager: false,
      headcount: 1,
      location: '',
      purpose: '',
      tasks: '',
      authorities: '',
      qualification: '',
      experience: '',
      competencies: '',
      trainings: '',
      screeningRequired: false,
      ndaRequired: true,
      reportsToDisciplinaryId: '',
      reportsToFunctionalId: '',
      deputyPositionId: '',
      deputyInducted: false,
      roles: [],
      version: '0.1',
      status: 'Entwurf',
      lastReview: '',
      nextReview: '',
      isoRefs: ['9001:5.3', '9001:7.2'],
    },
    audit: {
      ...common,
      auditType: 'Internes Audit',
      certStage: '',
      programYear: today().slice(0, 4),
      status: 'Geplant',
      standards: [],
      criteria: [],
      processIds: [],
      auditedRoleIds: [],
      sites: '',
      objective: '',
      leadAuditorUserId: '',
      externalLeadAuditor: '',
      teamUserIds: [],
      externalOrg: '',
      auditeeContactUserId: '',
      plannedDate: '',
      startDate: '',
      endDate: '',
      reportDate: '',
      reportDocument: '',
      certificateValidUntil: '',
      nextAuditDue: '',
      verdict: '',
      summary: '',
      strengths: '',
      findings: [],
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
  if (kind === 'user' || kind === 'audit' || kind === 'position') return out;
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

type LegacyRole = Partial<Role> & {
  holders?: string;
  mandatoryBy?: string[];
  systemPermissions?: unknown;
  directAccessToManagement?: boolean;
  reportsToFunctionalRoleId?: string;
  reportsToDisciplinaryRoleId?: string;
  criticality?: string;
  deputyRoleId?: string;
  continuityNote?: string;
};

/** Fills fields added in later versions so older stored data keeps working. */
export function normalizeRole(r: LegacyRole): Role {
  const base = blankEntity('role', r.code ?? '', r.title ?? '');
  const {
    holders,
    mandatoryBy,
    systemPermissions: _sp,
    directAccessToManagement: _dam,
    criticality: _c,
    deputyRoleId: _d,
    continuityNote: _n,
    reportsToFunctionalRoleId: _rf,
    reportsToDisciplinaryRoleId: _rd,
    ...rest
  } = r;
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

export function normalizePosition(p: Partial<Position>): Position {
  const base = blankEntity('position', p.code ?? '', p.title ?? '');
  return { ...base, ...p, id: p.id ?? base.id } as Position;
}

// ---- Who holds a role --------------------------------------------------------

/** Organisation data needed to resolve role holders. */
export interface OrgData {
  role: Role[];
  position: Position[];
  user: User[];
}

export interface RoleHolder {
  user: User;
  function: 'Inhaber' | 'Stellvertretung';
  /** 'Stelle' = via the person's position, 'direkt' = assigned to the role directly */
  via: 'Stelle' | 'direkt';
  position?: Position;
  since: string;
  inducted: boolean;
}

/**
 * Persons holding a role: holders of every position the role is assigned to, plus persons assigned
 * directly (exceptions such as appointed officers, external parties or deputies).
 */
export function roleHolders(role: Role, org: Pick<OrgData, 'position' | 'user'>): RoleHolder[] {
  const out: RoleHolder[] = [];
  for (const pos of org.position.filter((p) => p.roles.some((r) => r.roleId === role.id))) {
    for (const user of org.user.filter((u) => u.positionId === pos.id)) {
      out.push({ user, function: 'Inhaber', via: 'Stelle', position: pos, since: user.positionSince, inducted: true });
    }
  }
  for (const m of role.members) {
    if (out.some((h) => h.user.id === m.userId)) continue;
    const user = org.user.find((u) => u.id === m.userId);
    if (user) out.push({ user, function: m.function, via: 'direkt', since: m.since, inducted: m.inducted });
  }
  return out;
}

/** Roles a person holds (via position or directly). */
export function rolesOfUser(userId: string, org: OrgData) {
  return org.role.flatMap((role) => roleHolders(role, org).filter((h) => h.user.id === userId).map((h) => ({ role, holder: h })));
}

export function positionHolders(position: Position, users: User[]) {
  return users.filter((u) => u.positionId === position.id);
}

/** Named deputies should be inducted (ISO 27001 A.5.29). */
export function continuityGap(role: Role) {
  return role.members.some((m) => m.function === 'Stellvertretung' && !m.inducted) ? 'Stellvertretung ist nicht eingearbeitet.' : null;
}

export interface PersonSodConflict {
  user: User;
  role: Role;
  other: Role;
}

const incompatible = (a: Role, b: Role) => a.incompatibleRoleIds.includes(b.id) || b.incompatibleRoleIds.includes(a.id);

/** Persons who hold two roles that are declared incompatible (SoD check on person level). */
export function personSodConflicts(org: OrgData): PersonSodConflict[] {
  const out: PersonSodConflict[] = [];
  const holders = new Map(org.role.map((r) => [r.id, roleHolders(r, org).map((h) => h.user.id)]));
  for (const role of org.role) {
    for (const other of org.role) {
      // each pair once, declared on either side
      if (role.id >= other.id || !incompatible(role, other)) continue;
      for (const userId of holders.get(role.id)!) {
        if (!holders.get(other.id)!.includes(userId)) continue;
        const user = org.user.find((u) => u.id === userId);
        if (user) out.push({ user, role, other });
      }
    }
  }
  return out;
}

/** Incompatible role pairs bundled in the same position. */
export function positionSodConflicts(position: Position, roles: Role[]) {
  const held = position.roles.map((pr) => roles.find((r) => r.id === pr.roleId)).filter((r): r is Role => !!r);
  const out: [Role, Role][] = [];
  for (const a of held) for (const b of held) if (a.id < b.id && incompatible(a, b)) out.push([a, b]);
  return out;
}

/** Positions that report to the given one (disciplinary or functional). */
export function subordinatePositions(position: Position, positions: Position[], line: 'disciplinary' | 'functional') {
  return positions.filter((p) => (line === 'disciplinary' ? p.reportsToDisciplinaryId : p.reportsToFunctionalId) === position.id);
}

// ---- Audits ----------------------------------------------------------------

export function blankFinding(code: string): AuditFinding {
  return {
    id: uid(),
    code,
    type: 'Nebenabweichung',
    clause: '',
    description: '',
    evidence: '',
    processId: '',
    elementId: '',
    riskIds: [],
    controlIds: [],
    responsibleRoleId: '',
    responsibleUserId: '',
    rootCause: '',
    correctiveAction: '',
    dueDate: '',
    status: 'Offen',
    verifiedAt: '',
    verifiedByUserId: '',
    verificationResult: '',
  };
}

export function nextFindingCode(audits: Audit[]) {
  const max = audits.flatMap((a) => a.findings).reduce((m, f) => Math.max(m, parseInt(f.code.replace(/\D+/g, ''), 10) || 0), 0);
  return `F-${String(max + 1).padStart(3, '0')}`;
}

/** Positive findings need no action; everything else is open until closed. */
export function isOpenFinding(f: AuditFinding) {
  return f.type !== 'Positive Feststellung' && f.status !== 'Geschlossen';
}

export function isOverdueFinding(f: AuditFinding, now = today()) {
  return isOpenFinding(f) && !!f.dueDate && f.dueDate < now;
}

export interface FindingRef {
  audit: Audit;
  finding: AuditFinding;
}

export function allFindings(audits: Audit[]): FindingRef[] {
  return audits.flatMap((audit) => audit.findings.map((finding) => ({ audit, finding })));
}

/** Date that places an audit on the calendar (actual start, else planned). */
export function auditDate(a: Audit) {
  return a.startDate || a.plannedDate;
}

export interface IndependenceConflict {
  user: User;
  process: ProcessModel;
  reason: string;
}

/**
 * ISO 19011 4 e) / 7.2: auditors should not audit their own work.
 * Conflict if a lead auditor or team member holds a role that owns an audited process or is R/A in one of its steps.
 */
export function independenceConflicts(audit: Audit, org: OrgData, processes: ProcessModel[]): IndependenceConflict[] {
  const users = org.user;
  const out: IndependenceConflict[] = [];
  const auditors = [audit.leadAuditorUserId, ...audit.teamUserIds].filter(Boolean);
  for (const userId of new Set(auditors)) {
    const user = users.find((u) => u.id === userId);
    if (!user) continue;
    const held = rolesOfUser(userId, org).map((x) => x.role);
    for (const p of processes.filter((x) => audit.processIds.includes(x.id))) {
      const owner = held.find((r) => r.id === p.ownerRoleId);
      if (owner) {
        out.push({ user, process: p, reason: owner.title });
        continue;
      }
      const ra = held.find((r) => Object.values(p.assignments).some((a) => a.roles.some((x) => x.roleId === r.id && (x.raci === 'R' || x.raci === 'A'))));
      if (ra) out.push({ user, process: p, reason: ra.title });
    }
  }
  return out;
}

type LegacyAudit = Partial<Audit>;

export function normalizeAudit(a: LegacyAudit): Audit {
  const base = blankEntity('audit', a.code ?? '', a.title ?? '');
  return {
    ...base,
    ...a,
    id: a.id ?? base.id,
    findings: (a.findings ?? []).map((f) => ({ ...blankFinding(f.code ?? ''), ...f })),
  } as Audit;
}
