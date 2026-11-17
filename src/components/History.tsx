// Change history panel: who changed what when; old states can be viewed (read-only), not restored.
import { useState } from 'react';
import type { FieldDef } from '../schema';
import { useStore } from '../store';
import { revisionKindLabel, revisionsOf, type Revision } from '../history';
import { FieldValue } from './Fields';
import { fmtTime } from './WorkflowBar';
import { t } from '../i18n';

/** Labels of tracked fields that are not part of the form. */
const extraLabels: Record<string, string> = {
  title: 'Bezeichnung',
  code: 'ID',
  status: 'Status',
  version: 'Version',
  acceptedAt: 'Angenommen am',
  validFrom: 'Gültig ab',
  createdByUserId: 'Erfasst von',
};

export function HistoryPanel({
  item,
  fields,
  viewing,
  onView,
}: {
  item: unknown;
  /** form fields of the module (labels and value display) */
  fields: FieldDef[];
  /** index of the revision currently viewed, or null */
  viewing: number | null;
  onView: (index: number | null) => void;
}) {
  const users = useStore((s) => s.user);
  const [open, setOpen] = useState(false);
  const [expanded, setExpanded] = useState<number | null>(null);
  const history = revisionsOf(item);
  const name = (id: string) => users.find((u) => u.id === id)?.title ?? '–';
  const defOf = (key: string): FieldDef => fields.find((f) => f.key === key) ?? { key, label: extraLabels[key] ?? key, type: 'text' };
  const note = (r: Revision) => (r.note ? t(r.note, { ...r.vars, ...(r.vars?.kind ? { kind: t(r.vars.kind) } : {}) }) : '');

  return (
    <div className="history-panel">
      <button className="link-btn history-toggle" onClick={() => setOpen(!open)} aria-expanded={open}>
        {open ? '▾' : '▸'} {t('Änderungshistorie')} ({history.length})
      </button>
      {open && (
        <div className="history-list">
          {history.length === 0 && (
            <div className="small muted">{t('Noch keine Änderungen protokolliert. Änderungen werden ab jetzt protokolliert.')}</div>
          )}
          {[...history.keys()].reverse().map((i) => {
            const r = history[i];
            const labels = r.changes.map((c) => {
              const d = defOf(c.key);
              return d.custom ? d.label : t(d.label);
            });
            return (
              <div key={i} className={`history-entry ${viewing === i ? 'viewing' : ''}`}>
                <div className="history-head">
                  <span className="small mono">{fmtTime(r.at)}</span>
                  <b className="small">{name(r.byUserId)}</b>
                  <span className="pill pill-neutral small">{t(revisionKindLabel[r.kind])}</span>
                  <span className="small grow">
                    {note(r)}
                    {note(r) && labels.length > 0 && ' · '}
                    {labels.join(', ')}
                  </span>
                  {r.changes.length > 0 && (
                    <button className="small-btn" onClick={() => setExpanded(expanded === i ? null : i)}>
                      {expanded === i ? t('Details ausblenden') : t('Änderungen anzeigen')}
                    </button>
                  )}
                  {i < history.length - 1 &&
                    (viewing === i ? (
                      <button className="small-btn primary" onClick={() => onView(null)}>
                        {t('Zurück zum aktuellen Stand')}
                      </button>
                    ) : (
                      <button className="small-btn" onClick={() => onView(i)}>
                        {t('Diesen Stand ansehen')}
                      </button>
                    ))}
                </div>
                {expanded === i && (
                  <table className="mini wide-table history-diff">
                    <thead>
                      <tr>
                        <th>{t('Feld')}</th>
                        <th>{t('vorher')}</th>
                        <th>{t('nachher')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {r.changes.map((c) => {
                        const d = defOf(c.key);
                        return (
                          <tr key={c.key}>
                            <td className="small">{d.custom ? d.label : t(d.label)}</td>
                            <td className="small history-old">
                              <div className="history-value">
                                <FieldValue def={d} value={c.from} />
                              </div>
                            </td>
                            <td className="small history-new">
                              <div className="history-value">
                                <FieldValue def={d} value={c.to} />
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/** Banner while an old state is shown. */
export function HistoryBanner({ item, index, onBack }: { item: unknown; index: number; onBack: () => void }) {
  const users = useStore((s) => s.user);
  const r = revisionsOf(item)[index];
  if (!r) return null;
  return (
    <div className="released-note small row space">
      <span>
        🕘{' '}
        {t('Stand vom {date} ({user}) – nur Lesen, kein Wiederherstellen.', {
          date: fmtTime(r.at),
          user: users.find((u) => u.id === r.byUserId)?.title ?? '–',
        })}
      </span>
      <button className="small-btn" onClick={onBack}>
        {t('Zurück zum aktuellen Stand')}
      </button>
    </div>
  );
}
