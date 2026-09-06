import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import { ErrorBoundary } from './components/ErrorBoundary.tsx';
import './index.css';

/*
 * R-6 — the outermost boundary. It has no `resetKey` on purpose: if the failure is
 * above the page area there is nothing left to navigate to, so recovery is a retry or
 * a reload rather than moving elsewhere. The finer-grained boundaries inside App.tsx
 * are the ones that should normally catch first.
 */
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>
);
