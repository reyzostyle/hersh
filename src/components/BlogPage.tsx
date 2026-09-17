import { ArrowLeftOutlineIcon as ArrowLeft, ArrowRightUpOutlineIcon as ArrowUpRight } from '@solar-icons/react';
import { postsByDate, formatDate, readingMinutes, type Post } from '../lib/blog';
import { BlogCover } from './BlogCover';

// The public writing.
//
// This used to be the Privacy and Terms shell: one flat plate, everything the
// same size inside it, no pictures. It read as a legal page, which is roughly
// the opposite of an invitation to read. It is a card grid and a typeset
// article now.
//
// The plate, the hairline and the radius are the app's tokens rather than
// anything bespoke, for the reason the landing page was rebuilt on them: a
// visitor who reads a post and then signs up should not feel handed to
// different software. No colour is introduced here - the brand is monochrome
// and the covers are drawn to stay that way.
//
// The answer still sits at the top of a post, before any navigation or product
// mention. An engine lifting one block from the page should lift the one that
// answers the question in the title, and it takes the first substantial block
// it finds.

const plate: React.CSSProperties = {
  background: 'var(--bg-raised)',
  border: '1px solid var(--line)',
  borderRadius: 'var(--r-md)',
};

const SECTION = 'w-full max-w-5xl mx-auto px-5 sm:px-8';

// Public pages had no way back into the site except one text link, which is
// part of why they read as attachments rather than as a section of it.
function TopBar() {
  return (
    <header className="sticky top-0 z-20" style={{ borderBottom: '1px solid var(--line)', background: 'rgba(10,10,11,0.88)', backdropFilter: 'blur(12px)' }}>
      <div className={`${SECTION} h-14 flex items-center gap-3`}>
        <a href="/" className="flex items-center gap-2 font-black uppercase tracking-[0.14em] text-[13px] transition-opacity hover:opacity-70" style={{ color: 'var(--text)' }}>
          <img src="/chumoku-mark.png" alt="" className="h-[13px] w-auto" />
          Chumoku
        </a>
        <a href="/blog" className="text-[13px] ml-2 transition-colors hover:text-[var(--text)]" style={{ color: 'var(--text-muted)' }}>
          Blog
        </a>
        <a
          href="/"
          className="ml-auto text-[13px] font-medium px-3.5 py-1.5 rounded-full transition-opacity hover:opacity-85"
          style={{ background: 'var(--accent)', color: 'var(--on-accent)' }}
        >
          Get started
        </a>
      </div>
    </header>
  );
}

function Page({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen" style={{ background: 'var(--bg-app)' }}>
      <TopBar />
      {children}
      <footer style={{ borderTop: '1px solid var(--line)' }}>
        <div className={`${SECTION} py-8 flex flex-wrap items-center gap-x-5 gap-y-2 text-[13px]`}>
          <span style={{ color: 'var(--text-faint)' }}>© {new Date().getFullYear()} Chumoku</span>
          <a href="/blog" className="ml-auto transition-colors hover:text-[var(--text)]" style={{ color: 'var(--text-muted)' }}>All posts</a>
          <a href="/rss.xml" className="transition-colors hover:text-[var(--text)]" style={{ color: 'var(--text-muted)' }}>RSS</a>
          <a href="/privacy" className="transition-colors hover:text-[var(--text)]" style={{ color: 'var(--text-muted)' }}>Privacy</a>
          <a href="/terms" className="transition-colors hover:text-[var(--text)]" style={{ color: 'var(--text-muted)' }}>Terms</a>
        </div>
      </footer>
    </div>
  );
}

// Tags were pills, which is the default badge every template ships with and
// reads as one. They are a line of small caps now - the same .label-mono the
// landing page uses for SHORTS ONLY and 20 FREE CREDITS, so the blog borrows a
// label the brand already had instead of inventing a component.
function TagLine({ tags, className }: { tags: string[]; className?: string }) {
  return <p className={`label-mono ${className ?? ''}`}>{tags.join(' · ')}</p>;
}

function Cover({ post, className }: { post: Post; className?: string }) {
  return post.cover
    ? <img src={post.cover} alt="" className={`${className} object-cover`} />
    : <BlogCover slug={post.slug} art={post.art} className={className} />;
}

function Meta({ post }: { post: Post }) {
  return (
    <p className="text-[13px]" style={{ color: 'var(--text-faint)' }}>
      {formatDate(post.published)} · {readingMinutes(post)} min read
    </p>
  );
}

function Card({ post }: { post: Post }) {
  return (
    <a
      href={`/blog/${post.slug}`}
      className="blog-card group flex flex-col overflow-hidden"
    >
      <Cover post={post} className="w-full aspect-[5/3] block" />
      <div className="p-5 flex flex-col gap-2.5 flex-1" style={{ borderTop: '1px solid var(--line)' }}>
        <Meta post={post} />
        <h2 className="font-semibold text-[17px] leading-snug text-balance transition-opacity group-hover:opacity-80" style={{ color: 'var(--text)' }}>
          {post.h1}
        </h2>
        {/* Two lines, clipped. The description is written as the page's meta
            description and has to stay whole in the <head>; on a card it is
            there to tell you whether to click, and four lines of it turns a
            grid of three into a wall of text. */}
        <p className="text-[14px] leading-relaxed line-clamp-2" style={{ color: 'var(--text-muted)' }}>
          {post.description}
        </p>
        <TagLine tags={post.tags} className="mt-auto pt-3" />
      </div>
    </a>
  );
}

