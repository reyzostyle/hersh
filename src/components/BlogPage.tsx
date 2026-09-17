import { ArrowLeftOutlineIcon as ArrowLeft, ArrowRightUpOutlineIcon as ArrowUpRight } from '@solar-icons/react';
import { postsByDate, formatDate, type Post } from '../lib/blog';

// The public writing. Same shell as Privacy and Terms, because these are the
// same kind of page: read by people who are not signed in, and by crawlers that
// never will be.
//
// The answer sits at the top, before any navigation or product mention. An
// engine lifting one block from this page should lift the one that answers the
// question in the title, and it will take the first substantial block it finds.
function Shell({ children, back }: { children: React.ReactNode; back: { href: string; label: string } }) {
  return (
    <div className="min-h-screen" style={{ background: 'linear-gradient(160deg, rgb(var(--surface-rgb)) 0%, rgb(var(--surface-rgb)) 100%)' }}>
      <div className="max-w-3xl mx-auto px-6 py-12">
        <a href={back.href} className="inline-flex items-center gap-2 text-sm text-gray-400 hover:text-white transition-colors mb-8">
          <ArrowLeft className="w-4 h-4" /> {back.label}
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

// A post links back to the index rather than to the home page: the index is
// where the rest of the writing is, and a crawler arriving on one post should
// be one hop from all of it.
export function BlogPost({ post }: { post: Post }) {
  const others = postsByDate().filter(p => p.slug !== post.slug);

  return (
    <Shell back={{ href: '/blog', label: 'All posts' }}>
      <article>
        <p className="text-xs font-medium uppercase tracking-wider mb-3" style={{ color: 'var(--text-muted)' }}>
          {post.topic}
        </p>
        <h1 className="text-white font-bold text-2xl sm:text-3xl mb-4 text-balance">{post.h1}</h1>

        {/* The summary is the quotable block: a complete answer in one
            paragraph, above everything else on the page. */}
        <p className="text-[15px] leading-relaxed mb-8" style={{ color: 'var(--text)' }}>
          {post.summary}
        </p>

        {post.sections.map(s => (
          <section key={s.h} className="mb-8">
            <h2 className="text-white font-semibold text-lg mb-3">{s.h}</h2>
            <div className="text-gray-300 text-sm leading-relaxed space-y-3">
              {s.p.map((para, i) => <p key={i}>{para}</p>)}
            </div>
          </section>
        ))}

        {!!post.faq.length && (
          <section className="mb-8">
            <h2 className="text-white font-semibold text-lg mb-3">Common questions</h2>
            <div className="space-y-5">
              {post.faq.map(f => (
                <div key={f.q}>
                  <h3 className="text-white text-sm font-medium mb-1.5">{f.q}</h3>
                  <p className="text-gray-300 text-sm leading-relaxed">{f.a}</p>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Both dates, because they mean different things to a reader deciding
            whether this is current, and the structured data carries both. */}
        <p className="text-gray-500 text-xs mb-8">
          Published {formatDate(post.published)}
          {post.updated !== post.published && <> · Updated {formatDate(post.updated)}</>}
        </p>

        {/* One mention, at the end, after the page has been useful without it.
            A post that pitches in its opening paragraph is an ad, and an
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
            <h2 className="text-white font-semibold text-lg mb-3">Keep reading</h2>
            <ul className="space-y-2">
              {others.map(p => (
                <li key={p.slug}>
                  <a href={`/blog/${p.slug}`} className="text-sm text-gray-300 hover:text-white transition-colors">
                    {p.h1}
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

export function BlogIndex() {
  const posts = postsByDate();

  return (
    <Shell back={{ href: '/', label: 'Back to Chumoku' }}>
      <h1 className="text-white font-bold text-2xl sm:text-3xl mb-3 text-balance">Blog</h1>
      <p className="text-gray-300 text-sm leading-relaxed mb-8">
        How short-form video actually holds people, written for the people making it. No keyword
        tables, no tags, no advice borrowed from long-form.
      </p>
      <ul className="space-y-6">
        {posts.map(p => (
          <li key={p.slug}>
            <a href={`/blog/${p.slug}`} className="group block">
              <p className="text-xs font-medium uppercase tracking-wider mb-1.5" style={{ color: 'var(--text-muted)' }}>
                {p.topic} · {formatDate(p.published)}
              </p>
              <h2 className="text-white font-semibold text-base mb-1 group-hover:opacity-80 transition-opacity">{p.h1}</h2>
              <p className="text-gray-400 text-sm leading-relaxed">{p.description}</p>
            </a>
          </li>
        ))}
      </ul>
      <p className="text-gray-500 text-xs mt-10">
        <a href="/rss.xml" className="hover:text-gray-300 transition-colors">RSS feed</a>
      </p>
    </Shell>
  );
}
