import { BrandMark, Icon } from './components/Icon';
import { Home } from './pages/Home';
import { Library } from './pages/Library';
import { Player } from './pages/Player';
import { SettingsPage } from './pages/Settings';
import { Tuner } from './pages/Tuner';
import { useRoute } from './router';
import { useSettings } from './lib/store/settings';

export const APP_NAME = 'Riffscan';

export function App() {
  const route = useRoute();
  const settings = useSettings();
  const songMatch = /^#\/song\/([\w-]+)/.exec(route);
  const section = songMatch ? 'library' : route.startsWith('#/library') ? 'library' : route.startsWith('#/tuner') ? 'tuner' : route.startsWith('#/settings') ? 'settings' : 'scan';

  return (
    <div className="shell">
      <header className="topbar">
        <a className="brand" href="#/">
          <BrandMark />
          {APP_NAME}
        </a>
        <nav className="nav" aria-label="Main">
          <a className="pill" href="#/" aria-current={section === 'scan' ? 'page' : undefined}><Icon name="spark" size={16} /> Scan</a>
          <a className="pill" href="#/library" aria-current={section === 'library' ? 'page' : undefined}><Icon name="library" size={16} /> Library</a>
          <a className="pill" href="#/tuner" aria-current={section === 'tuner' ? 'page' : undefined}><Icon name="tuner" size={16} /> Tuner</a>
        </nav>
        <span className="spacer" />
        <span className="chip" title={settings.groqKey ? 'Groq connected' : 'Running fully in your browser'}>
          <span className="dot" style={{ color: settings.groqKey ? '#7a9a1a' : '#9aa196' }} /> {settings.groqKey ? 'Groq connected' : 'On-device AI'}
        </span>
        <a className="icon-btn" href="#/settings" aria-label="Settings" aria-current={section === 'settings' ? 'page' : undefined}><Icon name="settings" /></a>
      </header>
      <main>
        {songMatch ? <Player key={songMatch[1]} id={songMatch[1]} /> : section === 'library' ? <Library /> : section === 'tuner' ? <Tuner /> : section === 'settings' ? <SettingsPage /> : <Home />}
      </main>
    </div>
  );
}
