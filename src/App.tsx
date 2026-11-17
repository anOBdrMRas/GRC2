import { useRef, useState } from 'react';
import { useStore } from './store';
import { mayLeave, useUi, type View } from './ui';
import { modules, kindOrder } from './schema';
import { ProcessView } from './components/ProcessView';
import { EntityModule } from './components/EntityModule';
import { OrgChart } from './components/OrgViews';
import { Login } from './components/Login';
import { Home } from './components/Home';
import { IaCockpit } from './components/IaCockpit';
import { ContentAdmin } from './components/ContentAdmin';
import { AssistantChat } from './components/AssistantChat';
import { ExcelTools } from './components/ExcelTools';
import { ConfirmButton, Empty, ExportDialog, Notice, download } from './components/common';
import { useRights } from './useRights';
import { t, useLang } from './i18n';
import { systemRoleById, type ModuleKey } from './permissions';

const nav: { view: View; label: string; icon: string; color?: string }[] = [
  { view: 'home', label: 'Startseite', icon: '⌂' },
  { view: 'processes', label: 'Prozesse', icon: '▦' },
  { view: 'ia', label: 'I&A-Cockpit', icon: '✓', color: '#0c8599' },
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
const moduleOf = (v: View): ModuleKey => (v === 'orgchart' ? 'position' : (v as ModuleKey));
const open = (v: View) => v === 'home' || v === 'ia' || v === 'content';

export default function App() {
  const view = useUi((s) => s.view);
  const go = useUi((s) => s.go);
  const importAll = useStore((s) => s.importAll);
  const resetDemo = useStore((s) => s.resetDemo);
  const fileInput = useRef<HTMLInputElement>(null);
  const loggedIn = useStore((s) => s.loggedIn);
  const logout = useStore((s) => s.logout);
  const positions = useStore((s) => s.position);
  const { canRead, isAdmin, canReview, user } = useRights();
  const select = useUi((s) => s.select);
  const lang = useLang((s) => s.lang);
  const [dataOpen, setDataOpen] = useState(false);
  const setLang = useLang((s) => s.setLang);
  const visibleNav = nav.filter((n) => (n.view === 'ia' ? canReview : open(n.view) || canRead(moduleOf(n.view))));
  if (!loggedIn || !user) return <Login key={lang} />;

  const exportAll = () => {
    const { risk, opportunity, control, role, position, mandate, kpi, audit, user, processes, config } = useStore.getState();
    download(
      `grc-export-${new Date().toISOString().slice(0, 10)}.json`,
      JSON.stringify({ risk, opportunity, control, role, position, mandate, kpi, audit, user, processes, config }, null, 2),
      'application/json',
    );
  };

  return (
    // Re-mount on language change so every component picks up the new texts.
    <div className="app top-nav" key={lang}>
      <div className="main-col">
        <header className="topbar">
          <div className="brand light">
            GRC<span>Studio</span>
            <span className="brand-sub">{t('Prototyp')}</span>
          </div>
          <div className="topbar-right">
            <div className="lang-switch light" role="group" aria-label={t('Sprache')}>
              {(['de', 'en'] as const).map((l) => (
                <button key={l} className={lang === l ? 'active' : ''} aria-pressed={lang === l} onClick={() => setLang(l)}>
                  {l.toUpperCase()}
                </button>
              ))}
            </div>
            <div className="topbar-user">
              <div className="user-avatar">
                {user.title
                  .split(' ')
                  .map((w) => w[0])
                  .slice(0, 2)
                  .join('')}
              </div>
              <div className="topbar-user-info">
                <b>{user.title}</b>
                <span>
                  {user.systemRoles.map((id) => t(systemRoleById.get(id)?.name ?? id)).join(' · ')}
                  {positions.find((p) => p.id === user.positionId) && ` · ${positions.find((p) => p.id === user.positionId)!.title}`}
                </span>
              </div>
            </div>
            <button
              className="logout-btn"
              onClick={() => {
                if (!mayLeave()) return;
                logout();
                go('home');
              }}
            >
              ⏻ {t('Abmelden')}
            </button>
          </div>
        </header>
        <nav className="menubar" aria-label={t('Hauptmenü')}>
          <div className="menubar-items">
            {visibleNav.map((n) => (
              <button
                key={n.view}
                className={`nav-item ${view === n.view ? 'active' : ''}`}
                title={n.view === 'home' ? t('Startseite') : undefined}
                aria-label={n.view === 'home' ? t('Startseite') : undefined}
                onClick={() => {
                  if (!mayLeave()) return;
                  // the process module always starts with the landscape
                  if (n.view === 'processes') select('processes', undefined);
                  go(n.view);
                }}
              >
                {/* only the start page has a symbol (house), all other entries are text */}
                {n.view === 'home' ? <span className="nav-home">⌂</span> : t(n.label)}
              </button>
            ))}
          </div>
          {isAdmin && (
            <div className="menubar-data">
              <button className={`nav-item ${dataOpen ? 'active' : ''}`} aria-expanded={dataOpen} onClick={() => setDataOpen(!dataOpen)}>
                ⚙ {t('Administration')}
              </button>
              {dataOpen && (
                <div className="data-menu" onClick={(e) => e.stopPropagation()}>
                  <button
                    onClick={() => {
                      setDataOpen(false);
                      go('content');
                    }}
                  >
                    ⚙ {t('Inhaltsverwaltung')}
                  </button>
                  <hr />
                  <ExcelTools scope="all" />
                  <button onClick={exportAll}>{t('Daten exportieren')} (JSON)</button>
                  <button onClick={() => fileInput.current?.click()}>{t('Daten importieren')} (JSON)</button>
                  <ConfirmButton label={t('Demodaten laden')} confirmLabel={t('Alle Daten ersetzen?')} className="" onConfirm={resetDemo} />
                </div>
              )}
            </div>
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
        </nav>
        <main className="main">
          {view === 'home' && <Home />}
          {view === 'ia' && canReview && <IaCockpit />}
          {view === 'content' && isAdmin && <ContentAdmin />}
          {view === 'processes' && canRead('processes') && <ProcessView />}
          {view === 'orgchart' && canRead('position') && <OrgChart />}
          {!open(view) && !canRead(moduleOf(view)) && <Empty>{t('Ihre Systemrollen erlauben keinen Zugriff auf diesen Bereich.')}</Empty>}
          {kindOrder.includes(view as never) && canRead(view as ModuleKey) && <EntityModule key={view} kind={view as (typeof kindOrder)[number]} />}
        </main>
      </div>
      {(view !== 'home' || isAdmin) && <AssistantChat floating />}
      <ExportDialog />
      <Notice />
    </div>
  );
}
