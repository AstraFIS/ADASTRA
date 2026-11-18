import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, HashRouter, MemoryRouter } from 'react-router-dom';
import { OFFLINE } from '@/lib/offline';
import { AuthProvider } from '@/auth/AuthContext';
import App from './App';
import './index.css';

// The single-file copy: opened from disk (file://…) the routes live in the #hash; shown inside a
// preview frame (about:srcdoc, where the page has no usable URL) they live in memory only.
function canUseHash(): boolean {
  try {
    new URL('/', window.location.href);
    return true;
  } catch {
    return false;
  }
}
const START = '/platforms/facebook';
const OfflineRouter = ({ children }: { children: React.ReactNode }) =>
  canUseHash() ? <HashRouter>{children}</HashRouter> : <MemoryRouter initialEntries={[START]}>{children}</MemoryRouter>;
const Router = OFFLINE ? OfflineRouter : BrowserRouter;
if (OFFLINE && canUseHash() && (!window.location.hash || window.location.hash === '#/')) window.location.hash = '#' + START;

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Router>
      <AuthProvider>
        <App />
      </AuthProvider>
    </Router>
  </StrictMode>,
);
