// Risk Register helpers: computed evaluation and the 4-level assessment scale.
import { useState } from 'react';
import { useStore } from '../store';
import { HIGH_RISK_ABOVE, MEDIUM_FROM, RISK_SCALE, isHighRisk, residualScore, riskLevel, riskScore } from '../logic';
import { consequenceTypes, impactLevels, impactNames, likelihoodLevels } from '../riskScale';
import { LevelBadge } from './common';
import { t } from '../i18n';

const range = Array.from({ length: RISK_SCALE }, (_, i) => i + 1);

/** "3 Bewerten": score = likelihood × impact, level and "higher risk" (> 8). */
export function RiskEval({ riskId, net }: { riskId: string; net: boolean }) {
  const r = useStore((s) => s.risk.find((x) => x.id === riskId));
  if (!r) return null;
  const l = net ? r.residualLikelihood : r.likelihood;
  const i = net ? r.residualImpact : r.impact;
  const score = net ? residualScore(r) : riskScore(r.likelihood, r.impact);
  const high = isHighRisk(score);
  return (
    <div className="risk-eval">
      <span className="mono">
        {l} × {i} = <b>{score}</b>
      </span>
      <LevelBadge level={riskLevel(score)} />
      <span className={`risk-high ${high ? 'yes' : 'no'}`}>
        {t('Höheres Risiko')}: <b>{high ? t('Ja') : t('Nein')}</b>
      </span>
      <span className="muted small">{t('Schwelle: Score > {n}', { n: HIGH_RISK_ABOVE })}</span>
    </div>
  );
}

export function RiskScaleButton({ riskId }: { riskId: string }) {
  const [open, setOpen] = useState(false);
  const type = useStore((s) => s.risk.find((x) => x.id === riskId)?.consequenceType ?? '');
  return (
    <>
      <button type="button" className="link-btn scale-guide-btn" onClick={() => setOpen(true)}>
        📏 {t('Bewertungsskala anzeigen')}
      </button>
      {open && <RiskScaleDialog consequenceType={type} onClose={() => setOpen(false)} />}
    </>
  );
}

export function RiskScaleDialog({ consequenceType, onClose }: { consequenceType?: string; onClose: () => void }) {
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal risk-scale" role="dialog" aria-label={t('Bewertungsskala')} onClick={(e) => e.stopPropagation()}>
        <div className="row space">
          <h3>{t('Bewertungsskala (4 × 4)')}</h3>
          <button className="tag-x" onClick={onClose} title={t('Schließen')}>
            ×
          </button>
        </div>
        <h4>{t('Eintrittswahrscheinlichkeit')}</h4>
        <table className="list scale-table lik">
          <tbody>
            {likelihoodLevels.map(([name, desc], i) => (
              <tr key={name}>
                <td className="mono">{i + 1}</td>
                <td>
                  <b>{t(name)}</b>
                </td>
                <td>{t(desc)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <h4>{t('Schadensausmaß je Auswirkungsart')}</h4>
        <div className="table-wrap">
          <table className="list scale-table">
            <thead>
              <tr>
                <th />
                {consequenceTypes.map((c) => (
                  <th key={c} className={c === consequenceType ? 'scale-current' : ''}>
                    {t(c)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {impactNames.map((name, i) => (
                <tr key={name}>
                  <td>
                    <span className="mono">{i + 1}</span> <b>{t(name)}</b>
                  </td>
                  {consequenceTypes.map((c) => (
                    <td key={c} className={c === consequenceType ? 'scale-current' : ''}>
                      {t(impactLevels[c][i])}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <h4>{t('Risikomatrix und Schwellen')}</h4>
        <div className="row gap scale-legend">
          <div className="heat-grid mini">
            {[...range].reverse().map((l) =>
              range.map((i) => (
                <span key={`${l}-${i}`} className={`heat-cell level-${riskLevel(l * i)}`}>
                  {l * i}
                </span>
              )),
            )}
          </div>
          <div className="small">
            <div>
              <span className="badge level-low">{t('Gering')}</span> {t('Score 1–{n}', { n: MEDIUM_FROM - 1 })}
            </div>
            <div>
              <span className="badge level-medium">{t('Mittel')}</span> {t('Score {a}–{b}', { a: MEDIUM_FROM, b: HIGH_RISK_ABOVE })}
            </div>
            <div>
              <span className="badge level-high">{t('Hoch')}</span>{' '}
              {t('Score {a}–{b} = höheres Risiko', { a: HIGH_RISK_ABOVE + 1, b: RISK_SCALE * RISK_SCALE })}
            </div>
            <p className="muted">
              {t('Score = Wahrscheinlichkeit × Ausmaß. Höhere Risiken (> 8) brauchen eine Behandlung oder eine dokumentierte Akzeptanz.')}
            </p>
          </div>
        </div>
        <p className="small muted">
          {t(
            'Skala und Schwellen aus dem Risk-Register-Template, auf vier Stufen verdichtet. Sie sollten von der Geschäftsleitung bestätigt werden.',
          )}
        </p>
      </div>
    </div>
  );
}
