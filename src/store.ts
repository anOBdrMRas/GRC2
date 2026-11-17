import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type {
  AssignableKind,
  Audit,
  Opportunity,
  EntityKind,
  EntityMap,
  Mandate,
  Position,
  ProcessModel,
  Raci,
  Risk,
  Role,
  StepAssignment,
  User,
} from './types';
import {
  assignmentKey,
  blankEntity,
  emptyAssignment,
  normalizeAudit,
  normalizeMandate,
  normalizePosition,
  normalizeRole,
  normalizeUser,
  now,
  fullName,
  riskTitle,
  roleHolders,
  uid,
} from './logic';
import { riskEntities } from './riskScale';
import { t } from './i18n';
import { modules, userDepartments } from './schema';
import { useUi } from './ui';
import { emptyConfig, type ContentConfig } from './contentConfig';
import { seedData } from './seed';
import { migrateSystemRoles } from './permissions';
import { emptyDiagram } from './bpmn/templates';
import { isWfKind, mandatePatch, stageOf, workflowPatch, type MandateWfAction, type WfAction, type WfItem, type WfKind } from './workflow';

type Collections = { [K in EntityKind]: EntityMap[K][] };

interface State extends Collections {
  processes: ProcessModel[];
  /** content administration: custom fields and dropdown values */
  config: ContentConfig;
  setConfig: (config: ContentConfig) => void;
  /** simulated login (prototype has no authentication) */
  currentUserId: string;
  setCurrentUser: (id: string) => void;
  /** simulated single sign-on */
  loggedIn: boolean;
  login: (userId: string) => void;
  logout: () => void;

  createEntity: <K extends EntityKind>(kind: K, title?: string) => EntityMap[K];
  updateEntity: <K extends EntityKind>(kind: K, id: string, patch: Partial<EntityMap[K]>) => void;
  deleteEntity: (kind: EntityKind, id: string) => void;

  createProcess: (title: string) => ProcessModel;
  updateProcess: (id: string, patch: Partial<ProcessModel>) => void;
  deleteProcess: (id: string) => void;

  assign: (processId: string, elementId: string, kind: AssignableKind, entityId: string) => void;
  unassign: (processId: string, elementId: string, kind: AssignableKind, entityId: string) => void;
  setRaci: (processId: string, elementId: string, roleId: string, raci: Raci) => void;
  setStepNote: (processId: string, elementId: string, note: string) => void;
  /** approval workflow (processes, roles, positions) */
  workflowAction: (kind: WfKind, id: string, action: WfAction, comment?: string, status?: string) => void;
  /** mandates: granted by the grantor, accepted (or declined) by the recipient */
  mandateAction: (id: string, action: MandateWfAction, comment?: string) => void;

  importAll: (data: Partial<Collections> & { processes: ProcessModel[]; config?: ContentConfig }) => void;
  resetDemo: () => void;
}

export function nextCode(items: { code: string }[], prefix: string) {
  const max = items.reduce((m, i) => {
    const n = parseInt(i.code.replace(/\D+/g, ''), 10);
    return Number.isFinite(n) ? Math.max(m, n) : m;
  }, 0);
  return `${prefix}-${String(max + 1).padStart(3, '0')}`;
}

function updateStep(p: ProcessModel, elementId: string, fn: (a: StepAssignment) => StepAssignment): ProcessModel {
  const current = p.assignments[elementId] ?? emptyAssignment();
  return { ...p, assignments: { ...p.assignments, [elementId]: fn(current) }, updatedAt: now() };
}

/**
 * A released process, role or position that is changed by someone other than an administrator
 * goes back to draft and needs a new approval.
 */
function reopenIfReleased<T extends WfItem>(item: T, s: { user: User[]; currentUserId: string }, patch: object, before: T): T {
  if (stageOf(item.status) !== 'released' || 'status' in patch || 'workflow' in patch) return item;
  const user = s.user.find((u) => u.id === s.currentUserId);
  // administrators and the I&A team change released elements without reopening them
  if (!user || user.systemRoles.includes('admin') || user.systemRoles.includes('ia')) return item;
  // the released state is the element before this change
  return { ...item, ...workflowPatch(before, 'reopen', user.id, '') } as T;
}

