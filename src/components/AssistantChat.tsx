import { useMemo, useRef, useState } from 'react';
import { useStore } from '../store';
import { useUi, type View } from '../ui';
import { modules } from '../schema';
import { rolesOfUser } from '../logic';
import {
  buildCatalog,
  catalogText,
  noteAiError,
  parseLinks,
  searchCatalog,
  useChat,
  useSample,
  type CatalogEntry,
  type LinkRef,
  type SampleError,
} from '../ai';
import { useRights } from '../useRights';
import { t, useLang } from '../i18n';

const kindColor = (kind: string) =>
  kind === 'step' || kind === 'processes' ? '#1f4e79' : (modules[kind as keyof typeof modules]?.color ?? '#495057');
const kindLabel: Record<string, string> = { step: 'Prozessschritt', processes: 'Prozess' };

/** Opens the element a link points to. */
export function useOpenLink() {
  const go = useUi((s) => s.go);
  const openStep = useUi((s) => s.openStep);
  return (l: LinkRef) => {
    if (l.kind === 'step') {
      const [pid, el] = l.id.split('/');
      openStep(pid, el);
    } else go(l.kind as View, l.id);
  };
}

export function LinkChip({ link, sub }: { link: LinkRef; sub?: string }) {
  const open = useOpenLink();
  return (
    <button type="button" className="ai-link" style={{ borderColor: kindColor(link.kind) }} onClick={() => open(link)} title={sub}>
      <span className="ai-link-kind" style={{ color: kindColor(link.kind) }}>
        {t(kindLabel[link.kind] ?? modules[link.kind as keyof typeof modules]?.label ?? link.kind)}
      </span>
      {link.label}
    </button>
  );
}

function MessageText({ text }: { text: string }) {
  return (
    <div className="ai-text">
      {parseLinks(text).map((part, i) => (typeof part === 'string' ? <span key={i}>{part}</span> : <LinkChip key={i} link={part} />))}
    </div>
  );
}

function Hits({ hits }: { hits: CatalogEntry[] }) {
  if (!hits.length)
    return <div className="small muted">{t('Keine Treffer. Versuche andere Begriffe, z. B. „Export“, „Rechnung“ oder einen Rollennamen.')}</div>;
  return (
    <div className="ai-hits">
      {hits.map((h) => (
        <div key={h.kind + h.id} className="ai-hit">
          <LinkChip link={h} sub={h.sub} />
          <span className="small muted">{h.sub}</span>
        </div>
      ))}
    </div>
  );
}

const examples = [
  'Wo finde ich die Sanktionslistenprüfung?',
  'Welche Prozessschritte betreffen mich?',
  'Wer ist Datenschutzbeauftragter?',
  'Wo werden Rechnungen freigegeben?',
];

