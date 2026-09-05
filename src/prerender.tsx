// Build-time prerender entry.
//
// The app renders entirely on the client, so the document a crawler downloads
// is a head and an empty div. Crawlers that feed answer engines read raw HTML
// and do not wait for React, which meant every word of the landing page was
// invisible to them.
//
// This renders the public routes to static markup at build time. It is NOT
// server-side rendering and there is no hydration: main.tsx still uses
// createRoot, which discards whatever sits in #root and renders fresh. So the
// prerendered markup exists purely to be read before JavaScript runs, and it
// cannot desynchronise from the live app - the live app overwrites it.
import { renderToStaticMarkup } from 'react-dom/server';
import { AuthProvider } from './contexts/AuthContext';
import { LandingPage } from './components/LandingPage';
import { PrivacyPolicy } from './components/PrivacyPolicy';
import { TermsOfService } from './components/TermsOfService';

export interface PrerenderRoute {
  path: string;
  title: string;
  description: string;
  html: string;
}

// AuthProvider is included because the landing page's sign-in form reads it.
// Its effects never run here, so the tree renders in its signed-out state,
// which is exactly what a crawler should see.
const wrap = (node: JSX.Element) =>
  renderToStaticMarkup(<AuthProvider>{node}</AuthProvider>);

export function render(): PrerenderRoute[] {
  return [
    {
      // title and description here OVERWRITE the ones in index.html for this
      // route, so the pair has to be kept in step with it. They drifted once
      // already: index.html was updated for the current product and the live
      // page still served "AI toolkit for short-form content" in its title,
      // because this is the copy that actually reaches the crawler.
      path: '/',
      title: 'Chumoku - the shorts workspace',
      description:
        'A workspace for short-form creators. Send Chumoku a link, a hook or a script and talk it through, keep the work in projects, and read every answer against your real YouTube retention curve.',
      html: wrap(<LandingPage />),
    },
    {
      path: '/privacy',
      title: 'Privacy Policy - Chumoku',
      description:
        'How Chumoku handles your data, what the YouTube connection reads, and what is stored.',
      html: wrap(<PrivacyPolicy />),
    },
    {
      path: '/terms',
      title: 'Terms of Service - Chumoku',
      description: 'The terms covering use of Chumoku, billing, credits and cancellation.',
      html: wrap(<TermsOfService />),
    },
  ];
}
