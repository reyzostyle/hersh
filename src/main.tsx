import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { IconContext } from '@phosphor-icons/react';
import App from './App.tsx';
import './index.css';

// Phosphor draws at "regular" by default, which is a hairline next to Geist at
// these sizes and reads as timid. Bold once, here, rather than a weight passed
// at every call site and forgotten at half of them.
const icons = { weight: 'bold' as const };

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <IconContext.Provider value={icons}>
      <App />
    </IconContext.Provider>
  </StrictMode>
);
