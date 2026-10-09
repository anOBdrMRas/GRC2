import type { Kpi } from '../types';
import { t } from '../i18n';

/** Small trend chart with target line. */
export function Sparkline({ kpi, width = 280, height = 80 }: { kpi: Kpi; width?: number; height?: number }) {
  const ms = kpi.measurements;
  if (ms.length === 0) return <div className="muted small">{t('Noch keine Messwerte.')}</div>;
  const values = [...ms.map((m) => m.value), kpi.target];
  const min = Math.min(...values);
  const max = Math.max(...values);
  const pad = 8;
  const span = max - min || 1;
  const x = (i: number) => pad + (ms.length === 1 ? (width - 2 * pad) / 2 : (i * (width - 2 * pad)) / (ms.length - 1));
  const y = (v: number) => height - pad - ((v - min) / span) * (height - 2 * pad);
  const points = ms.map((m, i) => `${x(i)},${y(m.value)}`).join(' ');
  return (
    <svg width={width} height={height} className="sparkline">
      <line x1={pad} x2={width - pad} y1={y(kpi.target)} y2={y(kpi.target)} className="target" />
      <text x={width - pad} y={y(kpi.target) - 3} textAnchor="end" className="target-label">
        {t('Ziel')} {kpi.target}
      </text>
      <polyline points={points} />
      {ms.map((m, i) => (
        <circle key={i} cx={x(i)} cy={y(m.value)} r={3}>
          <title>
            {m.date}: {m.value} {kpi.unit}
          </title>
        </circle>
      ))}
    </svg>
  );
}
