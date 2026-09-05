import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import { migrateStorageKeys } from './lib/brand';

// Before anything reads storage. The rename moved every key, and a referral
// code or a half-finished onboarding read under the new name would come back
// empty until this has run.
migrateStorageKeys();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
