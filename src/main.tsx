import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import { migrateStorageKeys } from './lib/brand';
import { captureIntents } from './lib/intents';

// Before anything reads storage. The rename moved every key, and a referral
// code or a half-finished onboarding read under the new name would come back
// empty until this has run.
migrateStorageKeys();
// After the migration, so a pending link it writes is never mistaken for an
// old key. Before render, so Dashboard's first tab can already see it.
captureIntents();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
