// Injects the build-time markup from src/prerender.tsx into the built HTML,
// writing one file per public route. Run after `vite build` and the SSR build.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';

const DIST = 'dist';
const shell = readFileSync(join(DIST, 'index.html'), 'utf8');

const { render, faqs } = await import('../dist-ssr/prerender.js');
const routes = render();

// The FAQPage block in index.html is a placeholder; the real one is written
// here from the same array the page renders, so the answer an engine quotes
// and the answer a person reads can never disagree.
const faqLd = JSON.stringify({
  '@context': 'https://schema.org',
  '@type': 'FAQPage',
  mainEntity: faqs.map(f => ({
    '@type': 'Question',
    name: f.q,
    acceptedAnswer: { '@type': 'Answer', text: f.a },
  })),
}, null, 2);

// Swap the title, description and canonical URL per route, so /privacy and
// /terms stop claiming to be the landing page in search results and link
// previews. The canonical is what tells Google chumoku.co, not the old
// hershymedia.com that still redirects here, is the address to index.
const retitle = (html, title, description, path) =>
  html
    .replace(/<title>[^<]*<\/title>/, `<title>${title}</title>`)
    .replace(/(<link rel="canonical" href=")[^"]*(")/, `$1https://chumoku.co${path}$2`)
    .replace(/(<meta property="og:url" content=")[^"]*(")/, `$1https://chumoku.co${path}$2`)
    .replace(
      /(<meta name="description" content=")[^"]*(")/,
      `$1${description.replace(/"/g, '&quot;')}$2`,
    );

let count = 0;
for (const route of routes) {
  if (!route.html || route.html.length < 500) {
    throw new Error(`Prerender produced almost nothing for ${route.path} - refusing to ship an empty page`);
  }

  let page = retitle(shell, route.title, route.description, route.path);
  const before = page;
  // A route may bring its own structured data - a guide carries an Article and
  // its own questions. Anything that does not inherits the landing page's FAQ.
  const ld = route.jsonLd ? JSON.stringify(route.jsonLd, null, 2) : faqLd;
  page = page.replace(
    /<script type="application\/ld\+json">\s*\{\s*"@context": "https:\/\/schema\.org",\s*"@type": "FAQPage"[\s\S]*?<\/script>/,
    `<script type="application/ld+json">\n${ld}\n    </script>`,
  );
  if (page === before) {
    throw new Error('Could not find the FAQPage block to replace - the placeholder in index.html has moved');
  }
  page = page.replace('<div id="root"></div>', `<div id="root">${route.html}</div>`);
  if (!page.includes('id="root">')) {
    throw new Error(`Could not find the root div to fill for ${route.path}`);
  }

  // "/" is index.html; every other route becomes a directory with its own
  // index.html, which is what static hosting serves for a clean URL.
  const out = route.path === '/' ? join(DIST, 'index.html') : join(DIST, route.path, 'index.html');
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, page);
  console.log(`  prerendered ${route.path.padEnd(10)} ${(route.html.length / 1024).toFixed(1)} KB of markup -> ${out}`);
  count++;
}
console.log(`prerender: ${count} routes`);

// The sitemap is generated from the routes that were just rendered, never
// hand-written. The checked-in version listed three URLs and went stale the
// moment a page was added, which is the failure mode a hand-kept index of a
// growing thing always has. There is no public/sitemap.xml any more: this is
// the only one, and it cannot disagree with what shipped.
const today = new Date().toISOString().slice(0, 10);
const sitemap = [
  '<?xml version="1.0" encoding="UTF-8"?>',
  '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
  ...routes.map(r => [
    '  <url>',
    `    <loc>https://chumoku.co${r.path === '/' ? '/' : r.path}</loc>`,
    `    <lastmod>${today}</lastmod>`,
    `    <changefreq>${r.changefreq ?? (r.path === '/' ? 'weekly' : 'yearly')}</changefreq>`,
    `    <priority>${r.priority ?? (r.path === '/' ? '1.0' : '0.3')}</priority>`,
    '  </url>',
  ].join('\n')),
  '</urlset>',
  '',
].join('\n');
writeFileSync(join(DIST, 'sitemap.xml'), sitemap);
console.log(`sitemap: ${routes.length} urls -> ${join(DIST, 'sitemap.xml')}`);
