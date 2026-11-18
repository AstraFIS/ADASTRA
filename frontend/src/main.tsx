import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, HashRouter } from 'react-router-dom';
import { OFFLINE } from '@/lib/offline';
import { AuthProvider } from '@/auth/AuthContext';
import App from './App';
import './index.css';

// the single-file copy is opened from disk (file://…/x.html), so routes live in the #hash
// and it starts on the Facebook page
const Router = OFFLINE ? HashRouter : BrowserRouter;
if (OFFLINE && (!window.location.hash || window.location.hash === '#/')) window.location.hash = '#/platforms/facebook';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Router>
      <AuthProvider>
        <App />
      </AuthProvider>
    </Router>
  </StrictMode>,
);
