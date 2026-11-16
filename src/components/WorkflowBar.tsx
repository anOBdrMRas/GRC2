// Approval workflow panel for processes, roles and positions.
import { useState } from 'react';
import { useStore } from '../store';
import { useRights } from '../useRights';
import { historyOf, lastStep, openRejection, stageLabel, stageOf, stepLabel, WF, type WfItem, type WfKind } from '../workflow';
import { dateLocale, t } from '../i18n';

const stages = [
  { key: 'draft', label: 'Entwurf', who: 'Owner' },
  { key: 'submitted', label: 'Fachliche Freigabe', who: 'Owner' },
  { key: 'review', label: 'I&A-Review', who: 'I&A-Team' },
  { key: 'released', label: 'Freigegeben', who: '' },
] as const;

export const fmtTime = (iso: string) => new Date(iso).toLocaleString(dateLocale(), { dateStyle: 'medium', timeStyle: 'short' });

export function WorkflowBar({ kind, item }: { kind: WfKind; item: WfItem }) {
  const users = useStore((s) => s.user);
  const act = useStore((s) => s.workflowAction);
  const { isAdmin, canReview, isOwnerOf, user } = useRights();
  const [comment, setComment] = useState('');
  const [showHistory, setShowHistory] = useState(false);
  const stage = stageOf(item.status);
  const owner = isOwnerOf(kind, item);
  const history = historyOf(item);
  const rejection = openRejection(item);
  const submitted = lastStep(item, 'submitted');
  const name = (id: string) => users.find((u) => u.id === id)?.title ?? '–';
  // four-eyes principle: whoever gave the business approval does not also give the quality approval
  const ownSubmission = !isAdmin && submitted?.byUserId === user?.id && stage === 'review';
  const position = stage === 'draft' ? 0 : stage === 'review' ? 2 : 3;

  const run = (action: 'submit' | 'approve' | 'reject') => {
    act(kind, item.id, action, comment.trim());
    setComment('');
  };

  return (
    <div className={`workflow-bar stage-${stage}`}>
      <div className="wf-steps">
        {stages.map((s, i) => (
          <div
            key={s.key}
            className={`wf-step ${i < position || (stage === 'released' && i === 3) ? 'done' : ''} ${i === position && stage !== 'released' ? 'current' : ''}`}
          >
            <span className="wf-dot">{i < position || stage === 'released' ? '✓' : i + 1}</span>
            <span>
              {t(s.label)}
              {s.who && <span className="wf-who"> · {t(s.who)}</span>}
            </span>
          </div>
        ))}
        {stage === 'archived' && <span className="pill pill-neutral">{t('Archiviert')}</span>}
      </div>

      {rejection && (
        <div className="wf-note warn-box small">
          <b>{t('Zurückgewiesen vom I&A-Team')}</b> ({name(rejection.byUserId)}, {fmtTime(rejection.at)}): {rejection.comment}
        </div>
      )}
      {stage === 'review' && submitted && (
        <div className="small muted">
          {t('Fachlich freigegeben von {user} am {date}', { user: name(submitted.byUserId), date: fmtTime(submitted.at) })}
          {submitted.comment && ` – „${submitted.comment}“`}
        </div>
      )}

      <div className="wf-actions">
        {stage === 'draft' && (owner || isAdmin) && (
          <>
            <input value={comment} onChange={(e) => setComment(e.target.value)} placeholder={t('Kommentar (optional)')} />
            <button className="primary" onClick={() => run('submit')}>
              ✓ {t('Fachlich freigeben')}
            </button>
            <span className="small muted">{t('Danach prüft das I&A-Team die Qualität.')}</span>
          </>
        )}
        {stage === 'review' && canReview && (
          <>
            <input value={comment} onChange={(e) => setComment(e.target.value)} placeholder={t('Kommentar (für Zurückweisen erforderlich)')} />
            <button
              className="primary"
              disabled={ownSubmission}
              title={ownSubmission ? t('Vier-Augen-Prinzip: Sie haben fachlich freigegeben.') : undefined}
              onClick={() => run('approve')}
            >
              ✓ {t('Qualität freigeben')}
            </button>
            <button
              className="danger"
              disabled={!comment.trim()}
              title={!comment.trim() ? t('Bitte einen Kommentar angeben.') : undefined}
              onClick={() => run('reject')}
            >
              ↩ {t('Zurückweisen')}
            </button>
          </>
        )}
        {stage === 'review' && !canReview && owner && (
          <span className="small muted">🔒 {t('Liegt beim I&A-Team – Bearbeitung bis zur Entscheidung gesperrt.')}</span>
        )}
        {stage === 'released' && owner && !isAdmin && (
          <span className="small muted">{t('Änderungen setzen das Element auf „Entwurf“ zurück und erfordern eine neue Freigabe.')}</span>
        )}
        {isAdmin && (
          <label className="small wf-admin">
            {t('Status setzen (Administration)')}:
            <select
              value={item.status}
              onChange={(e) => {
                act(kind, item.id, 'setStatus', comment.trim(), e.target.value);
                setComment('');
              }}
            >
              {Object.values(WF).map((v) => (
                <option key={v} value={v}>
                  {t(stageLabel[stageOf(v)])}
                </option>
              ))}
            </select>
          </label>
        )}
        {history.length > 0 && (
          <button className="small-btn" onClick={() => setShowHistory(!showHistory)}>
            {t('Historie')} ({history.length})
          </button>
        )}
      </div>

      {showHistory && (
        <table className="mini wide-table wf-history">
          <tbody>
            {[...history].reverse().map((h, i) => (
              <tr key={i}>
                <td className="small">{fmtTime(h.at)}</td>
                <td className="small">
                  <b>{t(stepLabel[h.step])}</b>
                  {h.step === 'status' && ` → ${t(stageLabel[stageOf(h.status)])}`}
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