export function BlogIndex() {
  const posts = postsByDate();

  return (
    <Page>
      <div className={`${SECTION} pt-14 pb-10`}>
        <h1 className="font-bold text-[34px] sm:text-[44px] leading-[1.05] tracking-tight mb-4" style={{ color: 'var(--text)' }}>
          Blog
        </h1>
        <p className="text-[16px] leading-relaxed max-w-xl" style={{ color: 'var(--text-muted)' }}>
          How short-form video actually holds people, written for the people making it. No keyword
          tables, no tags, no advice borrowed from long-form.
        </p>
      </div>

      <div className={`${SECTION} pb-20`}>
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {posts.map(p => <Card key={p.slug} post={p} />)}
        </div>
      </div>
    </Page>
  );
}

export function BlogPost({ post }: { post: Post }) {
  const others = postsByDate().filter(p => p.slug !== post.slug).slice(0, 2);
  const ARTICLE = 'w-full max-w-[720px] mx-auto px-5 sm:px-8';

  return (
    <Page>
      <article className="pb-16">
        <div className={`${ARTICLE} pt-10`}>
          <a href="/blog" className="inline-flex items-center gap-2 text-[13px] mb-8 transition-colors hover:text-[var(--text)]" style={{ color: 'var(--text-muted)' }}>
            <ArrowLeft className="w-3.5 h-3.5" /> All posts
          </a>

          <TagLine tags={[post.tags[0]]} className="mb-3" />
          <h1 className="font-bold text-[30px] sm:text-[40px] leading-[1.08] tracking-tight text-balance mb-4" style={{ color: 'var(--text)' }}>
            {post.h1}
          </h1>
          <Meta post={post} />
        </div>

        <div className={`${ARTICLE} mt-8`}>
          <Cover post={post} className="w-full aspect-[2/1] block rounded-[var(--r-md)]" />
        </div>

        <div className={`${ARTICLE} mt-10`}>
          {/* The lead is the quotable block: a complete answer in one paragraph,
              above everything else. It is set larger than the body so a reader
              scanning the page lands on it too, not only an engine. */}
          <p className="text-[18px] sm:text-[19px] leading-[1.6]" style={{ color: 'var(--text)' }}>
            {post.summary}
          </p>

          {post.sections.map(s => (
            <section key={s.h} className="mt-11">
              <h2 className="font-semibold text-[21px] sm:text-[23px] leading-snug tracking-tight mb-4 text-balance" style={{ color: 'var(--text)' }}>
                {s.h}
              </h2>
              <div className="space-y-4">
                {s.p.map((para, i) => (
                  <p key={i} className="text-[16px] leading-[1.75]" style={{ color: 'var(--text)', opacity: 0.86 }}>
                    {para}
                  </p>
                ))}
              </div>
            </section>
          ))}

          {!!post.faq.length && (
            <section className="mt-14 p-6 sm:p-7" style={plate}>
              <h2 className="font-semibold text-[19px] tracking-tight mb-5" style={{ color: 'var(--text)' }}>
                Common questions
              </h2>
              <div className="space-y-5">
                {post.faq.map((f, i) => (
                  <div key={f.q} className={i ? 'pt-5' : ''} style={i ? { borderTop: '1px solid var(--line)' } : undefined}>
                    <h3 className="text-[15px] font-medium mb-2" style={{ color: 'var(--text)' }}>{f.q}</h3>
                    <p className="text-[15px] leading-[1.7]" style={{ color: 'var(--text-muted)' }}>{f.a}</p>
                  </div>
                ))}
              </div>
            </section>
          )}

          <TagLine tags={post.tags} className="mt-10" />

          {/* Both dates, because they mean different things to a reader deciding
              whether this is current, and the structured data carries both. */}
          <p className="text-[13px] mt-6" style={{ color: 'var(--text-faint)' }}>
            Published {formatDate(post.published)}
            {post.updated !== post.published && <> · Updated {formatDate(post.updated)}</>}
          </p>

          {/* One mention, at the end, after the page has been useful without it.
              A post that pitches in its opening paragraph is an ad, and an
              answer engine treats it as one. */}
          <div className="mt-10 p-6" style={plate}>
            <p className="text-[15px] leading-[1.7]" style={{ color: 'var(--text)', opacity: 0.86 }}>
              Chumoku does this reading for you: send it a Short and it watches the whole thing,
              marks where attention drops, and tells you what to change in the edit. With your
              channel connected it reads your real retention curve rather than guessing at it.
            </p>
            <a
              href="/"
              className="inline-flex items-center gap-1.5 mt-4 text-[14px] font-medium px-4 py-2 rounded-full transition-opacity hover:opacity-85"
              style={{ background: 'var(--accent)', color: 'var(--on-accent)' }}
            >
              Try it <ArrowUpRight className="w-3.5 h-3.5" />
            </a>
          </div>
        </div>

        {!!others.length && (
          <div className={`${ARTICLE} mt-16`}>
            <h2 className="font-semibold text-[19px] tracking-tight mb-5" style={{ color: 'var(--text)' }}>
              Keep reading
            </h2>
            <div className="grid gap-5 sm:grid-cols-2">
              {others.map(p => <Card key={p.slug} post={p} />)}
            </div>
          </div>
        )}
      </article>
    </Page>
  );
}
