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
import { IconContext } from '@phosphor-icons/react';
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
  renderToStaticMarkup(
    <IconContext.Provider value={{ weight: 'bold' }}>
      <AuthProvider>{node}</AuthProvider>
    </IconContext.Provider>,
  );

export function render(): PrerenderRoute[] {
  return [
    {
      path: '/',
      title: 'Hershy - AI toolkit for short-form content',
      description:
        'Hershy is an AI toolkit for short-form creators. Analyzes your videos and hooks, reads your real retention curve, and shows you exactly what to fix.',
      html: wrap(<LandingPage />),
    },
    {
      path: '/privacy',
      title: 'Privacy Policy - Hershy',
      description:
        'How Hershy handles your data, what the YouTube connection reads, and what is stored.',
      html: wrap(<PrivacyPolicy />),
    },
    {
      path: '/terms',
      title: 'Terms of Service - Hershy',
      description: 'The terms covering use of Hershy, billing, credits and cancellation.',
      html: wrap(<TermsOfService />),
    },
  ];
}