/** Chat with the data. `floating` renders a button with a pop-up panel. */
export function AssistantChat({ floating = false }: { floating?: boolean }) {
  const data = useStore();
  const { user } = useRights();
  const lang = useLang((s) => s.lang);
  const sample = useSample();
  const { messages, open, setOpen, push, patch, clear } = useChat();
  const [q, setQ] = useState('');
  const [busy, setBusy] = useState(false);
  const ctl = useRef<AbortController | null>(null);
  const catalog = useMemo(() => buildCatalog(data), [data]);

  const ask = async (question: string) => {
    if (!question.trim() || busy) return;
    setQ('');
    push({ role: 'user', text: question });
    const hits = searchCatalog(catalog, question);
    if (!sample) {
      push({ role: 'assistant', text: '', hits, mode: 'search' });
      return;
    }
    const i = push({ role: 'assistant', text: '', mode: 'ai', pending: true });
    setBusy(true);
    ctl.current = new AbortController();
    const me = user
      ? `${user.title} (${data.position.find((p) => p.id === user.positionId)?.title ?? '–'}; Rollen: ${[...new Set(rolesOfUser(user.id, data).map((r) => r.role.title))].join(', ') || '–'})`
      : '–';
    const rules = [
      lang === 'en'
        ? 'You are the assistant of GRC Studio, the process and governance system of the company. Answer in English, briefly (at most 6 sentences or a short list).'
        : 'Du bist der Assistent im GRC Studio, dem Prozess- und Governance-System des Unternehmens. Antworte auf Deutsch, knapp (höchstens 6 Sätze oder eine kurze Liste).',
      'Use only the catalog below. Whenever you mention an element, write its link exactly as in the catalog, e.g. [[step:P-008/P008_T3|Sanktionslisten prüfen]]. If the catalog has no answer, say so and suggest where to look.',
      `The person asking: ${me}.`,
      `Most relevant entries for the question:\n${catalogText(hits)}`,
      `Full catalog:\n${catalogText(catalog)}`,
    ].join('\n\n');
    const history = messages
      .filter((m) => m.text && !m.pending && m.mode !== 'search')
      .slice(-6)
      .map((m) => ({ role: m.role, content: m.text }));
    try {
      const { text } = await sample([{ role: 'user', content: rules }, ...history, { role: 'user', content: question }], {
        cache: false,
        modelTier: 'quick',
        signal: ctl.current.signal,
        onText: ({ text }: { text: string }) => patch(i, { text, pending: false }),
      });
      patch(i, { text, pending: false });
    } catch (err) {
      const e = err as SampleError;
      noteAiError(e);
      if (e.code === 'cancelled') patch(i, { text: e.text ?? '', pending: false });
      else patch(i, { text: e.text ?? '', pending: false, mode: e.text ? 'ai' : 'search', hits, error: e.code });
    } finally {
      setBusy(false);
    }
  };

  const panel = (
    <div className={`assistant ${floating ? 'floating-panel' : ''}`}>
      <div className="assistant-head">
        <div>
          <b>✨ {t('Assistent')}</b>
          <div className="small muted">
            {sample === undefined
              ? t('verbinde …')
              : sample
                ? t('mit KI · findet Prozesse, Schritte, Rollen und Zuständigkeiten')
                : t('Suche ohne KI (KI nur in der veröffentlichten Version)')}
          </div>
        </div>
        <div className="row gap-s">
          {messages.length > 0 && (
            <button className="small-btn" onClick={clear}>
              {t('Neu')}
            </button>
          )}
          {floating && (
            <button className="tag-x" onClick={() => setOpen(false)} title={t('Schließen')}>
              ×
            </button>
          )}
        </div>
      </div>
      <div className="assistant-body">
        {messages.length === 0 && (
          <div className="ai-examples">
            <div className="small muted">{t('Frag zum Beispiel:')}</div>
            {examples.map((ex) => (
              <button key={ex} className="chip" onClick={() => ask(t(ex))}>
                {t(ex)}
              </button>
            ))}
          </div>
        )}
        {messages.map((m, i) => (
          <div key={i} className={`ai-msg ${m.role}`}>
            {m.role === 'user' ? (
              m.text
            ) : m.pending ? (
              <span className="muted">{t('Denkt nach …')}</span>
            ) : (
              <>
                {m.text && <MessageText text={m.text} />}
                {m.mode === 'search' && (
                  <>
                    <div className="small muted">{m.error ? t('KI nicht verfügbar – Ergebnis der Suche:') : t('Suche ohne KI – Treffer:')}</div>
                    <Hits hits={m.hits ?? []} />
                  </>
                )}
              </>
            )}
          </div>
        ))}
      </div>
      <form
        className="assistant-input"
        onSubmit={(e) => {
          e.preventDefault();
          ask(q);
        }}
      >
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('Wo finde ich …?')} aria-label={t('Frage an den Assistenten')} />
        {busy ? (
          <button type="button" onClick={() => ctl.current?.abort()}>
            {t('Stopp')}
          </button>
        ) : (
          <button type="submit" className="primary" disabled={!q.trim()}>
            {t('Fragen')}
          </button>
        )}
      </form>
    </div>
  );

  if (!floating) return panel;
  return open ? (
    panel
  ) : (
    <button className="assistant-fab" onClick={() => setOpen(true)}>
      ✨ {t('Assistent')}
    </button>
  );
}
