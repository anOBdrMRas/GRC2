// Mandates (appointments, delegations of duties, powers of attorney) shown in the role, position and user forms.
import { useState } from 'react';
import type { Mandate } from '../types';
import { useStore } from '../store';
import { mandateStage, stepLabel } from '../workflow';
import { fmtTime } from './WorkflowBar';
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

export interface PendingMandate {
  m: Mandate;
  stage: 'grant' | 'accept';
  /** person who has to act (empty for a granting body) */
  userId: string;
  /** waiting since (ISO) */
  since: string;
}

/** Delegations waiting for the grantor (to grant) or the recipient (to accept). */
export function pendingMandates(mandates: Mandate[]): PendingMandate[] {
  return mandates
    .map((m) => ({ m, stage: mandateStage(m) }))
    .filter((x): x is { m: Mandate; stage: 'grant' | 'accept' } => x.stage === 'grant' || x.stage === 'accept')
    .map(({ m, stage }) => ({
      m,
      stage,
      userId: stage === 'grant' ? m.grantedByUserId : m.recipientUserId,
      since: (m.workflow ?? []).at(-1)?.at ?? m.createdAt,
    }))
    .sort((a, b) => a.since.localeCompare(b.since));
}

const mandateSteps = [
  { key: 'draft', label: 'Entwurf' },
  { key: 'grant', label: 'Erteilung' },
  { key: 'accept', label: 'Annahme' },
  { key: 'done', label: 'Wirksam' },
] as const;

/** Actions of one pending delegation for the current user (grant / accept / decline). */
export function MandateActions({ m, compact = false }: { m: Mandate; compact?: boolean }) {
  const act = useStore((s) => s.mandateAction);
  const { user, canManage } = useRights();
  const isAdmin = canManage('mandate');
  const [comment, setComment] = useState('');
  const stage = mandateStage(m);
  const isGrantor = !!user && m.grantedByUserId === user.id;
  const isRecipient = !!user && m.recipientUserId === user.id;
  const run = (a: 'grant' | 'accept' | 'decline') => {
    act(m.id, a, comment.trim());
    setComment('');
  };
  if (stage === 'grant' && (isGrantor || isAdmin)) {
    const onBehalf = !isGrantor;
    const missing = !m.recipientUserId;
    return (
      <span className="mandate-actions">
        {!compact && <input value={comment} onChange={(e) => setComment(e.target.value)} placeholder={t('Kommentar (optional)')} />}
        <button
          className="primary small-btn"
          disabled={missing}
          title={missing ? t('Bitte zuerst den Empfänger eintragen.') : undefined}
          onClick={() => run('grant')}
        >
          ✓ {onBehalf ? t('Erteilung bestätigen (stellvertretend)') : t('Erteilen')}
        </button>
      </span>
    );
  }
  if (stage === 'accept' && (isRecipient || isAdmin)) {
    return (
      <span className="mandate-actions">
        <input value={comment} onChange={(e) => setComment(e.target.value)} placeholder={t('Kommentar (für Ablehnen erforderlich)')} />
        <button className="primary small-btn" onClick={() => run('accept')}>
          ✓ {isRecipient ? t('Annehmen') : t('Annahme erfassen (stellvertretend)')}
        </button>
        <button
          className="danger small-btn"
          disabled={!comment.trim()}
          title={!comment.trim() ? t('Bitte einen Kommentar angeben.') : undefined}
          onClick={() => run('decline')}
        >
          ↩ {t('Ablehnen')}
        </button>
      </span>
    );
  }
  return null;
}

/** Approval of a delegation: draft → granted by the grantor → accepted by the recipient → effective. */
export function MandateWorkflowBar({ mandate: m }: { mandate: Mandate }) {
  const users = useStore((s) => s.user);
  const [showHistory, setShowHistory] = useState(false);
  const name = (id: string) => users.find((u) => u.id === id)?.title ?? '–';
  const stage = mandateStage(m);
  const pos = { draft: 0, grant: 1, accept: 2, done: 3, revoked: -1 }[stage];
  const history = m.workflow ?? [];
  const last = history.at(-1);
  const grantor = m.grantedByUserId ? name(m.grantedByUserId) : m.grantedByBody || '–';
  const who = { draft: '', grant: grantor, accept: m.recipientUserId ? name(m.recipientUserId) : '–', done: '' } as const;
  return (
    <div className={`workflow-bar compact stage-${stage === 'done' ? 'released' : stage === 'accept' ? 'review' : 'draft'}`}>
      <div className="wf-line">
        <div className="wf-steps">
          {mandateSteps.map((s, i) => (
            <span key={s.key} className={`wf-step ${i < pos || stage === 'done' ? 'done' : ''} ${i === pos && stage !== 'done' ? 'current' : ''}`}>
              <span className="wf-dot">{i < pos || stage === 'done' ? '✓' : i + 1}</span>
              {t(s.label)}
              {who[s.key] && <span className="wf-who"> · {who[s.key]}</span>}
            </span>
          ))}
          {stage === 'revoked' && <span className="pill pill-neutral">{t('Widerrufen')}</span>}
        </div>
        <div className="wf-actions">
          <MandateActions m={m} />
          {stage === 'grant' && !m.grantedByUserId && m.grantedByBody && (
            <span className="small muted">{t('Erteilt durch ein Gremium – die Administration bestätigt die Erteilung anhand des Dokuments.')}</span>
          )}
          {history.length > 0 && (
            <button className="small-btn" onClick={() => setShowHistory(!showHistory)}>
              {t('Historie')} ({history.length})
            </button>
          )}
        </div>
      </div>
      {last?.step === 'declined' && stage === 'grant' && (
        <div className="wf-note small warn">
          ↩ <b>{t('Abgelehnt von {user}', { user: name(last.byUserId) })}</b> ({fmtTime(last.at)}): {last.comment}
        </div>
      )}
      {showHistory && (
        <table className="mini wide-table wf-history">
          <tbody>
            {[...history].reverse().map((h, i) => (
              <tr key={i}>
                <td className="small">{fmtTime(h.at)}</td>
                <td className="small">
                  <b>{t(stepLabel[h.step])}</b>
                </td>
                <td className="small">{name(h.byUserId)}</td>
                <td className="small">{h.comment || '–'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
