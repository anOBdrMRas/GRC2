import type { ProcessModel } from '../types';
import { useStore } from '../store';
import { useUi } from '../ui';
import { stepsOfUser, isOwner } from '../ownership';
import { t } from '../i18n';

const order = (a: ProcessModel, b: ProcessModel) => (a.landscapeOrder ?? 99) - (b.landscapeOrder ?? 99) || a.title.localeCompare(b.title);

/** Process house: management processes on top, end-to-end core processes as chevrons, support processes below. */
export function ProcessLandscape({ compact = false }: { compact?: boolean }) {
  const d = useStore();
  const go = useUi((s) => s.go);
  const me = d.currentUserId;
  const mySteps = stepsOfUser(me, d);
  const involvement = (p: ProcessModel) => new Set(mySteps.filter((s) => s.process.id === p.id).map((s) => s.elementId)).size;
  /** highlighted where the person performs or is accountable (R/A), not only consulted or informed */
  const active = (p: ProcessModel) => mySteps.some((s) => s.process.id === p.id && (s.raci === 'R' || s.raci === 'A'));
  const byCat = (c: ProcessModel['category']) => d.processes.filter((p) => p.category === c).sort(order);

  const badges = (p: ProcessModel) => {
    const n = involvement(p);
    const owner = isOwner(me, 'processes', p, d);
    return (
      <span className="ls-badges">
        {owner && <span className="ls-owner">🔑 {t('Owner')}</span>}
        {n > 0 && <span className="ls-mine">● {n === 1 ? t('1 Schritt') : t('{n} Schritte', { n })}</span>}
      </span>
    );
  };
  const tile = (p: ProcessModel) => (
    <button key={p.id} className={`ls-tile ${active(p) ? 'mine' : ''}`} onClick={() => go('processes', p.id)} title={p.description}>
      <span className="ls-area">{p.area ?? t(p.category)}</span>
      <span className="ls-title">{p.title}</span>
      {badges(p)}
    </button>
  );

  return (
    <div className={`landscape ${compact ? 'compact' : ''}`}>
      {!compact && (
        <div className="module-head">
          <h2>{t('Prozesslandschaft')}</h2>
          <span className="small muted">{t('Klick auf einen Prozess öffnet das Prozessmodell.')}</span>
        </div>
      )}
      <div className="ls-band lead">
        <div className="ls-band-title">{t('Führungsprozesse')}</div>
        <div className="ls-row">{byCat('Führungsprozess').map(tile)}</div>
      </div>
      <div className="ls-core">
        <div className="ls-customer">{t('Kunden­anforderung')}</div>
        <div className="ls-chevrons">
          <div className="ls-band-title">{t('Kernprozesse (Ende zu Ende)')}</div>
          <div className="ls-chevron-row">
            {byCat('Kernprozess').map((p) => (
              <button key={p.id} className={`ls-chevron ${active(p) ? 'mine' : ''}`} onClick={() => go('processes', p.id)} title={p.description}>
                <span className="ls-area">{p.area ?? ''}</span>
                <span className="ls-title">{p.title}</span>
                {badges(p)}
              </button>
            ))}
          </div>
        </div>
        <div className="ls-customer">{t('Kunde zufrieden')}</div>
      </div>
      <div className="ls-band support">
        <div className="ls-band-title">{t('Unterstützungsprozesse')}</div>
        <div className="ls-row">{byCat('Unterstützungsprozess').map(tile)}</div>
      </div>
      <div className="ls-legend small muted">
        <span className="ls-mine">●</span> {t('Sie sind an Schritten beteiligt')} · <span className="ls-owner">🔑</span>{' '}
        {t('Sie sind Owner und dürfen bearbeiten')}
      </div>
    </div>
  );
}
