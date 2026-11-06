import { useState } from 'react';
import type { AnyEntity, EntityKind, ProcessModel, Raci } from '../types';
import { useStore } from '../store';
import { useUi } from '../ui';
import { modules } from '../schema';
import { generateProcessXml, stepsFromText, type DraftStep } from '../bpmn/generate';
import { noteAiError, useSample, type SampleError } from '../ai';
import { emptyAssignment } from '../logic';
import { t, useLang } from '../i18n';

const categories: ProcessModel['category'][] = ['Führungsprozess', 'Kernprozess', 'Unterstützungsprozess'];
const stepTypes: NonNullable<DraftStep['type']>[] = ['task', 'system', 'manual', 'decision'];
const stepTypeLabel: Record<string, string> = { task: 'Aufgabe', system: 'Systemschritt', manual: 'Manuell', decision: 'Entscheidung' };

interface Draft {
  title: string;
  category: ProcessModel['category'];
  area: string;
  start: string;
  end: string;
  steps: DraftStep[];
}

const example =
  'Wenn ein Kunde ein Produkt zurückschickt, erfasst der Vertrieb die Retoure. Das Lager prüft die Ware. Ist die Ware beschädigt, wird eine Gutschrift abgelehnt. Sonst erstellt die Buchhaltung eine Gutschrift und informiert den Kunden.';

