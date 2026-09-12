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
import { GuidePage, GuidesIndex } from './components/GuidePage';
import { GUIDES } from './lib/guides';
import { FAQS } from './lib/faq';

export interface PrerenderRoute {
  path: string;
  title: string;
  description: string;
  html: string;
  /** Extra structured data for this route, replacing the shell's FAQ block. */
  jsonLd?: unknown;
  /** Sitemap hints. Defaults are fine for most pages. */
  changefreq?: string;
  priority?: string;
}

// AuthProvider is included because the landing page's sign-in form reads it.
// Its effects never run here, so the tree renders in its signed-out state,
// which is exactly what a crawler should see.
const wrap = (node: JSX.Element) =>
  renderToStaticMarkup(<AuthProvider>{node}</AuthProvider>);

export function render(): PrerenderRoute[] {
  const guideRoutes: PrerenderRoute[] = GUIDES.map(g => ({
    path: `/guides/${g.slug}`,
    title: `${g.title} - Chumoku`,
    description: g.description,
    html: wrap(<GuidePage guide={g} />),
    changefreq: 'monthly',
    priority: '0.8',
    // Article plus the page's own questions, both pointing at the Organization
    // declared in index.html. The shell's FAQPage carries the LANDING page's
    // questions, which on a guide would be answers to questions the page does
    // not ask - so it is replaced here rather than inherited.
    jsonLd: {
      '@context': 'https://schema.org',
      '@graph': [
        {
          '@type': 'Article',
          '@id': `https://chumoku.co/guides/${g.slug}#article`,
          headline: g.h1,
          description: g.description,
          dateModified: g.updated,
          author: { '@id': 'https://chumoku.co/#organization' },
          publisher: { '@id': 'https://chumoku.co/#organization' },
          mainEntityOfPage: `https://chumoku.co/guides/${g.slug}`,
          about: 'YouTube Shorts',
        },
        {
          '@type': 'FAQPage',
          mainEntity: g.faq.map(f => ({
            '@type': 'Question',
            name: f.q,
            acceptedAnswer: { '@type': 'Answer', text: f.a },
          })),
        },
      ],
    },
  }));

  return [
    {
      // title and description here OVERWRITE the ones in index.html for this
      // route, so the pair has to be kept in step with it. They drifted once
      // already: index.html was updated for the current product and the live
      // page still served "AI toolkit for short-form content" in its title,
      // because this is the copy that actually reaches the crawler.
      // The title carries the category on purpose. Searching the brand name
      // returns a Japanese timber company, and "the shorts workspace" does not
      // tell a search result or an answer engine which industry this is - the
      // nouns that separate them are "video" and "creators". The description
      // opens "Chumoku is a ..." for the same reason: that is the sentence an
      // answer engine lifts when asked what Chumoku is.
      path: '/',
      title: 'Chumoku - short-form video analysis for creators',
      description:
        'Chumoku is a short-form video tool for creators. Send it a link, a hook or a script and talk it through, keep the work in projects, and read every answer against your real YouTube retention curve.',
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
    {
      path: '/guides',
      title: 'Shorts guides - Chumoku',
      description:
        'How short-form video actually holds people, written for the people making it. Hooks, retention curves and why Shorts get swiped.',
      html: wrap(<GuidesIndex />),
      changefreq: 'monthly',
      priority: '0.7',
    },
    ...guideRoutes,
  ];
}


// Re-exported for scripts/prerender.mjs, which writes the FAQPage JSON-LD
// from it so the structured data cannot drift from the page.
export const faqs = FAQS;
