import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { AssignableKind, EntityKind, EntityMap, ProcessModel, Raci, Role, StepAssignment, User } from './types';
import { assignmentKey, blankEntity, emptyAssignment, normalizeRole, normalizeUser, now, uid } from './logic';
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

function updateStep(
  p: ProcessModel,
  elementId: string,
  fn: (a: StepAssignment) => StepAssignment,
): ProcessModel {
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

      updateEntity: (kind, id, patch) =>
        set(
          (s) =>
            ({
              [kind]: (s[kind] as EntityMap[typeof kind][]).map((e) => (e.id === id ? { ...e, ...patch, updatedAt: now() } : e)),
            }) as Partial<State>,
        ),

      deleteEntity: (kind, id) =>
        set((s) => {
          if (kind === 'user') {
            return {
              user: s.user.filter((u) => u.id !== id),
              role: s.role.map((r) => ({
                ...r,
                members: r.members.filter((m) => m.userId !== id),
                roleOwnerUserId: r.roleOwnerUserId === id ? '' : r.roleOwnerUserId,
                appointedByUserId: r.appointedByUserId === id ? '' : r.appointedByUserId,
              })),
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
          const patch: Partial<State> = { processes, [kind]: (s[kind] as { id: string }[]).filter((e) => e.id !== id) };
          if (kind === 'risk') {
            patch.control = s.control.map((c) => ({ ...c, mitigatesRiskIds: c.mitigatesRiskIds.filter((x) => x !== id) }));
          }
          if (kind === 'role') {
            patch.role = s.role
              .filter((r) => r.id !== id)
              .map((r) => ({
                ...r,
                deputyRoleId: r.deputyRoleId === id ? '' : r.deputyRoleId,
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
        set((s) => ({ processes: s.processes.map((p) => (p.id === id ? { ...p, ...patch, updatedAt: now() } : p)) })),

      deleteProcess: (id) =>
        set((s) => ({
          processes: s.processes
            .filter((p) => p.id !== id)
            .map((p) => ({ ...p, callLinks: Object.fromEntries(Object.entries(p.callLinks).filter(([, v]) => v !== id)) })),
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
      version: 2,
      // v1 had no users and free-text role holders
      migrate: (persisted) => normalizeData(persisted as Partial<State>),
    },
  ),
);

/** Brings imported or previously stored data to the current shape. */
function normalizeData(data: Partial<State>): Partial<State> {
  const seed = seedData();
  const users = (data.user?.length ? data.user : seed.user).map((u: Partial<User>) => normalizeUser(u));
  return {
    ...data,
    user: users,
    role: (data.role ?? []).map((r: Partial<Role>) => normalizeRole(r)),
    currentUserId: data.currentUserId && users.some((u) => u.id === data.currentUserId) ? data.currentUserId : users[0]?.id ?? '',
  };
}