/** Admin dialog: describe a process in words, get a BPMN draft (AI, or one line per step without AI). */
export function AiProcessDraft({ onClose }: { onClose: () => void }) {
  const roles = useStore((s) => s.role);
  const createProcess = useStore((s) => s.createProcess);
  const updateProcess = useStore((s) => s.updateProcess);
  const select = useUi((s) => s.select);
  const sample = useSample();
  const lang = useLang((s) => s.lang);
  const [text, setText] = useState('');
  const [draft, setDraft] = useState<Draft | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const matchRole = (name?: string) => {
    if (!name) return '';
    const n = name.toLowerCase().trim();
    return (
      (
        roles.find((r) => r.id.toLowerCase() === n || r.title.toLowerCase() === n) ??
        roles.find((r) => r.title.toLowerCase().includes(n) || n.includes(r.title.toLowerCase()))
      )?.id ?? ''
    );
  };

  const withAi = async () => {
    if (!sample) return;
    setBusy(true);
    setError('');
    try {
      const prompt = [
        lang === 'en'
          ? 'Draft a business process from the description below. Use English names.'
          : 'Entwirf aus der Beschreibung unten einen Geschäftsprozess. Verwende deutsche Bezeichnungen.',
        'Reply with only JSON of this shape:',
        '{"title": string, "category": "Führungsprozess"|"Kernprozess"|"Unterstützungsprozess", "area": string, "start": string (start event), "end": string (end event), "steps": [{"name": string (verb + object, max 6 words), "type": "task"|"system"|"manual"|"decision", "role": string (exactly one role name from the list or ""), "raci": "R"|"A", "no": string (decision only: outcome on "no")}]}',
        'Rules: at most 12 steps in order; a decision is phrased as a question and continues with the next step on "yes"; prefer roles from the list.',
        `Roles: ${roles.map((r) => r.title).join('; ')}`,
        `Description:\n${text}`,
      ].join('\n\n');
      const r = await sample.json<Partial<Draft>>(prompt, { modelTier: 'default' });
      const steps = (Array.isArray(r.steps) ? r.steps : [])
        .slice(0, 16)
        .map((s) => ({
          name: String(s?.name ?? '').slice(0, 80),
          type: stepTypes.includes(s?.type as never) ? s!.type : 'task',
          role: matchRole(String(s?.role ?? '')),
          raci: (s?.raci === 'A' ? 'A' : 'R') as Raci,
          no: s?.no ? String(s.no) : undefined,
        }))
        .filter((s) => s.name);
      if (!steps.length) throw { code: 'invalid_json', message: 'no steps' };
      setDraft({
        title: String(r.title ?? '').slice(0, 80) || t('Neuer Prozess'),
        category: categories.includes(r.category as never) ? (r.category as ProcessModel['category']) : 'Kernprozess',
        area: String(r.area ?? ''),
        start: String(r.start ?? 'Start'),
        end: String(r.end ?? 'Ende'),
        steps,
      });
    } catch (e) {
      noteAiError(e as SampleError);
      setError(
        t('Die KI konnte keinen Entwurf erstellen ({code}). Du kannst es erneut versuchen oder ohne KI übernehmen.', {
          code: (e as SampleError).code ?? '?',
        }),
      );
    } finally {
      setBusy(false);
    }
  };

  const withoutAi = () => {
    const lines = stepsFromText(text);
    setDraft({
      title: t('Neuer Prozess'),
      category: 'Kernprozess',
      area: '',
      start: 'Start',
      end: 'Ende',
      steps: lines.map((s) => ({ ...s, role: matchRole(s.role), raci: 'R' as Raci })),
    });
  };

  const accept = () => {
    if (!draft) return;
    const p = createProcess(draft.title);
    const { xml, elementIds } = generateProcessXml(draft.title, draft.steps, { prefix: p.code.replace('-', ''), start: draft.start, end: draft.end });
    const assignments: ProcessModel['assignments'] = {};
    draft.steps.forEach((s, i) => {
      if (s.role) assignments[elementIds[i]] = { ...emptyAssignment(), roles: [{ roleId: s.role, raci: s.raci ?? 'R' }] };
    });
    updateProcess(p.id, { xml, assignments, category: draft.category, area: draft.area || undefined, description: text.slice(0, 1000) });
    select('processes', p.id);
    onClose();
  };

  const setStep = (i: number, patch: Partial<DraftStep>) =>
    draft && setDraft({ ...draft, steps: draft.steps.map((s, j) => (j === i ? { ...s, ...patch } : s)) });

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal ai-draft" role="dialog" aria-label={t('Prozess mit KI entwerfen')} onClick={(e) => e.stopPropagation()}>
        <div className="row space">
          <h3>✨ {t('Prozess mit KI entwerfen')}</h3>
          <button className="tag-x" onClick={onClose} title={t('Schließen')}>
            ×
          </button>
        </div>
        {!draft ? (
          <>
            <p className="small muted">
              {sample
                ? t(
                    'Beschreibe den Ablauf in eigenen Worten. Die KI erstellt daraus Schritte, Entscheidungen und Rollenzuordnungen als BPMN-Entwurf.',
                  )
                : t(
                    'Ohne KI (lokale Version): eine Zeile pro Schritt, eine Frage mit „?“ wird zur Entscheidung, die Rolle in Klammern, z. B. „Ware prüfen (Wareneingang / Lager)“.',
                  )}
            </p>
            <textarea
              rows={8}
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder={
                sample
                  ? t(example)
                  : 'Retoure erfassen (Bedarfsträger)\nWare prüfen (Wareneingang / Lager)\nWare in Ordnung?\nGutschrift erstellen (Kreditorenbuchhaltung)'
              }
            />
            {error && <div className="warn-box small">{error}</div>}
            <div className="row gap">
              {sample && (
                <button className="primary" disabled={!text.trim() || busy} onClick={withAi}>
                  {busy ? t('KI entwirft …') : `✨ ${t('Mit KI entwerfen')}`}
                </button>
              )}
              <button className={sample ? '' : 'primary'} disabled={!text.trim() || busy} onClick={withoutAi}>
                {t('Ohne KI: eine Zeile = ein Schritt')}
              </button>
            </div>
          </>
        ) : (
          <>
            <div className="grid">
              <label className="field">
                <span className="field-label">{t('Bezeichnung')}</span>
                <input value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} />
              </label>
              <label className="field">
                <span className="field-label">{t('Prozesskategorie')}</span>
                <select value={draft.category} onChange={(e) => setDraft({ ...draft, category: e.target.value as ProcessModel['category'] })}>
                  {categories.map((c) => (
                    <option key={c} value={c}>
                      {t(c)}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field">
                <span className="field-label">{t('Prozessbereich')}</span>
                <input value={draft.area} onChange={(e) => setDraft({ ...draft, area: e.target.value })} />
              </label>
            </div>
            <table className="list draft-table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>{t('Schritt')}</th>
                  <th>{t('Typ')}</th>
                  <th>{t('Rolle')}</th>
                </tr>
              </thead>
              <tbody>
                <tr className="muted">
                  <td>○</td>
                  <td colSpan={3}>{draft.start}</td>
                </tr>
                {draft.steps.map((s, i) => (
                  <tr key={i}>
                    <td>{i + 1}</td>
                    <td>
                      <input value={s.name} onChange={(e) => setStep(i, { name: e.target.value })} />
                      {s.type === 'decision' && (
                        <div className="small muted">
                          {t('nein')} → {s.no || t('Abbruch')}
                        </div>
                      )}
                    </td>
                    <td>
                      <select value={s.type ?? 'task'} onChange={(e) => setStep(i, { type: e.target.value as DraftStep['type'] })}>
                        {stepTypes.map((x) => (
                          <option key={x} value={x}>
                            {t(stepTypeLabel[x])}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td>
                      <select value={s.role ?? ''} onChange={(e) => setStep(i, { role: e.target.value })}>
                        <option value="">{t('— nicht zugewiesen —')}</option>
                        {roles.map((r) => (
                          <option key={r.id} value={r.id}>
                            {r.title}
                          </option>
                        ))}
                      </select>
                    </td>
                  </tr>
                ))}
                <tr className="muted">
                  <td>◉</td>
                  <td colSpan={3}>{draft.end}</td>
                </tr>
              </tbody>
            </table>
            <div className="row gap">
              <button className="primary" disabled={!draft.title.trim() || !draft.steps.length} onClick={accept}>
                {t('Als Entwurf übernehmen')}
              </button>
              <button onClick={() => setDraft(null)}>{t('Zurück zur Beschreibung')}</button>
            </div>
            <p className="small muted">{t('Der Prozess wird als Entwurf angelegt und kann danach im Modell weiter bearbeitet werden.')}</p>
          </>
        )}
      </div>
    </div>
  );
}

/** Fields the AI may suggest per module (text fields only). */
const suggestable: Partial<Record<EntityKind, string[]>> = {
  role: ['description', 'responsibilities', 'authorities', 'competencies', 'trainings'],
  position: ['description', 'purpose', 'tasks', 'authorities', 'qualification', 'experience', 'competencies', 'trainings'],
  risk: ['description', 'cause', 'consequence', 'affectedAssets', 'treatmentPlan'],
  control: ['description', 'objective', 'evidence', 'testResult'],
  mandate: ['description', 'scope', 'powers', 'supervision'],
};

export const canSuggest = (kind: EntityKind) => kind in suggestable;

/** "Mit KI vorschlagen": suggestions for the empty text fields of an element. */
export function AiFieldSuggest({ kind, entity, onClose }: { kind: EntityKind; entity: AnyEntity; onClose: () => void }) {
  const update = useStore((s) => s.updateEntity);
  const sample = useSample();
  const lang = useLang((s) => s.lang);
  const values = entity as unknown as Record<string, string>;
  const fields = modules[kind].sections.flatMap((s) => s.fields).filter((f) => suggestable[kind]?.includes(f.key));
  const [result, setResult] = useState<Record<string, string> | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [applied, setApplied] = useState<string[]>([]);

  const run = async () => {
    if (!sample) return;
    setBusy(true);
    setError('');
    try {
      const context = modules[kind].sections
        .flatMap((s) => s.fields)
        .filter((f) => typeof values[f.key] === 'string' && values[f.key] && ['text', 'textarea', 'select'].includes(f.type))
        .map((f) => `${f.label}: ${values[f.key]}`)
        .join('\n');
      const prompt = [
        `Element type: ${modules[kind].label} (GRC system, ISO 9001 / 27001 / 37301).`,
        lang === 'en' ? 'Write the suggestions in English.' : 'Schreibe die Vorschläge auf Deutsch.',
        `Known data:\n${context}`,
        `Suggest concise, practical content (1-3 sentences each) for these fields. Reply with only a JSON object {fieldKey: text}:\n${fields.map((f) => `${f.key}: ${f.label}`).join('\n')}`,
      ].join('\n\n');
      const r = await sample.json<Record<string, unknown>>(prompt, { modelTier: 'default' });
      setResult(Object.fromEntries(fields.filter((f) => typeof r?.[f.key] === 'string').map((f) => [f.key, String(r[f.key])])));
    } catch (e) {
      noteAiError(e as SampleError);
      setError(t('Die KI konnte keinen Vorschlag erstellen ({code}).', { code: (e as SampleError).code ?? '?' }));
    } finally {
      setBusy(false);
    }
  };

  const apply = (key: string) => {
    update(kind, entity.id, { [key]: result![key] } as never);
    setApplied((a) => [...a, key]);
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal ai-draft" role="dialog" aria-label={t('Mit KI vorschlagen')} onClick={(e) => e.stopPropagation()}>
        <div className="row space">
          <h3>
            ✨ {t('Mit KI vorschlagen')}: {entity.title}
          </h3>
          <button className="tag-x" onClick={onClose} title={t('Schließen')}>
            ×
          </button>
        </div>
        {!result ? (
          <>
            <p className="small muted">
              {t(
                'Die KI schlägt Inhalte für die Textfelder vor, ausgehend von Bezeichnung und bereits erfassten Angaben. Du entscheidest je Feld, was übernommen wird.',
              )}
            </p>
            {error && <div className="warn-box small">{error}</div>}
            <button className="primary" disabled={busy || !sample} onClick={run}>
              {busy ? t('KI schreibt …') : `✨ ${t('Vorschläge erzeugen')}`}
            </button>
          </>
        ) : (
          <>
            {fields
              .filter((f) => result[f.key])
              .map((f) => (
                <div key={f.key} className="suggest-row">
                  <div className="row space">
                    <b className="small">{t(f.label)}</b>
                    {applied.includes(f.key) ? (
                      <span className="ok small">✓ {t('übernommen')}</span>
                    ) : (
                      <button className="small-btn" onClick={() => apply(f.key)}>
                        {values[f.key] ? t('Ersetzen') : t('Übernehmen')}
                      </button>
                    )}
                  </div>
                  {values[f.key] && (
                    <div className="small muted">
                      {t('bisher')}: {values[f.key]}
                    </div>
                  )}
                  <div className="small suggest-text">{result[f.key]}</div>
                </div>
              ))}
            <div className="row gap">
              <button
                className="primary"
                onClick={() => {
                  fields.filter((f) => result[f.key] && !values[f.key] && !applied.includes(f.key)).forEach((f) => apply(f.key));
                }}
              >
                {t('Alle leeren Felder übernehmen')}
              </button>
              <button onClick={onClose}>{t('Fertig')}</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