export const useStore = create<State>()(
  persist(
    (set, get) => ({
      ...seedData(),

      createEntity: (kind, title = '') => {
        const items = get()[kind];
        const e = blankEntity(kind, nextCode(items, modules[kind].codePrefix), title);
        // risks and opportunities can be recorded by everybody: remember who did
        if (kind === 'risk' || kind === 'opportunity') (e as Risk).createdByUserId = get().currentUserId;
        set({ [kind]: [...items, e] } as Partial<State>);
        useUi.setState({ justCreatedId: e.id });
        return e;
      },

      updateEntity: (kind, id, patch) => {
        // Incompatible roles are symmetric: keep the counterpart roles in sync.
        if (kind === 'role' && 'incompatibleRoleIds' in patch) {
          const next = (patch as Partial<Role>).incompatibleRoleIds ?? [];
          set((s) => ({
            role: s.role.map((r) => {
              if (r.id === id) return reopenIfReleased({ ...r, ...(patch as Partial<Role>), updatedAt: now() }, s, patch, r);
              const has = r.incompatibleRoleIds.includes(id);
              const should = next.includes(r.id);
              if (has === should) return r;
              return {
                ...r,
                incompatibleRoleIds: should ? [...r.incompatibleRoleIds, id] : r.incompatibleRoleIds.filter((x) => x !== id),
                updatedAt: now(),
              };
            }),
          }));
          return;
        }
        set(
          (s) =>
            ({
              [kind]: (s[kind] as EntityMap[typeof kind][]).map((e) => {
                if (e.id !== id) return e;
                const next = { ...e, ...patch, updatedAt: now() };
                // risks have no title field: lists show the first sentence of the description
                if (kind === 'risk' && 'description' in patch) next.title = riskTitle(String(next.description ?? '')) || next.title;
                // persons: the name shown everywhere is "first name last name"
                if (kind === 'user' && ('firstName' in patch || 'lastName' in patch)) next.title = fullName(next as User) || next.title;
                return isWfKind(kind) ? reopenIfReleased(next as WfItem, s, patch, e as WfItem) : next;
              }),
            }) as Partial<State>,
        );
      },

      deleteEntity: (kind, id) =>
        set((s) => {
          if (kind === 'audit') return { audit: s.audit.filter((a) => a.id !== id) };
          if (kind === 'mandate') return { mandate: s.mandate.filter((m) => m.id !== id) };
          const clear = (x: string) => (x === id ? '' : x);
          // mandates are evidence: keep them, only drop the reference
          const mandate = s.mandate.map((m) => ({
            ...m,
            recipientUserId: kind === 'user' ? clear(m.recipientUserId) : m.recipientUserId,
            grantedByUserId: kind === 'user' ? clear(m.grantedByUserId) : m.grantedByUserId,
            roleId: kind === 'role' ? clear(m.roleId) : m.roleId,
            positionId: kind === 'position' ? clear(m.positionId) : m.positionId,
          }));
          if (kind === 'position') {
            return {
              mandate,
              position: s.position
                .filter((p) => p.id !== id)
                .map((p) => ({
                  ...p,
                  reportsToDisciplinaryId: clear(p.reportsToDisciplinaryId),
                  reportsToFunctionalId: clear(p.reportsToFunctionalId),
                  deputyPositionId: clear(p.deputyPositionId),
                })),
              user: s.user.map((u) => (u.positionId === id ? { ...u, positionId: '', positionSince: '' } : u)),
            };
          }
          const audit = scrubAudits(s.audit, kind, id);
          if (kind === 'user') {
            return {
              audit,
              mandate,
              user: s.user.filter((u) => u.id !== id),
              role: s.role.map((r) => ({ ...r, roleOwnerUserId: clear(r.roleOwnerUserId) })),
              risk: s.risk.map((r) =>
                r.ownerUserId === id || r.actions.some((a) => a.ownerUserId === id)
                  ? { ...r, ownerUserId: clear(r.ownerUserId), actions: r.actions.map((a) => ({ ...a, ownerUserId: clear(a.ownerUserId) })) }
                  : r,
              ),
            };
          }
          // Remove the entity and all references to it.
          const processes = s.processes.map((p) => {
            const assignments: Record<string, StepAssignment> = {};
            for (const [el, a] of Object.entries(p.assignments)) {
              assignments[el] =
                kind === 'role'
                  ? { ...a, roles: a.roles.filter((r) => r.roleId !== id) }
                  : { ...a, [assignmentKey[kind]]: a[assignmentKey[kind]].filter((x) => x !== id) };
            }
            return { ...p, assignments };
          });
          const patch: Partial<State> = { processes, audit, [kind]: (s[kind] as { id: string }[]).filter((e) => e.id !== id) };
          if (kind === 'risk') {
            patch.control = s.control.map((c) => ({ ...c, mitigatesRiskIds: c.mitigatesRiskIds.filter((x) => x !== id) }));
          }
          if (kind === 'role') {
            patch.mandate = mandate;
            patch.position = s.position.map((p) => ({ ...p, roles: p.roles.filter((r) => r.roleId !== id) }));
            patch.role = s.role
              .filter((r) => r.id !== id)
              .map((r) => ({
                ...r,
                incompatibleRoleIds: r.incompatibleRoleIds.filter((x) => x !== id),
              }));
          }
          return patch;
        }),

      createProcess: (title) => {
        const p: ProcessModel = {
          id: uid(),
          code: nextCode(get().processes, 'P'),
          title,
          description: '',
          category: 'Kernprozess',
          ownerRoleId: '',
          version: '0.1',
          status: 'Entwurf',
          standards: [],
          nextReview: '',
          xml: emptyDiagram(title),
          assignments: {},
          callLinks: {},
          createdAt: now(),
          updatedAt: now(),
        };
        set((s) => ({ processes: [...s.processes, p] }));
        return p;
      },

      updateProcess: (id, patch) =>
        set((s) => ({ processes: s.processes.map((p) => (p.id === id ? reopenIfReleased({ ...p, ...patch, updatedAt: now() }, s, patch, p) : p)) })),

      workflowAction: (kind, id, action, comment = '', status) =>
        set((s) => {
          const list = (kind === 'processes' ? s.processes : s[kind]) as WfItem[];
          const next = list.map((e) =>
            e.id === id ? ({ ...e, ...workflowPatch(e, action, s.currentUserId, comment, status), updatedAt: now() } as WfItem) : e,
          );
          return { [kind]: next } as Partial<State>;
        }),

      mandateAction: (id, action, comment = '') =>
        set((s) => ({
          mandate: s.mandate.map((m) => (m.id === id ? { ...m, ...mandatePatch(m, action, s.currentUserId, comment), updatedAt: now() } : m)),
        })),

      deleteProcess: (id) =>
        set((s) => ({
          processes: s.processes
            .filter((p) => p.id !== id)
            .map((p) => ({ ...p, callLinks: Object.fromEntries(Object.entries(p.callLinks).filter(([, v]) => v !== id)) })),
          audit: scrubAudits(s.audit, 'process', id),
          risk: s.risk.map((r) => (r.processIds.includes(id) ? { ...r, processIds: r.processIds.filter((x) => x !== id) } : r)),
        })),

      assign: (processId, elementId, kind, entityId) =>
        set((s) => ({
          processes: s.processes.map((p) =>
            p.id !== processId
              ? p
              : reopenIfReleased(
                  updateStep(p, elementId, (a) => {
                    if (kind === 'role') {
                      return a.roles.some((r) => r.roleId === entityId) ? a : { ...a, roles: [...a.roles, { roleId: entityId, raci: 'R' }] };
                    }
                    const key = assignmentKey[kind];
                    return a[key].includes(entityId) ? a : { ...a, [key]: [...a[key], entityId] };
                  }),
                  s,
                  {},
                  p,
                ),
          ),
        })),

      unassign: (processId, elementId, kind, entityId) =>
        set((s) => ({
          processes: s.processes.map((p) =>
            p.id !== processId
              ? p
              : reopenIfReleased(
                  updateStep(p, elementId, (a) =>
                    kind === 'role'
                      ? { ...a, roles: a.roles.filter((r) => r.roleId !== entityId) }
                      : { ...a, [assignmentKey[kind]]: a[assignmentKey[kind]].filter((x) => x !== entityId) },
                  ),
                  s,
                  {},
                  p,
                ),
          ),
        })),

      setRaci: (processId, elementId, roleId, raci) =>
        set((s) => ({
          processes: s.processes.map((p) =>
            p.id !== processId
              ? p
              : reopenIfReleased(
                  updateStep(p, elementId, (a) => ({ ...a, roles: a.roles.map((r) => (r.roleId === roleId ? { ...r, raci } : r)) })),
                  s,
                  {},
                  p,
                ),
          ),
        })),

      setStepNote: (processId, elementId, note) =>
        set((s) => ({
          processes: s.processes.map((p) =>
            p.id !== processId
              ? p
              : reopenIfReleased(
                  updateStep(p, elementId, (a) => ({ ...a, note })),
                  s,
                  {},
                  p,
                ),
          ),
        })),

      setCurrentUser: (currentUserId) => set({ currentUserId }),
      loggedIn: false,
      login: (currentUserId) => set({ currentUserId, loggedIn: true }),
      logout: () => set({ loggedIn: false }),
      importAll: (data) => set(normalizeData(data)),
      config: emptyConfig(),
      setConfig: (config) => set({ config }),
      resetDemo: () =>
        set((s) => {
          const seed = seedData();
          return { ...seed, currentUserId: seed.user.some((u) => u.id === s.currentUserId) ? s.currentUserId : seed.currentUserId };
        }),
    }),
    {
      name: 'grc-prototype-v1',
      version: 11,
      // v1 had no users and free-text role holders
      migrate: (persisted) => ({ ...normalizeData(persisted as Partial<State>), loggedIn: false }),
      onRehydrateStorage: () => (_state, error) => {
        if (error) console.error('Gespeicherte Daten konnten nicht geladen werden', error);
      },
    },
  ),
);

