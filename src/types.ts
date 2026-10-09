// Domain model of the GRC prototype.
// Metadata fields are aligned with ISO 9001:2015, ISO/IEC 27001:2022 and ISO 37301:2021.

export type EntityKind = 'risk' | 'opportunity' | 'control' | 'role' | 'kpi' | 'user';
/** Kinds that can be assigned to process steps. */
export type AssignableKind = Exclude<EntityKind, 'user'>;

export interface BaseEntity {
  id: string;
  code: string;
  title: string;
  description: string;
  createdAt: string;
  updatedAt: string;
}

/** ISO 9001 6.1 · ISO/IEC 27001 6.1.2 / 8.2 · ISO 37301 4.6 */
export interface Risk extends BaseEntity {
  category: string;
  cause: string;
  consequence: string;
  affectedAssets: string;
  protectionGoals: string[]; // C / I / A
  complianceObligation: string;
  interestedParties: string;
  ownerRoleId: string;
  likelihood: number; // 1..5 gross
  impact: number; // 1..5 gross
  treatment: string;
  treatmentPlan: string;
  residualLikelihood: number;
  residualImpact: number;
  acceptedBy: string;
  acceptedAt: string;
  status: string;
  lastAssessment: string;
  nextReview: string;
  isoRefs: string[];
}

/** ISO 9001 6.1 · ISO 37301 6.1 */
export interface Opportunity extends BaseEntity {
  category: string;
  benefit: string;
  likelihood: number;
  benefitScore: number;
  measures: string;
  ownerRoleId: string;
  status: string;
  nextReview: string;
  isoRefs: string[];
}

/** IKS · ISO/IEC 27001 Annex A + SoA · ISO 37301 8.2 · ISO 9001 8.1 */
export interface Control extends BaseEntity {
  objective: string;
  controlType: string;
  automation: string;
  frequency: string;
  keyControl: boolean;
  ownerRoleId: string;
  executorRoleId: string;
  evidence: string;
  annexA: string[];
  soaApplicable: string;
  soaJustification: string;
  implementation: string;
  designEffectiveness: string;
  operatingEffectiveness: string;
  testMethod: string;
  lastTest: string;
  nextTest: string;
  testResult: string;
  mitigatesRiskIds: string[];
  isoRefs: string[];
}

export type RoleType = 'Führungsrolle' | 'Fachrolle' | 'Gremium' | 'Beauftragter';

/** A person holding a role (as holder or deputy). */
export interface RoleMember {
  userId: string;
  function: 'Inhaber' | 'Stellvertretung';
  since: string;
  /** deputy has been trained / inducted (ISO 27001 A.5.29) */
  inducted: boolean;
}

/** ISO 9001 5.3 / 7.2 · ISO/IEC 27001 5.2 / 5.3 (A) · ISO 37301 5.3 */
export interface Role extends BaseEntity {
  roleType: RoleType;
  /** required by a standard, law or regulation (e.g. ISB, DPO, export control officer) */
  mandatory: boolean;
  orgUnit: string;
  members: RoleMember[];
  roleOwnerUserId: string;
  responsibilities: string;
  authorities: string;
  competencies: string;
  trainings: string;
  incompatibleRoleIds: string[];
  complianceRelevant: boolean;
  // appointment (ISO 37301 5.3.2, ISO 27001 5.3)
  appointmentRequired: boolean;
  appointedAt: string;
  appointedByUserId: string;
  appointmentDocument: string;
  // reporting lines (role id, '' = not set, 'n/a' = not applicable)
  reportsToFunctionalRoleId: string;
  reportsToDisciplinaryRoleId: string;
  // validity & review
  version: string;
  status: string;
  lastReview: string;
  nextReview: string;
  isoRefs: string[];
}

/** Tool user (user management module). */
export interface User extends BaseEntity {
  email: string;
  department: string;
  jobTitle: string;
  status: 'Aktiv' | 'Inaktiv' | 'Gesperrt';
  systemRoles: string[];
  validUntil: string;
}

export interface Measurement {
  date: string;
  value: number;
}

/** ISO 9001 6.2 / 9.1 · ISO/IEC 27001 9.1 · ISO 37301 9.1 */
export interface Kpi extends BaseEntity {
  objective: string;
  formula: string;
  unit: string;
  direction: 'higher' | 'lower';
  target: number;
  warning: number;
  critical: number;
  frequency: string;
  dataSource: string;
  ownerRoleId: string;
  evaluatorRoleId: string;
  measurements: Measurement[];
  isoRefs: string[];
}

export type Raci = 'R' | 'A' | 'C' | 'I';

export interface StepAssignment {
  risks: string[];
  opportunities: string[];
  controls: string[];
  roles: { roleId: string; raci: Raci }[];
  kpis: string[];
  note: string;
}

export interface ProcessModel {
  id: string;
  code: string;
  title: string;
  description: string;
  category: 'Führungsprozess' | 'Kernprozess' | 'Unterstützungsprozess';
  ownerRoleId: string;
  version: string;
  status: string;
  standards: string[];
  nextReview: string;
  /** ISO 9001 4.4: inputs, outputs and resources of the process */
  inputs?: string;
  outputs?: string;
  resources?: string;
  xml: string;
  /** BPMN element id -> assignment */
  assignments: Record<string, StepAssignment>;
  /** BPMN call activity id -> linked process id */
  callLinks: Record<string, string>;
  createdAt: string;
  updatedAt: string;
}

export interface EntityMap {
  risk: Risk;
  opportunity: Opportunity;
  control: Control;
  role: Role;
  kpi: Kpi;
  user: User;
}

export type AnyEntity = EntityMap[EntityKind];
