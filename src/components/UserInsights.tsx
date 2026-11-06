import type { User } from '../types';
import { useStore } from '../store';
import { useUi } from '../ui';
import { modules } from '../schema';
import { effectiveRights, moduleKeys, moduleLabels, rightLabel, systemRoles, userSystemRoleConflicts } from '../permissions';
import { ownershipOf, ownershipRule, type OwnKind } from '../ownership';
import { fmtEur, mandateState, orgIssues, personSodConflicts, rolesOfUser } from '../logic';
import { Tag } from './common';
import { t } from '../i18n';

export function UserInsights({ user }: { user: User }) {
  const org = useStore();
  const roles = org.role;
  const go = useUi((s) => s.go);
  const memberships = rolesOfUser(user.id, org).map(({ role, holder }) => ({ role, m: holder }));
  const position = org.position.find((p) => p.id === user.positionId);
  const owned = roles.filter((r) => r.roleOwnerUserId === user.id);
  const rights = effectiveRights(user);
  const sysConflicts = userSystemRoleConflicts(user);
  const sod = personSodConflicts(org).filter((c) => c.user.id === user.id);
  const expired = user.validUntil && user.validUntil < new Date().toISOString().slice(0, 10);
  const issues = orgIssues(org).filter((i) => i.userId === user.id);
  const effective = org.mandate.filter((m) => m.recipientUserId === user.id && mandateState(m) === 'active');

  return (
    <div className="insights">
      {(sysConflicts.length > 0 || sod.length > 0 || expired || issues.length > 0) && (
        <div className="insight warn-box">
          <div className="insight-title">⚠ {t('Handlungsbedarf')}</div>
          {expired && (
            <div className="small">
              Zugang ist seit {user.validUntil} abgelaufen, Status ist aber „{user.status}“.
            </div>
          )}
          {sysConflicts.map(([a, b, why]) => (
            <div key={a + b} className="small">
              {t('Unvereinbare Systemrollen im Tool')}: {t(systemRoles.find((r) => r.id === a)?.name ?? a)} +{' '}
              {t(systemRoles.find((r) => r.id === b)?.name ?? b)}. {t(why)}
            </div>
          ))}
          {issues.map((i, n) => (
            <div key={'o' + n} className={`small ${i.kind !== 'user' ? 'link' : ''}`} onClick={() => i.kind !== 'user' && go(i.kind, i.id)}>
              {i.text}
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
        <div className="insight-title">{t('Stelle')}</div>
        {position ? (
          <Tag color={modules.position.color} onClick={() => go('position', position.id)}>
            {position.code} {position.title}
          </Tag>
        ) : (
          <span className="muted small">{t('Keiner Stelle zugeordnet.')}</span>
        )}
      </div>
      <div className="insight">
        <div className="insight-title">{t('Organisatorische Rollen ({n})', { n: memberships.length })}</div>
        <div className="tags">
          {memberships.length === 0 && <span className="muted small">{t('Keiner Rolle zugeordnet.')}</span>}
          {memberships.map(({ role, m }) => (
            <Tag key={role.id} color={modules.role.color} onClick={() => go('role', role.id)}>
              {role.code} {role.title} · {t('über Stelle')} {m.position.title}
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
        <div className="insight-title">{t('Befugnisse')}</div>
        <div className="derived">
          <div className="derived-row">
            <span className="derived-label">{t('aus der Stelle')}</span>
            <span className="small">
              {position
                ? [
                    position.authorities,
                    position.signingAuthority !== 'Keine' ? `${t('Soll-Vollmacht')}: ${t(position.signingAuthority)}` : '',
                    position.approvalLimit ? `${t('Freigabelimit')}: ${fmtEur(position.approvalLimit)}` : '',
                  ]
                    .filter(Boolean)
                    .join(' · ') || '–'
                : '–'}
            </span>
          </div>
          <div className="derived-row">
            <span className="derived-label">{t('aus Rollen')}</span>
            <span className="derived-findings small">
              {memberships.filter(({ role }) => role.authorities).length === 0 && <span className="muted">–</span>}
              {memberships
                .filter(({ role }) => role.authorities)
                .map(({ role }) => (
                  <div key={role.id}>
                    <span className="link" onClick={() => go('role', role.id)}>
                      {role.title}
                    </span>
                    : {role.authorities}
                  </div>
                ))}
            </span>
          </div>
          <div className="derived-row">
            <span className="derived-label">{t('persönlich übertragen (wirksam)')}</span>
            <span className="tags">
              {effective.length === 0 && <span className="muted small">–</span>}
              {effective.map((m) => (
                <Tag key={m.id} color={modules.mandate.color} onClick={() => go('mandate', m.id)}>
                  {t(m.mandateType)}
                  {m.amountLimit ? ` · ${fmtEur(m.amountLimit)}` : ''}
                  {m.roleId ? ` · ${roles.find((r) => r.id === m.roleId)?.title ?? ''}` : ''}
                </Tag>
              ))}
            </span>
          </div>
        </div>
      </div>
      <div className="insight">
        <div className="insight-title">{t('Effektive Rechte im Tool')}</div>
        <div className="small" style={{ marginBottom: 6 }}>
          {(() => {
            const own = ownershipOf(user.id, org);
            return own.count
              ? `🔑 ${t('Owner von {n} Elementen – darf diese bearbeiten.', { n: own.count })}`
              : t('Kein Owner – bearbeitet nichts, außer als Administrator.');
          })()}
        </div>
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
const matrixRows: [string, boolean | string, boolean | string, boolean | string][] = [
  ['Anmelden, persönliche Startseite, Prozesslandschaft', true, true, true],
  ['Alle Inhalte lesen (außer Benutzerverwaltung)', true, true, true],
  ['KI-Assistent: Fragen zu Prozessen und Zuständigkeiten', true, true, true],
  ['Eigene Elemente bearbeiten', false, 'nur als Owner', true],
  ['Ownership ändern (Owner-Felder)', false, false, true],
  ['Neue Elemente anlegen, auch mit KI-Entwurf', false, false, true],
  ['Elemente löschen', false, false, true],
  ['Benutzer und Systemrollen pflegen, Daten importieren', false, false, true],
];

const mark = (v: boolean | string) =>
  v === true ? <span className="ok">✓</span> : v === false ? <span className="muted">–</span> : <span className="small">{t(v)}</span>;

/** Overview of the rights model: two system roles plus ownership derived from the data. */
export function SystemRoleMatrix() {
  const d = useStore();
  const users = d.user;
  const owners = users.filter((u) => ownershipOf(u.id, d).count > 0).length;
  return (
    <div className="matrix-wrap">
      <p className="muted small">
        {t(
          'Jeder Mitarbeitende ist Mitarbeiter. Bearbeiten darf, wer Owner eines Elements ist – das ergibt sich aus den Daten (z. B. Rollenverantwortlicher, Vorgesetzter). Administratoren legen zusätzlich Neues an.',
        )}
      </p>
      <div className="table-wrap">
        <table className="list matrix-table">
          <thead>
            <tr>
              <th>{t('Recht')}</th>
              <th>{t('Mitarbeiter')}</th>
              <th>🔑 {t('Owner')}</th>
              <th>{t('Administrator')}</th>
            </tr>
          </thead>
          <tbody>
            {matrixRows.map(([label, a, b, c]) => (
              <tr key={label}>
                <td>{t(label)}</td>
                <td>{mark(a)}</td>
                <td>{mark(b)}</td>
                <td>{mark(c)}</td>
              </tr>
            ))}
            <tr>
              <td className="muted small">{t('Personen')}</td>
              <td className="small">{users.filter((u) => u.systemRoles.includes('employee')).length}</td>
              <td className="small">{owners}</td>
              <td className="small">
                {users
                  .filter((u) => u.systemRoles.includes('admin'))
                  .map((u) => u.title)
                  .join(', ') || '–'}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <h3 style={{ marginTop: 16 }}>{t('Wer ist Owner?')}</h3>
      <table className="list matrix-table">
        <tbody>
          {(Object.entries(ownershipRule) as [OwnKind, string][]).map(([kind, rule]) => (
            <tr key={kind}>
              <td>{kind === 'processes' ? t('Prozesse') : t(modules[kind as keyof typeof modules].plural)}</td>
              <td className="small">{t(rule)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