/** Brings imported or previously stored data to the current shape. */
function normalizeData(data: Partial<State>): Partial<State> {
  const seed = seedData();
  // Data that started from the demo gets demo elements added in later versions (matched by id).
  const demoBased = !data.user?.length || data.user.some((u) => u.id === 'U-001');
  const addMissing = <T extends { id: string }>(xs: T[], demo: T[]): T[] =>
    demoBased ? [...xs, ...demo.filter((d) => !xs.some((x) => x.id === d.id))] : xs;
  const users = addMissing(data.user?.length ? data.user : seed.user, seed.user).map((u: Partial<User>) => {
    const demo = seed.user.find((x) => x.id === u.id);
    const merged = normalizeUser({
      ...(demo && u.employmentType === undefined ? pickEmployment(demo) : {}),
      ...(!data.position && u.positionId === undefined ? pick(demo) : {}),
      ...u,
    });
    // v11: Bereich and Abteilung as lists (demo persons get their demo values)
    if ((u as Partial<User>).division === undefined) {
      if (demo) Object.assign(merged, { division: demo.division, department: demo.department });
      else if (merged.department && !userDepartments.includes(merged.department)) {
        merged.description = [merged.description, `${t('Abteilung bisher')}: ${merged.department}`].filter(Boolean).join('\n');
        merged.department = '';
      }
      merged.division ??= '';
    }
    // v6: only the system roles "employee" and "admin" remain
    return merged.systemRoles.every((r) => r === 'employee' || r === 'admin' || r === 'ia') && merged.systemRoles.length
      ? merged
      : { ...merged, systemRoles: migrateSystemRoles(merged.systemRoles) };
  });
  // v7: demo data gets an I&A team member
  if (demoBased && !users.some((u) => u.systemRoles.includes('ia'))) {
    const qm = users.find((u) => u.id === 'U-013' && !u.systemRoles.includes('admin'));
    if (qm) qm.systemRoles = [...qm.systemRoles, 'ia'];
  }
  // v7 added the approval workflow history (demo elements get their demo history)
  const withHistory = <T extends { id: string; workflow?: unknown }>(x: T, demo: { id: string; workflow?: unknown }[]): T =>
    x.workflow === undefined ? { ...x, workflow: demo.find((d) => d.id === x.id)?.workflow ?? [] } : x;
  const roles = addMissing(data.role ?? [], seed.role).map((r: Partial<Role>) => normalizeRole(withHistory(r as Role, seed.role)));
  // v4 added positions: older data gets the demo positions and the demo persons' assignments
  const positions = addMissing(data.position ?? seed.position, seed.position).map((p: Partial<Position>) => {
    const demo = seed.position.find((x) => x.id === p.id);
    // v5 added target powers of attorney
    p = withHistory(p as Position, seed.position);
    return normalizePosition(
      demo && p.signingAuthority === undefined ? { ...p, signingAuthority: demo.signingAuthority, approvalLimit: demo.approvalLimit } : p,
    );
  });
  return {
    ...data,
    user: users,
    role: roles,
    position: positions,
    // v6 added the process landscape (area, order) and more demo processes
    processes: addMissing(data.processes ?? seed.processes, seed.processes).map((p) => {
      const demo = seed.processes.find((x) => x.id === p.id);
      const q = withHistory(p, seed.processes);
      return demo && q.area === undefined ? { ...q, area: demo.area, landscapeOrder: demo.landscapeOrder } : q;
    }),
    mandate: (data.mandate
      ? addMissing(data.mandate, seed.mandate)
      : migrateMandates(data.role ?? [], { role: roles, position: positions, user: users }, seed.mandate)
    ).map((m: Partial<Mandate>) => normalizeMandate(m)),
    // v8: risk register fields and 4×4 matrix
    risk: (data.risk ?? seed.risk).map((r) => {
      const n = normalizeRisk(r, seed.risk, { role: roles, position: positions, user: users });
      // v10: approval workflow (before, `status` held the treatment progress)
      return (r as Partial<Risk>).treatmentStatus === undefined ? withApproval(n, seed.risk, r.status, 'treatmentStatus') : n;
    }),
    opportunity: (data.opportunity ?? seed.opportunity).map((o) => {
      const n = normalizeOpportunity(o);
      return (o as Partial<Opportunity>).progressStatus === undefined ? withApproval(n, seed.opportunity, o.status, 'progressStatus') : n;
    }),
    // v3 added audits: older data gets the demo audits
    audit: (data.audit ?? seed.audit).map((a: Partial<Audit>) => normalizeAudit(a)),
    // content administration (added later; kept as is)
    config: data.config ?? emptyConfig(),
    currentUserId: data.currentUserId && users.some((u) => u.id === data.currentUserId) ? data.currentUserId : (users[0]?.id ?? ''),
  };
}

