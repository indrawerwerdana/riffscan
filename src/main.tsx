import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource/outfit/300.css';
import '@fontsource/outfit/400.css';
import '@fontsource/outfit/500.css';
import '@fontsource/outfit/600.css';
import '@fontsource/jetbrains-mono/400.css';
import './styles/global.css';
import { App } from './App';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

// Test hook (used by scripts/e2e.py). Harmless in production.
if (new URLSearchParams(location.search).has('debug')) {
  import('./lib/stems/separate').then((m) => ((window as any).__riffscan = { ...(window as any).__riffscan, separate: m }));
}
