import { useRef } from 'react';
import { useStore } from './store';
import { useUi, type View } from './ui';
import { modules, kindOrder } from './schema';
import { Dashboard } from './components/Dashboard';
import { ProcessView } from './components/ProcessView';
import { EntityModule } from './components/EntityModule';
import { ConfirmButton, Empty, ExportDialog, Notice, download } from './components/common';
import { useRights } from './useRights';
import { t, useLang } from './i18n';
import { systemRoleById, type ModuleKey } from './permissions';

const nav: { view: View; label: string; icon: string; color?: string }[] = [
  { view: 'dashboard', label: 'Cockpit', icon: '◧' },
  { view: 'processes', label: 'Prozesse (BPMN)', icon: '⇄' },
  ...kindOrder.map((k) => ({
    view: k as View,
    label: modules[k].plural,
    icon: { risk: '⚠', opportunity: '✦', control: '✔', role: '👤', kpi: '📈', user: '⚙' }[k],
    color: modules[k].color,
  })),
];

export default function App() {
  const view = useUi((s) => s.view);
  const go = useUi((s) => s.go);
  const importAll = useStore((s) => s.importAll);
  const resetDemo = useStore((s) => s.resetDemo);
  const fileInput = useRef<HTMLInputElement>(null);
  const users = useStore((s) => s.user);
  const currentUserId = useStore((s) => s.currentUserId);
  const setCurrentUser = useStore((s) => s.setCurrentUser);
  const { canRead, canEdit, user } = useRights();
  const isAdmin = canEdit('user');
  const lang = useLang((s) => s.lang);
  const setLang = useLang((s) => s.setLang);
  const visibleNav = nav.filter((n) => n.view === 'dashboard' || canRead(n.view as ModuleKey));

  const exportAll = () => {
    const { risk, opportunity, control, role, kpi, user, processes } = useStore.getState();
    download(`grc-export-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify({ risk, opportunity, control, role, kpi, user, processes }, null, 2), 'application/json');
  };

  return (
    // Re-mount on language change so every component picks up the new texts.
    <div className="app" key={lang}>
      <nav className="sidebar">
        <div className="brand-row">
          <div className="brand">
            GRC<span>Studio</span>
            <div className="brand-sub">{t('Prototyp')}</div>
          </div>
          <div className="lang-switch" role="group" aria-label={t('Sprache')}>
            {(['de', 'en'] as const).map((l) => (
              <button key={l} className={lang === l ? 'active' : ''} aria-pressed={lang === l} onClick={() => setLang(l)}>
                {l.toUpperCase()}
              </button>
            ))}
          </div>
        </div>
        {visibleNav.map((n) => (
          <button key={n.view} className={`nav-item ${view === n.view ? 'active' : ''}`} onClick={() => go(n.view)}>
            <span className="nav-icon" style={n.color ? { color: n.color } : undefined}>
              {n.icon}
            </span>
            {t(n.label)}
          </button>
        ))}
        <div className="sidebar-foot">
          <label className="login">
            <span>{t('Angemeldet als (Simulation)')}</span>
            <select id="current-user" value={currentUserId} onChange={(e) => setCurrentUser(e.target.value)}>
              {users.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.title}
                </option>
              ))}
            </select>
            <span className="login-roles">{user ? user.systemRoles.map((id) => t(systemRoleById.get(id)?.name ?? id)).join(', ') || t('keine Systemrolle') : '–'}</span>
          </label>
          <div className="muted small">ISO 9001 · ISO 27001 · ISO 37301</div>
          <button onClick={exportAll}>{t('Daten exportieren')}</button>
          {isAdmin && (
            <>
              <button onClick={() => fileInput.current?.click()}>{t('Daten importieren')}</button>
              <ConfirmButton label={t('Demodaten laden')} confirmLabel={t('Alle Daten ersetzen?')} className="" onConfirm={resetDemo} />
            </>
          )}
          <input
            ref={fileInput}
            type="file"
            accept=".json"
            hidden
            onChange={async (e) => {
              const f = e.target.files?.[0];
              e.target.value = '';
              if (!f) return;
              try {
                importAll(JSON.parse(await f.text()));
              } catch {
                useUi.getState().setNotice(t('Die Datei konnte nicht gelesen werden. Bitte eine mit „Daten exportieren“ erzeugte JSON-Datei wählen.'));
              }
            }}
          />
        </div>
      </nav>
      <main className="main">
        {view === 'dashboard' && <Dashboard />}
        {view === 'processes' && canRead('processes') && <ProcessView />}
        {view !== 'dashboard' && !canRead(view as ModuleKey) && <Empty>{t('Ihre Systemrollen erlauben keinen Zugriff auf diesen Bereich.')}</Empty>}
        {kindOrder.includes(view as never) && canRead(view as ModuleKey) && <EntityModule key={view} kind={view as (typeof kindOrder)[number]} />}
      </main>
      <ExportDialog />
      <Notice />
    </div>
  );
}