/**
 * v10: risks and opportunities get the approval workflow. Their former status describes the progress
 * (treatment / realisation); existing elements count as released (demo elements get their demo state).
 */
function withApproval<T extends Risk | Opportunity>(x: T, demo: T[], oldStatus: string | undefined, key: 'treatmentStatus' | 'progressStatus'): T {
  const d = demo.find((e) => e.id === x.id);
  const out = { ...x, [key]: oldStatus || 'Identifiziert' } as Record<string, unknown>;
  if (d) Object.assign(out, { status: d.status, version: d.version, workflow: d.workflow ?? [], createdByUserId: d.createdByUserId });
  else Object.assign(out, { status: 'Freigegeben', version: '1.0', workflow: [] });
  return out as T;
}

function normalizeOpportunity(o: Partial<Opportunity>): Opportunity {
  const base = blankEntity('opportunity', o.code ?? '', o.title ?? '');
  return { ...base, ...o } as Opportunity;
}

/** fields of risks before v9 */
type LegacyRisk = Partial<Risk> & {
  consequence?: string;
  ownerRoleId?: string;
  treatmentPlan?: string;
  actionOwnerUserId?: string;
  residualLikelihood?: number;
  residualImpact?: number;
  acceptedBy?: string;
  acceptedAt?: string;
};

