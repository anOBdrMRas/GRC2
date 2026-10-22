import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { AssignableKind, Audit, EntityKind, EntityMap, Mandate, Position, ProcessModel, Raci, Role, StepAssignment, User } from './types';
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
  roleHolders,
  uid,
} from './logic';
import { modules } from './schema';
import { seedData } from './seed';
import { emptyDiagram } from './bpmn/templates';

type Collections = { [K in EntityKind]: EntityMap[K][] };

interface State extends Collections {
  processes: ProcessModel[];
  /** simulated login (prototype has no authentication) */
  currentUserId: string;
  setCurrentUser: (id: string) => void;

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

  importAll: (data: Partial<Collections> & { processes: ProcessModel[] }) => void;
  resetDemo: () => void;
}

function nextCode(items: { code: string }[], prefix: string) {
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

export const useStore = create<State>()(
  persist(
    (set, get) => ({
      ...seedData(),

      createEntity: (kind, title = '') => {
        const items = get()[kind];
        const e = blankEntity(kind, nextCode(items, modules[kind].codePrefix), title);
        set({ [kind]: [...items, e] } as Partial<State>);
        return e;
      },

      updateEntity: (kind, id, patch) => {
        // Incompatible roles are symmetric: keep the counterpart roles in sync.
        if (kind === 'role' && 'incompatibleRoleIds' in patch) {
          const next = (patch as Partial<Role>).incompatibleRoleIds ?? [];
          set((s) => ({
            role: s.role.map((r) => {
              if (r.id === id) return { ...r, ...(patch as Partial<Role>), updatedAt: now() };
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
              [kind]: (s[kind] as EntityMap[typeof kind][]).map((e) => (e.id === id ? { ...e, ...patch, updatedAt: now() } : e)),
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

      updateProcess: (id, patch) => set((s) => ({ processes: s.processes.map((p) => (p.id === id ? { ...p, ...patch, updatedAt: now() } : p)) })),

      deleteProcess: (id) =>
        set((s) => ({
          processes: s.processes
            .filter((p) => p.id !== id)
            .map((p) => ({ ...p, callLinks: Object.fromEntries(Object.entries(p.callLinks).filter(([, v]) => v !== id)) })),
          audit: scrubAudits(s.audit, 'process', id),
        })),

      assign: (processId, elementId, kind, entityId) =>
        set((s) => ({
          processes: s.processes.map((p) =>
            p.id !== processId
              ? p
              : updateStep(p, elementId, (a) => {
                  if (kind === 'role') {
                    return a.roles.some((r) => r.roleId === entityId) ? a : { ...a, roles: [...a.roles, { roleId: entityId, raci: 'R' }] };
                  }
                  const key = assignmentKey[kind];
                  return a[key].includes(entityId) ? a : { ...a, [key]: [...a[key], entityId] };
                }),
          ),
        })),

      unassign: (processId, elementId, kind, entityId) =>
        set((s) => ({
          processes: s.processes.map((p) =>
            p.id !== processId
              ? p
              : updateStep(p, elementId, (a) =>
                  kind === 'role'
                    ? { ...a, roles: a.roles.filter((r) => r.roleId !== entityId) }
                    : { ...a, [assignmentKey[kind]]: a[assignmentKey[kind]].filter((x) => x !== entityId) },
                ),
          ),
        })),

      setRaci: (processId, elementId, roleId, raci) =>
        set((s) => ({
          processes: s.processes.map((p) =>
            p.id !== processId
              ? p
              : updateStep(p, elementId, (a) => ({ ...a, roles: a.roles.map((r) => (r.roleId === roleId ? { ...r, raci } : r)) })),
          ),
        })),

      setStepNote: (processId, elementId, note) =>
        set((s) => ({
          processes: s.processes.map((p) => (p.id !== processId ? p : updateStep(p, elementId, (a) => ({ ...a, note })))),
        })),

      setCurrentUser: (currentUserId) => set({ currentUserId }),
      importAll: (data) => set(normalizeData(data)),
      resetDemo: () => set(seedData()),
    }),
    {
      name: 'grc-prototype-v1',
      version: 5,
      // v1 had no users and free-text role holders
      migrate: (persisted) => normalizeData(persisted as Partial<State>),
    },
  ),
);

/** Brings imported or previously stored data to the current shape. */
function normalizeData(data: Partial<State>): Partial<State> {
  const seed = seedData();
  const users = (data.user?.length ? data.user : seed.user).map((u: Partial<User>) => {
    const demo = seed.user.find((x) => x.id === u.id);
    return normalizeUser({
      ...(demo && u.employmentType === undefined ? pickEmployment(demo) : {}),
      ...(!data.position && u.positionId === undefined ? pick(demo) : {}),
      ...u,
    });
  });
  const roles = (data.role ?? []).map((r: Partial<Role>) => normalizeRole(r));
  // v4 added positions: older data gets the demo positions and the demo persons' assignments
  const positions = (data.position ?? seed.position).map((p: Partial<Position>) => {
    const demo = seed.position.find((x) => x.id === p.id);
    // v5 added target powers of attorney
    return normalizePosition(
      demo && p.signingAuthority === undefined ? { ...p, signingAuthority: demo.signingAuthority, approvalLimit: demo.approvalLimit } : p,
    );
  });
  return {
    ...data,
    user: users,
    role: roles,
    position: positions,
    mandate: (data.mandate ?? migrateMandates(data.role ?? [], { role: roles, position: positions, user: users }, seed.mandate)).map(
      (m: Partial<Mandate>) => normalizeMandate(m),
    ),
    // v3 added audits: older data gets the demo audits
    audit: (data.audit ?? seed.audit).map((a: Partial<Audit>) => normalizeAudit(a)),
    currentUserId: data.currentUserId && users.some((u) => u.id === data.currentUserId) ? data.currentUserId : (users[0]?.id ?? ''),
  };
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
