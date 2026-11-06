import { useRef } from 'react';
import { useStore } from './store';
import { useUi, type View } from './ui';
import { modules, kindOrder } from './schema';
import { Dashboard } from './components/Dashboard';
import { ProcessView } from './components/ProcessView';
import { EntityModule } from './components/EntityModule';
import { OrgChart } from './components/OrgViews';
import { Login } from './components/Login';
import { Home } from './components/Home';
import { ProcessLandscape } from './components/ProcessLandscape';
import { AssistantChat } from './components/AssistantChat';
import { ConfirmButton, Empty, ExportDialog, Notice, download } from './components/common';
import { useRights } from './useRights';
import { t, useLang } from './i18n';
import { systemRoleById, type ModuleKey } from './permissions';

const nav: { view: View; label: string; icon: string; color?: string }[] = [
  { view: 'home', label: 'Startseite', icon: '⌂' },
  { view: 'landscape', label: 'Prozesslandschaft', icon: '▦' },
  { view: 'processes', label: 'Prozesse (BPMN)', icon: '⇄' },
  { view: 'dashboard', label: 'GRC-Cockpit', icon: '◧' },
  ...kindOrder.flatMap((k) => {
    const item = {
      view: k as View,
      label: modules[k].plural,
      icon: { risk: '⚠', opportunity: '✦', control: '✔', role: '👤', position: '▤', mandate: '✍', kpi: '📈', audit: '🔍', user: '⚙' }[k],
      color: modules[k].color,
    };
    // the org chart sits right below the positions it visualises
    return k === 'position' ? [item, { view: 'orgchart' as View, label: 'Organigramm', icon: '⊞', color: modules.position.color }] : [item];
  }),
];

/** Rights module that governs a navigation entry. */
const moduleOf = (v: View): ModuleKey => (v === 'orgchart' ? 'position' : v === 'landscape' ? 'processes' : (v as ModuleKey));
const open = (v: View) => v === 'home' || v === 'dashboard';

export default function App() {
  const view = useUi((s) => s.view);
  const go = useUi((s) => s.go);
  const importAll = useStore((s) => s.importAll);
  const resetDemo = useStore((s) => s.resetDemo);
  const fileInput = useRef<HTMLInputElement>(null);
  const loggedIn = useStore((s) => s.loggedIn);
  const logout = useStore((s) => s.logout);
  const positions = useStore((s) => s.position);
  const { canRead, isAdmin, user } = useRights();
  const lang = useLang((s) => s.lang);
  const setLang = useLang((s) => s.setLang);
  const visibleNav = nav.filter((n) => open(n.view) || canRead(moduleOf(n.view)));
  if (!loggedIn || !user) return <Login key={lang} />;

  const exportAll = () => {
    const { risk, opportunity, control, role, position, mandate, kpi, audit, user, processes } = useStore.getState();
    download(
      `grc-export-${new Date().toISOString().slice(0, 10)}.json`,
      JSON.stringify({ risk, opportunity, control, role, position, mandate, kpi, audit, user, processes }, null, 2),
      'application/json',
    );
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
          <div className="user-menu">
            <div className="user-avatar">
              {user.title
                .split(' ')
                .map((w) => w[0])
                .slice(0, 2)
                .join('')}
            </div>
            <div className="user-info">
              <b>{user.title}</b>
              <span>{positions.find((p) => p.id === user.positionId)?.title ?? user.jobTitle}</span>
              <span className="login-roles">{user.systemRoles.map((id) => t(systemRoleById.get(id)?.name ?? id)).join(', ')}</span>
            </div>
          </div>
          <button
            onClick={() => {
              logout();
              go('home');
            }}
          >
            ⏻ {t('Abmelden')}
          </button>
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
                useUi
                  .getState()
                  .setNotice(t('Die Datei konnte nicht gelesen werden. Bitte eine mit „Daten exportieren“ erzeugte JSON-Datei wählen.'));
              }
            }}
          />
        </div>
      </nav>
      <main className="main">
        {view === 'home' && <Home />}
        {view === 'landscape' && <ProcessLandscape />}
        {view === 'dashboard' && <Dashboard />}
        {view === 'processes' && canRead('processes') && <ProcessView />}
        {view === 'orgchart' && canRead('position') && <OrgChart />}
        {!open(view) && !canRead(moduleOf(view)) && <Empty>{t('Ihre Systemrollen erlauben keinen Zugriff auf diesen Bereich.')}</Empty>}
        {kindOrder.includes(view as never) && canRead(view as ModuleKey) && <EntityModule key={view} kind={view as (typeof kindOrder)[number]} />}
      </main>
      {view !== 'home' && <AssistantChat floating />}
      <ExportDialog />
      <Notice />
    </div>
  );
}