/**
 * Brings a stored risk to the Risk Register shape.
 * - v8 (no `department` yet): 5-level scale → 4 levels (5 → 4), demo risks get their register details.
 * - v9: no title field (first sentence of the description), cause and consequence in one field, a person as risk owner
 *   (first holder of the former owner role), treatment actions with responsible persons, no residual risk, entity code.
 */
export function normalizeRisk(raw: LegacyRisk, demo: Risk[] = [], org?: { role: Role[]; position: Position[]; user: User[] }): Risk {
  const r: LegacyRisk = { ...raw };
  const base = blankEntity('risk', r.code ?? '', r.title ?? '');
  const d = demo.find((x) => x.id === r.id);
  const to4 = (v: unknown) => Math.min(4, Math.max(1, Math.round(Number(v) || 1)));
  if (r.department === undefined) {
    // v7 → v8
    r.likelihood = to4(r.likelihood);
    r.impact = to4(r.impact);
    if (r.category === 'Datenschutz') r.category = 'Compliance';
    if (d)
      for (const k of ['department', 'activity', 'processIds', 'consequenceType', 'likelihoodReason', 'impactReason', 'sourceRef'] as const)
        (r as Record<string, unknown>)[k] = d[k];
  }
  const legacy = 'consequence' in r || 'ownerRoleId' in r || 'treatmentPlan' in r || 'residualLikelihood' in r;
  if (legacy) {
    // v8 → v9
    if (r.consequence?.trim())
      r.cause = r.cause?.trim() ? `${r.cause.trim()}\n${t('Auswirkung')}: ${r.consequence.trim()}` : `${t('Auswirkung')}: ${r.consequence.trim()}`;
    if (!r.ownerUserId && r.ownerRoleId && org) {
      const role = org.role.find((x) => x.id === r.ownerRoleId);
      r.ownerUserId = (role && roleHolders(role, org)[0]?.user.id) || '';
    }
    if (!r.ownerUserId && d) r.ownerUserId = d.ownerUserId;
    if (!r.actions) {
      r.actions = r.treatmentPlan?.trim()
        ? [{ text: r.treatmentPlan.trim(), ownerUserId: r.actionOwnerUserId ?? '' }]
        : d && !r.treatmentPlan
          ? d.actions
          : [];
    }
    if (!r.description?.trim()) r.description = d && r.title === d.title ? d.description : (r.title ?? '');
    if (r.entity && !riskEntities.includes(r.entity)) {
      if (r.entity !== 'Muster GmbH') r.reviewNote = [r.reviewNote, `${t('Gesellschaft bisher')}: ${r.entity}`].filter(Boolean).join('\n');
      r.entity = d?.entity ?? '';
    }
    for (const k of [
      'consequence',
      'ownerRoleId',
      'treatmentPlan',
      'actionOwnerUserId',
      'residualLikelihood',
      'residualImpact',
      'acceptedBy',
      'acceptedAt',
    ])
      delete (r as Record<string, unknown>)[k];
  }
  const out = { ...base, ...r } as Risk;
  if (!Array.isArray(out.processIds)) out.processIds = [];
  if (!Array.isArray(out.actions)) out.actions = [];
  out.title = riskTitle(out.description) || out.title;
  return out;
}

