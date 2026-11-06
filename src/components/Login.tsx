// Simulated single sign-on: in production the login runs through the company's identity provider (Keycloak / OIDC).
import { useState } from 'react';
import { useStore } from '../store';
import { useUi } from '../ui';
import { t, useLang } from '../i18n';

/** Demo persons that show the three ways of using the system. */
const personas: { id: string; kind: string; text: string }[] = [
  { id: 'U-006', kind: 'Mitarbeiter', text: 'Sieht die Prozesslandschaft und was ihm zugewiesen ist. Bearbeitet nichts.' },
  { id: 'U-015', kind: 'Mitarbeiter und Owner', text: 'Owner des Prozesses Export & Zoll, einer Rolle und der Stelle seiner Mitarbeiterin.' },
  { id: 'U-016', kind: 'Führungskraft', text: 'Vorgesetzter und damit Owner der Stelle Director Export Control & Customs.' },
  { id: 'U-001', kind: 'Administrator', text: 'Legt neue Elemente an, auch mit KI-Unterstützung, und pflegt Benutzer.' },
];

export function Login() {
  const users = useStore((s) => s.user);
  const positions = useStore((s) => s.position);
  const login = useStore((s) => s.login);
  const go = useUi((s) => s.go);
  const lang = useLang((s) => s.lang);
  const setLang = useLang((s) => s.setLang);
  const [other, setOther] = useState('');
  const active = users.filter((u) => u.status === 'Aktiv');
  const enter = (id: string) => {
    login(id);
    go('home');
  };

  return (
    <div className="login-page">
      <div className="login-card">
        <div className="row space">
          <div className="brand dark">
            GRC<span>Studio</span>
          </div>
          <div className="lang-switch" role="group" aria-label={t('Sprache')}>
            {(['de', 'en'] as const).map((l) => (
              <button key={l} className={lang === l ? 'active' : ''} aria-pressed={lang === l} onClick={() => setLang(l)}>
                {l.toUpperCase()}
              </button>
            ))}
          </div>
        </div>
        <h1>{t('Anmelden')}</h1>
        <p className="muted">{t('Prozesse, Rollen, Stellen und Verantwortlichkeiten der Organisation an einem Ort.')}</p>
        <button className="sso-button" disabled title={t('Im Prototyp nicht verbunden')}>
          🔐 {t('Mit Unternehmenskonto anmelden (Keycloak)')}
        </button>
        <div className="muted small center">{t('Im Prototyp nicht verbunden – bitte eine Demo-Person wählen.')}</div>

        <h3 className="login-sub">{t('Demo-Personen')}</h3>
        <div className="persona-grid">
          {personas
            .map((p) => ({ ...p, user: active.find((u) => u.id === p.id) }))
            .filter((p) => p.user)
            .map(({ id, kind, text, user }) => (
              <button key={id} className="persona" onClick={() => enter(id)}>
                <span className="persona-avatar">
                  {user!.title
                    .split(' ')
                    .map((w) => w[0])
                    .slice(0, 2)
                    .join('')}
                </span>
                <span className="persona-body">
                  <b>{user!.title}</b>
                  <span className="persona-kind">{t(kind)}</span>
                  <span className="small muted">{positions.find((p) => p.id === user!.positionId)?.title ?? user!.jobTitle}</span>
                  <span className="small">{t(text)}</span>
                </span>
              </button>
            ))}
        </div>
        <form
          className="row gap login-other"
          onSubmit={(e) => {
            e.preventDefault();
            if (other) enter(other);
          }}
        >
          <select value={other} onChange={(e) => setOther(e.target.value)} aria-label={t('Andere Person wählen')}>
            <option value="">{t('Andere Person wählen …')}</option>
            {active.map((u) => (
              <option key={u.id} value={u.id}>
                {u.title}
              </option>
            ))}
          </select>
          <button type="submit" className="primary" disabled={!other}>
            {t('Anmelden')}
          </button>
        </form>
      </div>
    </div>
  );
}
