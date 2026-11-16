// Quality checks and open points of the integrated management system (I&A cockpit, admin start page).
import type { EntityKind } from './types';
import { activityTypes, orgIssues, parseElements, personSodConflicts, positionHolders, positionSodConflicts, roleHolders, today } from './logic';
import type { OwnershipData } from './ownership';
import { t } from './i18n';
import { stageOf, type WfKind } from './workflow';

export interface CheckItem {
  kind: EntityKind | 'processes';
  id: string;
  label: string;
  detail?: string;
  /** process step to open */
  elementId?: string;
}

export interface Check {
  key: string;
  label: string;
  /** module the check belongs to (for the quality grade) */
  module: WfKind | 'mandate' | 'user' | 'other';
  items: CheckItem[];
}

const filled = (s: unknown) => typeof s === 'string' && s.trim().length > 0;

export function imsChecks(d: OwnershipData): Check[] {
  const now = today();
  const label = (e: { code: string; title: string }) => `${e.code} ${e.title}`;
  const issues = orgIssues(d, now);
  const sodPerson = personSodConflicts(d);
  const stepsWithoutResponsible: CheckItem[] = d.processes.flatMap((p) =>
    parseElements(p.xml)
      .filter((e) => activityTypes.includes(e.type))
      .filter((e) => !(p.assignments[e.id]?.roles ?? []).some((r) => r.raci === 'R' || r.raci === 'A'))
      .map((e) => ({ kind: 'processes' as const, id: p.id, elementId: e.id, label: `${p.code} › ${e.name}` })),
  );
  return [
    // processes
    {
      key: 'proc-owner',
      label: 'Prozesse ohne Prozessverantwortlichen',
      module: 'processes',
      items: d.processes.filter((p) => !p.ownerRoleId).map((p) => ({ kind: 'processes', id: p.id, label: label(p) })),
    },
    {
      key: 'proc-content',
      label: 'Prozesse ohne Zweck & Anwendungsbereich',
      module: 'processes',
      items: d.processes.filter((p) => !filled(p.description)).map((p) => ({ kind: 'processes', id: p.id, label: label(p) })),
    },
    { key: 'proc-steps', label: 'Prozessschritte ohne Verantwortung (R/A)', module: 'processes', items: stepsWithoutResponsible },
    // roles
    {
      key: 'role-owner',
      label: 'Rollen ohne Rollenverantwortlichen',
      module: 'role',
      items: d.role.filter((r) => !r.roleOwnerUserId).map((r) => ({ kind: 'role', id: r.id, label: label(r) })),
    },
    {
      key: 'role-content',
      label: 'Rollen ohne Verantwortlichkeiten oder Befugnisse',
      module: 'role',
      items: d.role.filter((r) => !filled(r.responsibilities) || !filled(r.authorities)).map((r) => ({ kind: 'role', id: r.id, label: label(r) })),
    },
    {
      key: 'role-holder',
      label: 'Rollen ohne Inhaber',
      module: 'role',
      items: d.role
        .filter((r) => roleHolders(r, d).length === 0)
        .map((r) => ({ kind: 'role', id: r.id, label: label(r), detail: r.mandatory ? t('Pflichtrolle') : '' })),
    },
    {
      key: 'role-mandate',
      label: 'Pflichtrollen ohne wirksame Übertragung',
      module: 'role',
      items: issues
        .filter((i) => i.kind === 'role')
        .map((i) => ({ kind: 'role', id: i.id, label: d.role.find((r) => r.id === i.id)?.title ?? i.id, detail: i.text })),
    },
    {
      key: 'sod',
      label: 'Funktionstrennungskonflikte',
      module: 'role',
      items: [
        ...d.position.flatMap((p) =>
          positionSodConflicts(p, d.role).map(([a, b]) => ({
            kind: 'position' as const,
            id: p.id,
            label: label(p),
            detail: `${a.title} + ${b.title}`,
          })),
        ),
        ...sodPerson.map((c) => ({ kind: 'user' as const, id: c.user.id, label: c.user.title, detail: `${c.role.title} + ${c.other.title}` })),
      ],
    },
    // positions
    {
      key: 'pos-empty',
      label: 'Unbesetzte Stellen',
      module: 'position',
      items: d.position.filter((p) => positionHolders(p, d.user).length === 0).map((p) => ({ kind: 'position', id: p.id, label: label(p) })),
    },
    {
      key: 'pos-owner',
      label: 'Stellen ohne Vorgesetzten (ohne Owner)',
      module: 'position',
      items: d.position.filter((p) => !p.reportsToDisciplinaryId).map((p) => ({ kind: 'position', id: p.id, label: label(p) })),
    },
    {
      key: 'pos-content',
      label: 'Stellen ohne Zweck oder Hauptaufgaben',
      module: 'position',
      items: d.position.filter((p) => !filled(p.purpose) || !filled(p.tasks)).map((p) => ({ kind: 'position', id: p.id, label: label(p) })),
    },
    {
      key: 'pos-ack',
      label: 'Stellenbeschreibung nicht zur Kenntnis genommen',
      module: 'position',
      items: d.user
        .filter((u) => u.status === 'Aktiv' && u.positionId && !u.jobDescriptionAckAt)
        .map((u) => ({ kind: 'user', id: u.id, label: u.title, detail: d.position.find((p) => p.id === u.positionId)?.title })),
    },
    // reviews
    {
      key: 'review',
      label: 'Überfällige Reviews',
      module: 'other',
      items: [
        ...d.processes
          .filter((p) => p.nextReview && p.nextReview < now)
          .map((p) => ({ kind: 'processes' as const, id: p.id, label: label(p), detail: p.nextReview })),
        ...d.role
          .filter((r) => r.nextReview && r.nextReview < now)
          .map((r) => ({ kind: 'role' as const, id: r.id, label: label(r), detail: r.nextReview })),
        ...d.position
          .filter((p) => p.nextReview && p.nextReview < now)
          .map((p) => ({ kind: 'position' as const, id: p.id, label: label(p), detail: p.nextReview })),
        ...d.risk
          .filter((r) => r.nextReview && r.nextReview < now)
          .map((r) => ({ kind: 'risk' as const, id: r.id, label: label(r), detail: r.nextReview })),
        ...d.control
          .filter((c) => c.nextTest && c.nextTest < now)
          .map((c) => ({ kind: 'control' as const, id: c.id, label: label(c), detail: c.nextTest })),
      ],
    },
    // delegations and persons
    {
      key: 'mandate',
      label: 'Delegationen & Vollmachten mit Handlungsbedarf',
      module: 'mandate',
      items: issues.filter((i) => i.kind === 'mandate' || i.kind === 'position').map((i) => ({ kind: i.kind, id: i.id, label: i.text })),
    },
    {
      key: 'user-nopos',
      label: 'Aktive Benutzer ohne Stelle',
      module: 'user',
      items: d.user.filter((u) => u.status === 'Aktiv' && !u.positionId).map((u) => ({ kind: 'user', id: u.id, label: u.title })),
    },
    {
      key: 'user-inactive',
      label: 'Inaktive Benutzer mit Stelle',
      module: 'user',
      items: d.user.filter((u) => u.status !== 'Aktiv' && u.positionId).map((u) => ({ kind: 'user', id: u.id, label: u.title, detail: t(u.status) })),
    },
  ];
}

/** Workflow status per module. */
export function workflowCounts(d: OwnershipData) {
  const count = (xs: { status: string }[]) => {
    const c = { draft: 0, review: 0, released: 0, archived: 0, total: xs.length };
    for (const x of xs) c[stageOf(x.status)]++;
    return c;
  };
  return { processes: count(d.processes), role: count(d.role), position: count(d.position) };
}

/** Share of elements without quality findings, per workflow module. */
export function qualityGrade(d: OwnershipData, checks = imsChecks(d)) {
  const grade = (module: WfKind, ids: string[]) => {
    const hit = new Set(
      checks.filter((c) => c.module === module || c.key === 'review').flatMap((c) => c.items.filter((i) => i.kind === module).map((i) => i.id)),
    );
    return ids.length ? Math.round(((ids.length - ids.filter((id) => hit.has(id)).length) / ids.length) * 100) : 100;
  };
  return {
    processes: grade(
      'processes',
      d.processes.map((p) => p.id),
    ),
    role: grade(
      'role',
      d.role.map((r) => r.id),
    ),
    position: grade(
      'position',
      d.position.map((p) => p.id),
    ),
  };
}