/** Removes references to a deleted entity (or process) from audits and their findings. */
function scrubAudits(audits: Audit[], kind: EntityKind | 'process', id: string): Audit[] {
  const drop = (xs: string[]) => xs.filter((x) => x !== id);
  const clear = (x: string) => (x === id ? '' : x);
  return audits.map((a) => {
    switch (kind) {
      case 'process':
        return {
          ...a,
          processIds: drop(a.processIds),
          findings: a.findings.map((f) => (f.processId === id ? { ...f, processId: '', elementId: '' } : f)),
        };
      case 'role':
        return {
          ...a,
          auditedRoleIds: drop(a.auditedRoleIds),
          findings: a.findings.map((f) => ({ ...f, responsibleRoleId: clear(f.responsibleRoleId) })),
        };
      case 'user':
        return {
          ...a,
          leadAuditorUserId: clear(a.leadAuditorUserId),
          auditeeContactUserId: clear(a.auditeeContactUserId),
          teamUserIds: drop(a.teamUserIds),
          findings: a.findings.map((f) => ({ ...f, responsibleUserId: clear(f.responsibleUserId), verifiedByUserId: clear(f.verifiedByUserId) })),
        };
      case 'risk':
        return { ...a, findings: a.findings.map((f) => ({ ...f, riskIds: drop(f.riskIds) })) };
      case 'control':
        return { ...a, findings: a.findings.map((f) => ({ ...f, controlIds: drop(f.controlIds) })) };
      default:
        return a;
    }
  });
}

