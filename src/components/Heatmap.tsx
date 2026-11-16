import type { Risk } from '../types';
import { RISK_SCALE, riskLevel } from '../logic';
import { t } from '../i18n';

const levels = Array.from({ length: RISK_SCALE }, (_, i) => i + 1);

/** 4×4 risk matrix (likelihood × impact). */
export function Heatmap({ risks, selected, onSelect }: { risks: Risk[]; selected?: string | null; onSelect?: (cell: string | null) => void }) {
  const counts = new Map<string, number>();
  for (const r of risks) {
    counts.set(`${r.likelihood}-${r.impact}`, (counts.get(`${r.likelihood}-${r.impact}`) ?? 0) + 1);
  }
  return (
    <div className="heatmap">
      <div className="heat-y">{t('Wahrscheinlichkeit')} →</div>
      <div className="heat-grid">
        {[...levels].reverse().map((l) =>
          levels.map((i) => {
            const key = `${l}-${i}`;
            const n = counts.get(key) ?? 0;
            return (
              <button
                key={key}
                className={`heat-cell level-${riskLevel(l * i)} ${selected === key ? 'sel' : ''}`}
                title={t('W {l} × A {i} = {s}', { l, i, s: l * i })}
                onClick={() => onSelect?.(selected === key ? null : key)}
              >
                {n || ''}
              </button>
            );
          }),
        )}
      </div>
      <div className="heat-x">{t('Auswirkung')} →</div>
    </div>
  );
}
