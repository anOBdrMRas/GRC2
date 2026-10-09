import type { User } from '../types';
import { useStore } from '../store';
import { useUi } from '../ui';
import { modules } from '../schema';
import { effectiveRights, moduleKeys, moduleLabels, rightLabel, systemRoleConflicts, systemRoles, userSystemRoleConflicts } from '../permissions';
import { personSodConflicts } from '../logic';
import { Tag } from './common';
import { t } from '../i18n';

export function UserInsights({ user }: { user: User }) {
  const roles = useStore((s) => s.role);
  const users = useStore((s) => s.user);
  const go = useUi((s) => s.go);
  const memberships = roles.flatMap((r) => r.members.filter((m) => m.userId === user.id).map((m) => ({ role: r, m })));
  const owned = roles.filter((r) => r.roleOwnerUserId === user.id);
  const rights = effectiveRights(user);
  const sysConflicts = userSystemRoleConflicts(user);
  const sod = personSodConflicts(roles, users).filter((c) => c.user.id === user.id);
  const expired = user.validUntil && user.validUntil < new Date().toISOString().slice(0, 10);

  return (
    <div className="insights">
      {(sysConflicts.length > 0 || sod.length > 0 || expired) && (
        <div className="insight warn-box">
          <div className="insight-title">⚠ {t('Handlungsbedarf')}</div>
          {expired && <div className="small">Zugang ist seit {user.validUntil} abgelaufen, Status ist aber „{user.status}“.</div>}
          {sysConflicts.map(([a, b, why]) => (
            <div key={a + b} className="small">
              {t('Unvereinbare Systemrollen im Tool')}: {t(systemRoles.find((r) => r.id === a)?.name ?? a)} + {t(systemRoles.find((r) => r.id === b)?.name ?? b)}. {t(why)}
            </div>
          ))}
          {sod.map((c, i) => (
            <div key={i} className="small link" onClick={() => go('role', c.role.id)}>
              {t('Funktionstrennung: hält „{a}“ und „{b}“', { a: c.role.title, b: c.other.title })}
            </div>
          ))}
        </div>
      )}
      <div className="insight">
        <div className="insight-title">Organisatorische Rollen ({memberships.length})</div>
        <div className="tags">
          {memberships.length === 0 && <span className="muted small">{t('Keiner Rolle zugeordnet.')}</span>}
          {memberships.map(({ role, m }) => (
            <Tag key={role.id} color={modules.role.color} onClick={() => go('role', role.id)}>
              {role.code} {role.title} · {t(m.function)}
            </Tag>
          ))}
        </div>
        {owned.length > 0 && (
          <>
            <div className="insight-title" style={{ marginTop: 8 }}>
              {t('Rollenverantwortlich für')}
            </div>
            <div className="tags">
              {owned.map((r) => (
                <Tag key={r.id} color={modules.role.color} onClick={() => go('role', r.id)}>
                  {r.code} {r.title}
                </Tag>
              ))}
            </div>
          </>
        )}
      </div>
      <div className="insight">
        <div className="insight-title">{t('Effektive Rechte im Tool')}</div>
        <div className="rights-row">
          {moduleKeys.map((m) => (
            <span key={m} className={`right right-${rights[m]}`}>
              {t(moduleLabels[m])}: {t(rightLabel[rights[m]])}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

/** Overview of the tool's system roles and what each may do. */
export function SystemRoleMatrix() {
  const users = useStore((s) => s.user);
  return (
    <div className="matrix-wrap">
      <p className="muted small">
        {t('Systemrollen steuern, was ein Benutzer im Tool sehen und bearbeiten darf. Ein Benutzer kann mehrere Systemrollen haben; es gilt jeweils das höchste Recht.')}
      </p>
      <div className="table-wrap">
        <table className="list matrix-table">
          <thead>
            <tr>
              <th>{t('Systemrolle')}</th>
              {moduleKeys.map((m) => (
                <th key={m}>{t(moduleLabels[m])}</th>
              ))}
              <th>{t('Benutzer')}</th>
            </tr>
          </thead>
          <tbody>
            {systemRoles.map((r) => {
              const holders = users.filter((u) => u.systemRoles.includes(r.id));
              return (
                <tr key={r.id}>
                  <td>
                    <b>{t(r.name)}</b>
                    <div className="muted small">{t(r.description)}</div>
                  </td>
                  {moduleKeys.map((m) => (
                    <td key={m}>
                      <span className={`right right-${r.rights[m]}`}>{t(rightLabel[r.rights[m]])}</span>
                    </td>
                  ))}
                  <td className="small">{holders.map((u) => u.title).join(', ') || <span className="muted">–</span>}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <h3 style={{ marginTop: 16 }}>{t('Unvereinbare Systemrollen')}</h3>
      <ul className="small">
        {systemRoleConflicts.map(([a, b, why]) => (
          <li key={a + b}>
            {t(systemRoles.find((r) => r.id === a)?.name ?? a)} + {t(systemRoles.find((r) => r.id === b)?.name ?? b)}: {t(why)}
          </li>
        ))}
      </ul>
    </div>
  );
}
