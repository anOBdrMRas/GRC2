import { useRef } from 'react';
import { useStore } from './store';
import { useUi, type View } from './ui';
import { modules, kindOrder } from './schema';
import { Dashboard } from './components/Dashboard';
import { ProcessView } from './components/ProcessView';
import { EntityModule } from './components/EntityModule';
import { download } from './components/common';

const nav: { view: View; label: string; icon: string; color?: string }[] = [
  { view: 'dashboard', label: 'Cockpit', icon: '◧' },
  { view: 'processes', label: 'Prozesse (BPMN)', icon: '⇄' },
  ...kindOrder.map((k) => ({
    view: k as View,
    label: modules[k].plural,
    icon: { risk: '⚠', opportunity: '✦', control: '✔', role: '👤', kpi: '📈' }[k],
    color: modules[k].color,
  })),
];

export default function App() {
  const view = useUi((s) => s.view);
  const go = useUi((s) => s.go);
  const importAll = useStore((s) => s.importAll);
  const resetDemo = useStore((s) => s.resetDemo);
  const fileInput = useRef<HTMLInputElement>(null);

  const exportAll = () => {
    const { risk, opportunity, control, role, kpi, processes } = useStore.getState();
    download(`grc-export-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify({ risk, opportunity, control, role, kpi, processes }, null, 2), 'application/json');
  };

  return (
    <div className="app">
      <nav className="sidebar">
        <div className="brand">
          GRC<span>Studio</span>
          <div className="brand-sub">Prototyp</div>
        </div>
        {nav.map((n) => (
          <button key={n.view} className={`nav-item ${view === n.view ? 'active' : ''}`} onClick={() => go(n.view)}>
            <span className="nav-icon" style={n.color ? { color: n.color } : undefined}>
              {n.icon}
            </span>
            {n.label}
          </button>
        ))}
        <div className="sidebar-foot">
          <div className="muted small">ISO 9001 · ISO 27001 · ISO 37301</div>
          <button onClick={exportAll}>Daten exportieren</button>
          <button onClick={() => fileInput.current?.click()}>Daten importieren</button>
          <button
            onClick={() => {
              if (confirm('Alle Daten durch die Demodaten ersetzen?')) resetDemo();
            }}
          >
            Demodaten laden
          </button>
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
                alert('Datei konnte nicht gelesen werden.');
              }
            }}
          />
        </div>
      </nav>
      <main className="main">
        {view === 'dashboard' && <Dashboard />}
        {view === 'processes' && <ProcessView />}
        {kindOrder.includes(view as never) && <EntityModule key={view} kind={view as (typeof kindOrder)[number]} />}
      </main>
    </div>
  );
}
