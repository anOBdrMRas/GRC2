// Mandates (appointments, delegations of duties, powers of attorney) shown in the role, position and user forms.
import type { Mandate } from '../types';
import { useStore } from '../store';
import { useUi } from '../ui';
import { fmtEur, mandateState, mandateStateLabel, orgIssues, positionHolders, roleHolders, type MandateState } from '../logic';
import { useRights } from '../useRights';
import { t } from '../i18n';

const stateTone: Record<MandateState, string> = {
  active: 'ok',
  pending: 'warn',
  future: 'neutral',
  draft: 'neutral',
  expired: 'bad',
  revoked: 'neutral',
};

export function MandateStatePill({ mandate }: { mandate: Mandate }) {
  const s = mandateState(mandate);
  return <span className={`pill pill-${stateTone[s]}`}>{t(mandateStateLabel[s])}</span>;
}

/** Context: which entity the list belongs to. */
type Context = 'role' | 'position' | 'user';

export function MandateList({ context, entityId }: { context: Context; entityId: string }) {
  const org = useStore();
  const go = useUi((s) => s.go);
  const { canEdit } = useRights();
  const userName = (id: string) => org.user.find((u) => u.id === id)?.title ?? '–';

  // rows: [person, mandate | undefined]; a row without mandate marks a missing transfer
  let rows: { userId: string; m?: Mandate }[] = [];
  let missingType = '';
  let roleId = '';
  if (context === 'role') {
    const role = org.role.find((r) => r.id === entityId);
    if (!role) return null;
    roleId = role.id;
    missingType = role.requiredMandate !== 'Keine' ? role.requiredMandate : '';
    const related = org.mandate.filter((m) => m.roleId === role.id);
    const holders = [...new Set(roleHolders(role, org).map((h) => h.user.id))];
    for (const u of holders) {
      const own = related.filter((m) => m.recipientUserId === u);
      if (own.length) rows.push(...own.map((m) => ({ userId: u, m })));
      else if (missingType) rows.push({ userId: u });
    }
    rows.push(...related.filter((m) => !holders.includes(m.recipientUserId)).map((m) => ({ userId: m.recipientUserId, m })));
  } else if (context === 'position') {
    const p = org.position.find((x) => x.id === entityId);
    if (!p) return null;
    const holders = positionHolders(p, org.user).map((u) => u.id);
    rows = org.mandate.filter((m) => holders.includes(m.recipientUserId) || m.positionId === p.id).map((m) => ({ userId: m.recipientUserId, m }));
  } else {
    rows = org.mandate.filter((m) => m.recipientUserId === entityId).map((m) => ({ userId: entityId, m }));
  }
  const granted = context === 'user' ? org.mandate.filter((m) => m.grantedByUserId === entityId) : [];

  const create = (userId: string) => {
    const s = useStore.getState();
    const role = s.role.find((r) => r.id === roleId);
    const m = s.createEntity('mandate', `${t(missingType)}: ${role?.title ?? ''}`);
    s.updateEntity('mandate', m.id, {
      mandateType: missingType,
      recipientUserId: userId,
      roleId,
      positionId: s.user.find((u) => u.id === userId)?.positionId ?? '',
    });
    go('mandate', m.id);
  };

  const table = (items: { userId: string; m?: Mandate }[], personLabel: string) => (
    <table className="mini wide-table relation-table">
      <thead>
        <tr>
          <th>{t('Übertragung')}</th>
          <th>{t('Art')}</th>
          <th>{t(personLabel)}</th>
          <th>{t('Gültigkeit')}</th>
          <th>{t('Zustand')}</th>
        </tr>
      </thead>
      <tbody>
        {items.map(({ userId, m }, i) =>
          m ? (
            <tr key={m.id}>
              <td>
                <span className="link" onClick={() => go('mandate', m.id)}>
                  <span className="mono">{m.code}</span> {m.title}
                </span>
              </td>
              <td className="small">
                {t(m.mandateType)}
                {m.amountLimit > 0 && <span className="muted"> · {fmtEur(m.amountLimit)}</span>}
                {m.representation && <span className="muted"> · {t(m.representation)}</span>}
              </td>
              <td className="small">{userName(personLabel === 'Erteilt an' ? m.recipientUserId : userId)}</td>
              <td className="small">
                {m.validFrom || '–'} – {m.validUntil || t('unbefristet')}
              </td>
              <td>
                <MandateStatePill mandate={m} />
              </td>
            </tr>
          ) : (
            <tr key={'missing' + i}>
              <td className="warn small">{t('fehlt')}</td>
              <td className="small">{t(missingType)}</td>
              <td className="small">{userName(userId)}</td>
              <td />
              <td>
                {canEdit('mandate') && (
                  <button type="button" className="small-btn" style={{ whiteSpace: 'nowrap' }} onClick={() => create(userId)}>
                    + {t('anlegen')}
                  </button>
                )}
              </td>
            </tr>
          ),
        )}
      </tbody>
    </table>
  );

  return (
    <div>
      {rows.length === 0 && <div className="muted small">{t('Keine Übertragungen.')}</div>}
      {rows.length > 0 && table(rows, context === 'user' ? 'Empfänger' : 'Person')}
      {granted.length > 0 && (
        <>
          <div className="muted small" style={{ margin: '8px 0 4px' }}>
            {t('Von dieser Person erteilt (Überwachungspflicht)')}
          </div>
          {table(
            granted.map((m) => ({ userId: m.recipientUserId, m })),
            'Erteilt an',
          )}
        </>
      )}
    </div>
  );
}

/** Warnings above the mandate form. */
export function MandateInsights({ mandate }: { mandate: Mandate }) {
  const org = useStore();
  const go = useUi((s) => s.go);
  const issues = orgIssues(org).filter((i) => i.mandateId === mandate.id);
  const state = mandateState(mandate);
  const user = org.user.find((u) => u.id === mandate.recipientUserId);
  const role = org.role.find((r) => r.id === mandate.roleId);
  return (
    <div className="insights">
      <div className="insight">
        <div className="insight-title">{t('Rechtswirksamkeit')}</div>
        <div className="row gap-s small">
          <MandateStatePill mandate={mandate} />
          {user && (
            <span className="link" onClick={() => go('user', user.id)}>
              {user.title}
            </span>
          )}
          {role && (
            <span className="link muted" onClick={() => go('role', role.id)}>
              · {role.title}
            </span>
          )}
        </div>
        <div className="muted small" style={{ marginTop: 4 }}>
          {state === 'pending'
            ? t('Wird erst mit der dokumentierten Annahme durch den Empfänger wirksam.')
            : state === 'draft'
              ? t('Entwurf – noch nicht erteilt.')
              : t('Wirksam ist eine Übertragung, wenn sie erteilt, gültig und angenommen ist.')}
        </div>
      </div>
      {issues.length > 0 && (
        <div className="insight warn-box">
          <div className="insight-title">⚠ {t('Handlungsbedarf')}</div>
          {issues.map((i, n) => (
            <div key={n} className="small">
              {i.text}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
