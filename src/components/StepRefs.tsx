// "Refers to": process steps an element (work instruction) is assigned to, editable from the element.
import { useState } from 'react';
import type { AssignableKind } from '../types';
import { useStore } from '../store';
import { useUi } from '../ui';
import { findUsages, parseElements } from '../logic';
import { Tag } from './common';
import { t } from '../i18n';

const activityTypes = new Set([
  'task',
  'userTask',
  'manualTask',
  'serviceTask',
  'scriptTask',
  'businessRuleTask',
  'sendTask',
  'receiveTask',
  'subProcess',
  'callActivity',
]);

export function StepRefs({ kind, entityId, editable }: { kind: AssignableKind; entityId: string; editable: boolean }) {
  const processes = useStore((s) => s.processes);
  const assign = useStore((s) => s.assign);
  const unassign = useStore((s) => s.unassign);
  const openStep = useUi((s) => s.openStep);
  const [processId, setProcessId] = useState('');
  const [elementId, setElementId] = useState('');
  const usages = findUsages(processes, kind, entityId);
  const process = processes.find((p) => p.id === processId);
  const steps = process
    ? parseElements(process.xml).filter((e) => activityTypes.has(e.type) && !usages.some((u) => u.process.id === process.id && u.elementId === e.id))
    : [];
  return (
    <div className="step-refs">
      {usages.length === 0 && <div className="muted small">{t('Noch keinem Prozessschritt zugeordnet.')}</div>}
      <div className="tags">
        {usages.map((u) => (
          <Tag
            key={u.process.id + u.elementId}
            onClick={() => openStep(u.process.id, u.elementId)}
            onRemove={editable ? () => unassign(u.process.id, u.elementId, kind, entityId) : undefined}
          >
            <span className="mono">{u.process.code}</span> {u.process.title} › {u.elementName}
          </Tag>
        ))}
      </div>
      {editable && (
        <div className="row gap step-refs-add">
          <select
            value={processId}
            aria-label={t('Prozess')}
            onChange={(e) => {
              setProcessId(e.target.value);
              setElementId('');
            }}
          >
            <option value="">{t('Prozess wählen …')}</option>
            {processes.map((p) => (
              <option key={p.id} value={p.id}>
                {p.code} {p.title}
              </option>
            ))}
          </select>
          <select value={elementId} aria-label={t('Prozessschritt')} disabled={!process} onChange={(e) => setElementId(e.target.value)}>
            <option value="">{t('Prozessschritt wählen …')}</option>
            {steps.map((s) => (
              <option key={s.id} value={s.id}>
                {' '.repeat(s.depth * 2)}
                {s.name}
              </option>
            ))}
          </select>
          <button
            type="button"
            className="small-btn"
            disabled={!processId || !elementId}
            onClick={() => {
              assign(processId, elementId, kind, entityId);
              setElementId('');
            }}
          >
            + {t('Zuordnen')}
          </button>
        </div>
      )}
    </div>
  );
}
