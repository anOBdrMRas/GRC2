import type { Risk } from '../types';
import { riskLevel } from '../logic';
import { t } from '../i18n';

/** 5×5 risk matrix (likelihood × impact). */
export function Heatmap({
  risks,
  mode,
  selected,
  onSelect,
}: {
  risks: Risk[];
  mode: 'gross' | 'net';
  selected?: string | null;
  onSelect?: (cell: string | null) => void;
}) {
  const counts = new Map<string, number>();
  for (const r of risks) {
    const l = mode === 'gross' ? r.likelihood : r.residualLikelihood;
    const i = mode === 'gross' ? r.impact : r.residualImpact;
    counts.set(`${l}-${i}`, (counts.get(`${l}-${i}`) ?? 0) + 1);
  }
  return (
    <div className="heatmap">
      <div className="heat-y">{t('Wahrscheinlichkeit')} →</div>
      <div className="heat-grid">
        {[5, 4, 3, 2, 1].map((l) =>
          [1, 2, 3, 4, 5].map((i) => {
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