type LegacyAppointment = Partial<Role> & {
  appointmentRequired?: boolean;
  appointedAt?: string;
  appointedByUserId?: string;
  appointmentDocument?: string;
};

/**
 * v5: appointments were stored on the role. They become mandates of the current role holders.
 * Demo mandates are added where their persons and roles exist (and no migrated mandate covers them).
 */
function migrateMandates(rawRoles: LegacyAppointment[], org: { role: Role[]; position: Position[]; user: User[] }, demo: Mandate[]): Mandate[] {
  const userIds = new Set(org.user.map((u) => u.id));
  const roleIds = new Set(org.role.map((r) => r.id));
  const out = demo.filter((m) => userIds.has(m.recipientUserId) && (!m.roleId || roleIds.has(m.roleId)));
  for (const raw of rawRoles) {
    const role = org.role.find((r) => r.id === raw.id);
    if (!role || !raw.appointmentRequired) continue;
    const holders = roleHolders(role, org).map((h) => h.user.id);
    for (const userId of holders.length ? holders : ['']) {
      if (out.some((m) => m.roleId === role.id && m.recipientUserId === userId)) continue;
      out.push({
        ...blankEntity('mandate', nextCode(out, 'DV'), `Bestellung ${role.title}`),
        recipientUserId: userId,
        roleId: role.id,
        grantedByUserId: raw.appointedByUserId ?? '',
        status: raw.appointedAt ? 'Erteilt' : 'Entwurf',
        validFrom: raw.appointedAt ?? '',
        document: raw.appointmentDocument ?? '',
        description: 'Aus der früheren Bestellung an der Rolle übernommen – Annahme bitte nachtragen.',
      });
    }
  }
  return out;
}

function pickEmployment(u: User): Partial<User> {
  const {
    employer,
    employmentType,
    entryDate,
    contractEnd,
    contractRef,
    jobDescriptionAckAt,
    confidentialityAt,
    codeOfConductAt,
    conflictOfInterestAt,
  } = u;
  return {
    employer,
    employmentType,
    entryDate,
    contractEnd,
    contractRef,
    jobDescriptionAckAt,
    confidentialityAt,
    codeOfConductAt,
    conflictOfInterestAt,
  };
}

/** Position assignment of a demo person (used when migrating data from before positions existed). */
function pick(u: User | undefined): Partial<User> {
  return u ? { positionId: u.positionId, positionSince: u.positionSince } : {};
}
