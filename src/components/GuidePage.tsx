import { ArrowLeftOutlineIcon as ArrowLeft, ArrowRightUpOutlineIcon as ArrowUpRight } from '@solar-icons/react';
import { GUIDES, type Guide } from '../lib/guides';

// The public writing. Same shell as Privacy and Terms, because these are the
// same kind of page: read by people who are not signed in, and by crawlers that
// never will be.
//
// The answer sits at the top, before any navigation or product mention. An
// engine lifting one block from this page should lift the one that answers the
// question in the title, and it will take the first substantial block it finds.
function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen" style={{ background: 'linear-gradient(160deg, rgb(var(--surface-rgb)) 0%, rgb(var(--surface-rgb)) 100%)' }}>
      <div className="max-w-3xl mx-auto px-6 py-12">
        <a href="/" className="inline-flex items-center gap-2 text-sm text-gray-400 hover:text-white transition-colors mb-8">
          <ArrowLeft className="w-4 h-4" /> Back to Chumoku
        </a>
        <div
          className="rounded-2xl p-8 sm:p-10"
          style={{
            background: 'rgba(255,255,255,0.04)',
            border: '1px solid rgba(255,255,255,0.08)',
            backdropFilter: 'blur(12px)',
          }}
        >
          {children}
        </div>
      </div>
    </div>
  );
}

export function GuidePage({ guide }: { guide: Guide }) {
  const others = GUIDES.filter(g => g.slug !== guide.slug);

  return (
    <Shell>
      <article>
        <h1 className="text-white font-bold text-2xl sm:text-3xl mb-4 text-balance">{guide.h1}</h1>

        {/* The summary is the quotable block: a complete answer in one
            paragraph, above everything else on the page. */}
        <p className="text-[15px] leading-relaxed mb-8" style={{ color: 'var(--text)' }}>
          {guide.summary}
        </p>

        {guide.sections.map(s => (
          <section key={s.h} className="mb-8">
            <h2 className="text-white font-semibold text-lg mb-3">{s.h}</h2>
            <div className="text-gray-300 text-sm leading-relaxed space-y-3">
              {s.p.map((para, i) => <p key={i}>{para}</p>)}
            </div>
          </section>
        ))}

        {!!guide.faq.length && (
          <section className="mb-8">
            <h2 className="text-white font-semibold text-lg mb-3">Common questions</h2>
            <div className="space-y-5">
              {guide.faq.map(f => (
                <div key={f.q}>
                  <h3 className="text-white text-sm font-medium mb-1.5">{f.q}</h3>
                  <p className="text-gray-300 text-sm leading-relaxed">{f.a}</p>
                </div>
              ))}
            </div>
          </section>
        )}

        <p className="text-gray-500 text-xs mb-8">Last updated: {guide.updated}</p>

        {/* One mention, at the end, after the page has been useful without it.
            A guide that pitches in its opening paragraph is an ad, and an
            answer engine treats it as one. */}
        <div className="rounded-xl p-5 mb-8" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)' }}>
          <p className="text-gray-300 text-sm leading-relaxed">
            Chumoku does this reading for you: send it a Short and it watches the whole thing, marks
            where attention drops, and tells you what to change in the edit. With your channel
            connected it reads your real retention curve rather than guessing at it.
          </p>
          <a href="/" className="inline-flex items-center gap-1.5 mt-3 text-sm text-white hover:opacity-80 transition-opacity">
            Try it <ArrowUpRight className="w-3.5 h-3.5" />
          </a>
        </div>

        {!!others.length && (
          <section>
            <h2 className="text-white font-semibold text-lg mb-3">More on Shorts</h2>
            <ul className="space-y-2">
              {others.map(g => (
                <li key={g.slug}>
                  <a href={`/guides/${g.slug}`} className="text-sm text-gray-300 hover:text-white transition-colors">
                    {g.h1}
                  </a>
                </li>
              ))}
            </ul>
          </section>
        )}
      </article>
    </Shell>
  );
}

export function GuidesIndex() {
  return (
    <Shell>
      <h1 className="text-white font-bold text-2xl sm:text-3xl mb-3 text-balance">Shorts guides</h1>
      <p className="text-gray-300 text-sm leading-relaxed mb-8">
        How short-form video actually holds people, written for the people making it. No keyword
        tables, no tags, no advice borrowed from long-form.
      </p>
      <ul className="space-y-5">
        {GUIDES.map(g => (
          <li key={g.slug}>
            <a href={`/guides/${g.slug}`} className="group block">
              <h2 className="text-white font-semibold text-base mb-1 group-hover:opacity-80 transition-opacity">{g.h1}</h2>
              <p className="text-gray-400 text-sm leading-relaxed">{g.description}</p>
            </a>
          </li>
        ))}
      </ul>
    </Shell>
  );
}
