import { useEffect, useRef, useState } from 'react';
import { GraphUpOutlineIcon as TrendingUpIcon } from '@solar-icons/react';

// The landing page's moving parts, after money.x.com.
//
// What was worth taking from it is not a look but a rhythm: every section
// opens on a hairline, a two-tone headline sits on the left with one short
// paragraph opposite it, and the proof is a small piece of live interface that
// does something as you reach it - a number counts, a list fills in, a curve
// draws. Nothing floats in from off-screen and nothing loops for attention.
//
// Every tile here shows real words and real product numbers (the credit
// prices, the score scale, the shape of a retention curve), never skeleton
// bars. The one rule carried over from the old page: a mockup that shows grey
// placeholders reads as a page that failed to load.
//
// Server-rendered first (src/prerender.tsx), so every component renders its
// FINISHED state until JavaScript is running and the element is on screen.
// A crawler and a reader without JS see "72 / 100", never "0 / 100".

// ─── In view ─────────────────────────────────────────────────────────────────

export function useInView<T extends HTMLElement = HTMLDivElement>(threshold = 0.25) {
  const ref = useRef<T>(null);
  // null = not measured yet (server, or before the effect), so animated
  // components can render their end state on the server.
  const [inView, setInView] = useState<boolean | null>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (typeof IntersectionObserver === 'undefined' || prefersReducedMotion()) { setInView(true); return; }
    setInView(false);
    const io = new IntersectionObserver(
      ([e]) => { if (e.isIntersecting) { setInView(true); io.disconnect(); } },
      { threshold, rootMargin: '0px 0px -60px 0px' },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [threshold]);
  return { ref, inView };
}

function prefersReducedMotion() {
  return typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
}

// Staggered entrance for a child: hidden only once we know it is off screen.
function enter(inView: boolean | null, i = 0, base = 0): React.CSSProperties {
  const shown = inView !== false;
  return {
    opacity: shown ? 1 : 0,
    transform: shown ? 'none' : 'translateY(8px)',
    transition: `opacity 0.55s ease ${base + i * 90}ms, transform 0.55s cubic-bezier(.2,.7,.2,1) ${base + i * 90}ms`,
  };
}

// Counts up to `to` once in view. Renders `to` on the server.
function useCount(to: number, inView: boolean | null, ms = 1100) {
  const [n, setN] = useState(to);
  useEffect(() => {
    if (inView === false) { setN(0); return; }
    if (inView !== true || prefersReducedMotion()) { setN(to); return; }
    let raf = 0;
    const start = performance.now();
    const tick = (t: number) => {
      const p = Math.min(1, (t - start) / ms);
      setN(Math.round(to * (1 - Math.pow(1 - p, 3))));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [to, inView, ms]);
  return n;
}

// ─── Section head ────────────────────────────────────────────────────────────
// Hairline, eyebrow, one headline that fits on one line: the bright half and
// its muted tail on the same line. There used to be a paragraph opposite it;
// it was the text nobody read, and at that width it kept leaving a single word
// on its second line.

export function Head({ eyebrow, title, muted, id }: {
  eyebrow: string; title: string; muted?: string; id?: string;
}) {
  const { ref, inView } = useInView<HTMLDivElement>(0.3);
  return (
    <div ref={ref} id={id} className="pt-8 sm:pt-10 mb-10 sm:mb-12 scroll-mt-16" style={{ borderTop: '1px solid var(--line)' }}>
      <p className="label-mono mb-5 flex items-center gap-2" style={enter(inView)}>
        <span className="inline-block w-1 h-1 rounded-full" style={{ background: 'var(--text-faint)' }} />
        {eyebrow}
      </p>
      <h2 className="display text-balance" style={{ ...enter(inView, 1), color: 'var(--text)' }}>
        {title}
        {muted && <span style={{ color: 'var(--text-muted)' }}> {muted}</span>}
      </h2>
    </div>
  );
}

// ─── The workflow, 01 to 06 ──────────────────────────────────────────────────

const tile: React.CSSProperties = {
  background: 'var(--bg-raised)',
  border: '1px solid var(--line)',
  borderRadius: 'var(--r-md)',
};

function Tile({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`relative h-[188px] overflow-hidden p-4 ${className}`} style={tile}>
      {children}
    </div>
  );
}

function FindTile({ inView }: { inView: boolean | null }) {
  const rows = [
    { t: 'i ranked every mob by how scary it is', m: '6.2x' },
    { t: 'roblox games that should not exist', m: '3.8x' },
    { t: 'he tried the hardest seed', m: '2.4x' },
  ];
  return (
    <Tile>
      <p className="label-mono mb-3">Outliers in your niche</p>
      <div className="space-y-2">
        {rows.map((r, i) => (
          <div key={r.t} className="flex items-center gap-2.5 px-2.5 py-2 rounded-lg" style={{ ...enter(inView, i, 150), background: 'var(--bg-app)', border: '1px solid var(--line)' }}>
            <span className="flex items-center gap-1 font-mono text-[10.5px] px-1.5 py-0.5 rounded tabular-nums flex-shrink-0"
                  style={{ background: 'rgba(var(--process-rgb),0.12)', color: 'var(--process)' }}>
              <TrendingUpIcon className="w-3 h-3" />{r.m}
            </span>
            <span className="text-[12px] truncate" style={{ color: 'var(--text)' }}>{r.t}</span>
          </div>
        ))}
      </div>
    </Tile>
  );
}

// The two icons the extension actually injects (extension/content.js), so the
// tile shows the real buttons and not two blank circles.
function AnalyzeGlyph({ className = '' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /><path d="M8 12.5l2-2.5 2 1.5 2-3" />
    </svg>
  );
}
function StealGlyph({ className = '' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="8" y="8" width="12" height="12" rx="2.5" />
      <path d="M16 8V6.5A2.5 2.5 0 0 0 13.5 4h-7A2.5 2.5 0 0 0 4 6.5v7A2.5 2.5 0 0 0 6.5 16H8" />
      <path d="M14 11.5v5M11.5 14h5" />
    </svg>
  );
}

function StealTile({ inView }: { inView: boolean | null }) {
  // Just the two buttons the extension adds, at a size you can read. Steal is
  // the filled one and pulses once as the tile comes into view.
  return (
    <Tile className="flex items-center justify-center">
      <span className="absolute left-4 top-4 label-mono">On YouTube</span>
      <div className="flex items-center gap-2.5">
        {[
          { l: 'Analyze', G: AnalyzeGlyph, primary: false },
          { l: 'Steal', G: StealGlyph, primary: true },
        ].map(({ l, G, primary }, i) => (
          <span key={l}
                className={`flex items-center gap-2 pl-3.5 pr-4 py-2.5 rounded-full text-[13.5px] font-medium ${primary && inView ? 'lp-pulse' : ''}`}
                style={{
                  ...enter(inView, i, 200),
                  background: primary ? 'var(--accent)' : 'transparent',
                  color: primary ? 'var(--on-accent)' : 'var(--text)',
                  border: primary ? '1px solid transparent' : '1px solid var(--line-strong)',
                }}>
            <G className="w-4 h-4" />
            {l}
          </span>
        ))}
      </div>
    </Tile>
  );
}

function OutlineTile({ inView }: { inView: boolean | null }) {
  const lines = [
    { k: 'Hook, 0-3s', v: 'Rank the scariest mob before anyone asks why.' },
    { k: 'Build, 3-18s', v: 'Cut on every rank, number on screen.' },
    { k: 'Payoff, 18-27s', v: 'Number one is the one nobody fears.' },
  ];
  return (
    <Tile>
      <p className="label-mono mb-3">Your version</p>
      <div className="space-y-2.5">
        {lines.map((l, i) => (
          <div key={l.k} style={enter(inView, i, 150)}>
            <p className="font-mono text-[9.5px] uppercase tracking-wider" style={{ color: 'var(--text-faint)' }}>{l.k}</p>
            <p className="text-[12px] leading-snug mt-0.5" style={{ color: i === 0 ? 'var(--text)' : 'var(--text-muted)' }}>{l.v}</p>
          </div>
        ))}
      </div>
    </Tile>
  );
}

function ScoreTile({ inView }: { inView: boolean | null }) {
  const n = useCount(72, inView);
  return (
    <Tile className="flex flex-col">
      <p className="label-mono">Hook</p>
      <p className="text-[12.5px] mt-2" style={{ color: 'var(--text-muted)' }}>"nobody has survived this seed"</p>
      <div className="mt-auto">
        <p className="font-semibold tabular-nums leading-none" style={{ color: 'var(--text)', fontSize: 44, letterSpacing: '-0.03em' }}>
          {n}<span className="text-[14px] font-normal ml-1.5 font-mono" style={{ color: 'var(--text-faint)' }}>/ 100</span>
        </p>
        <div className="mt-3 h-1 rounded-full overflow-hidden" style={{ background: 'var(--line)' }}>
          <div className="h-full rounded-full" style={{ width: `${n}%`, background: 'var(--text)', transition: 'width 0.2s linear' }} />
        </div>
      </div>
    </Tile>
  );
}

function ChatTile({ inView }: { inView: boolean | null }) {
  return (
    <Tile className="flex flex-col justify-end gap-2">
      <div className="self-end max-w-[85%] px-3 py-2 rounded-2xl text-[12px]" style={{ ...enter(inView, 0, 100), background: 'var(--bg-app)', border: '1px solid var(--line)', color: 'var(--text)' }}>
        turn my last saved idea into a script
      </div>
      <div className="max-w-[92%] px-3 py-2 rounded-2xl text-[12px] leading-snug" style={{ ...enter(inView, 1, 500), background: 'var(--bg-app)', border: '1px solid var(--line)', color: 'var(--text-muted)' }}>
        <span style={{ color: 'var(--text)' }}>Hook:</span> "I ranked every mob by how scary it is. Number one will annoy you."
      </div>
    </Tile>
  );
}

// Strictly non-increasing: retention can only lose viewers inside a video.
const MINI_CURVE = [100, 94, 89, 85, 82, 80, 78, 60, 56, 54, 52, 51, 50, 49, 48, 47, 46, 45];

function RetentionTile({ inView }: { inView: boolean | null }) {
  const pts = MINI_CURVE.map((v, i) => `${(i / (MINI_CURVE.length - 1)) * 100},${(1 - v / 110) * 100}`).join(' ');
  // The cliff: the first sample after the fall.
  const dropX = (7 / (MINI_CURVE.length - 1)) * 100;
  return (
    <Tile className="flex flex-col">
      <p className="label-mono">Your retention</p>
      {/* min-h-0 on both, or the svg keeps its intrinsic square height and
          pushes the caption out of the tile. */}
      <div className="relative flex-1 min-h-0 mt-3">
        <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="absolute inset-0 w-full h-full overflow-visible">
          <polyline points={pts} fill="none" stroke="var(--text)" strokeWidth="1.4" vectorEffect="non-scaling-stroke" />
          <line x1={dropX} x2={dropX} y1="0" y2="100" stroke="rgb(var(--danger-rgb))" strokeWidth="1" strokeDasharray="2 3"
                vectorEffect="non-scaling-stroke" style={enter(inView, 0, 1100)} />
        </svg>
        {/* The curve draws left to right by uncovering it: a plate the colour
            of the tile slides off to the right. A dash-offset draw does not
            survive vector-effect: non-scaling-stroke, which the line needs to
            stay 1.4px when the box is stretched. */}
        <div aria-hidden="true" className="absolute inset-y-0 right-0 -left-1"
             style={{
               background: 'var(--bg-raised)',
               transformOrigin: 'right',
               transform: inView === false ? 'scaleX(1)' : 'scaleX(0)',
               transition: 'transform 1.3s cubic-bezier(.4,0,.2,1) 0.2s',
             }} />
      </div>
      <p className="font-mono text-[10px] mt-2" style={{ ...enter(inView, 0, 1200), color: 'rgb(var(--danger-rgb))' }}>0:12 · people left here</p>
    </Tile>
  );
}

const STEPS: { n: string; title: string; text: string; Tile: (p: { inView: boolean | null }) => JSX.Element }[] = [
  // One line each at the tile's width. Two-line captions kept ending on a
  // single word, which reads as copy that ran out of room.
  { n: '01', title: 'Find what works', text: 'Outliers from your niche, ranked.', Tile: FindTile },
  { n: '02', title: 'Steal it while you scroll', text: 'One button on any Short on YouTube.', Tile: StealTile },
  { n: '03', title: 'Get your version', text: 'The same moves, built for your channel.', Tile: OutlineTile },
  { n: '04', title: 'Score it before you film', text: 'Hooks and scripts, scored out of 100.', Tile: ScoreTile },
  { n: '05', title: 'Ask for anything', text: 'A chat that knows your ideas and stats.', Tile: ChatTile },
  { n: '06', title: 'See why it flopped', text: 'Your retention, and where people left.', Tile: RetentionTile },
];

export function WorkflowGrid() {
  return (
    <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-x-4 gap-y-10">
      {STEPS.map(s => <Step key={s.n} {...s} />)}
    </div>
  );
}

function Step({ n, title, text, Tile: T }: (typeof STEPS)[number]) {
  const { ref, inView } = useInView<HTMLDivElement>(0.35);
  return (
    <div ref={ref} style={enter(inView)}>
      <T inView={inView} />
      <div className="flex gap-3 mt-4">
        <span className="font-mono text-[11px] tabular-nums pt-0.5" style={{ color: 'var(--text-faint)' }}>{n}</span>
        <div>
          <p className="text-[14.5px] font-medium" style={{ color: 'var(--text)' }}>{title}</p>
          <p className="text-[13px] leading-relaxed mt-1" style={{ color: 'var(--text-muted)' }}>{text}</p>
        </div>
      </div>
    </div>
  );
}

// ─── Credits, as a ledger ────────────────────────────────────────────────────
// What a month of using it looks like: a few ordinary actions come in one at a
// time and the balance ticks down with each. It replaced a big "1 credit" with
// cards floating around it, which read as a template rather than as the app.

const LEDGER: { what: string; cost: number }[] = [
  { what: 'Wrote a script from a saved idea', cost: 1 },
  { what: 'Scored a hook', cost: 1 },
  { what: 'Stole a format on YouTube', cost: 5 },
  { what: 'Asked why a Short flopped', cost: 1 },
];
const START = 300;

export function CreditLedger() {
  const { ref, inView } = useInView<HTMLDivElement>(0.35);
  // How many rows have landed. On the server and without motion: all of them.
  const [shown, setShown] = useState(LEDGER.length);
  useEffect(() => {
    if (inView === false) { setShown(0); return; }
    if (inView !== true || prefersReducedMotion()) { setShown(LEDGER.length); return; }
    setShown(0);
    const timers = LEDGER.map((_, i) => setTimeout(() => setShown(i + 1), 450 + i * 650));
    return () => timers.forEach(clearTimeout);
  }, [inView]);
  const balance = START - LEDGER.slice(0, shown).reduce((a, r) => a + r.cost, 0);

  return (
    <div ref={ref} className="grid md:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)] overflow-hidden"
         style={{ background: 'var(--bg-raised)', border: '1px solid var(--line)', borderRadius: 'var(--r-lg)' }}>
      <div className="p-6 sm:p-8 flex flex-col justify-between gap-6 md:border-r" style={{ borderColor: 'var(--line)' }}>
        <p className="label-mono">Plus · this month</p>
        <div>
          <p className="font-semibold tabular-nums leading-none" style={{ color: 'var(--text)', fontSize: 'clamp(3rem, 2rem + 4vw, 4.5rem)', letterSpacing: '-0.045em' }}>
            {balance}
          </p>
          <p className="text-[13px] mt-2" style={{ color: 'var(--text-muted)' }}>credits left</p>
        </div>
      </div>
      <div className="p-3 sm:p-4 border-t md:border-t-0" style={{ borderColor: 'var(--line)' }}>
        {LEDGER.map((r, i) => (
          <div key={r.what} className="flex items-center justify-between gap-4 px-3 py-3"
               style={{
                 opacity: i < shown ? 1 : 0,
                 transform: i < shown ? 'none' : 'translateY(6px)',
                 transition: 'opacity 0.45s ease, transform 0.45s cubic-bezier(.2,.7,.2,1)',
                 borderBottom: i < LEDGER.length - 1 ? '1px solid var(--line)' : undefined,
               }}>
            <span className="text-[13.5px] truncate" style={{ color: 'var(--text)' }}>{r.what}</span>
            <span className="font-mono text-[12px] tabular-nums flex-shrink-0" style={{ color: 'var(--text-muted)' }}>−{r.cost}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Chumoku brain, reading ──────────────────────────────────────────────────
// The brain as the thing it actually does: it reads your uploads one by one,
// then says three short things about the channel. Replaced a node graph of
// "YOU" wired to four labels, which looked generated and explained nothing.

const UPLOADS = [
  'i ranked every mob by how scary it is',
  'the worst update minecraft ever shipped',
  'ranking every biome by how hard it is',
  'this seed should not exist',
  'every boss, ranked by how unfair it is',
];
const LEARNED: { k: string; v: string }[] = [
  { k: 'Niche', v: 'Minecraft rankings' },
  { k: 'Format', v: '30-45s, no face' },
  { k: 'Works best', v: 'a ranking you argue with' },
];

export function BrainScan() {
  const { ref, inView } = useInView<HTMLDivElement>(0.35);
  const [read, setRead] = useState(UPLOADS.length);
  useEffect(() => {
    if (inView === false) { setRead(0); return; }
    if (inView !== true || prefersReducedMotion()) { setRead(UPLOADS.length); return; }
    setRead(0);
    const timers = UPLOADS.map((_, i) => setTimeout(() => setRead(i + 1), 300 + i * 320));
    return () => timers.forEach(clearTimeout);
  }, [inView]);
  const done = read >= UPLOADS.length;

  return (
    <div ref={ref} className="grid md:grid-cols-2 overflow-hidden"
         style={{ background: 'var(--bg-raised)', border: '1px solid var(--line)', borderRadius: 'var(--r-lg)' }}>
      <div className="p-4 sm:p-6 md:border-r" style={{ borderColor: 'var(--line)' }}>
        <p className="label-mono mb-3">Reading your uploads</p>
        <div className="space-y-1">
          {UPLOADS.map((t, i) => (
            <div key={t} className="flex items-center gap-2.5 py-1.5">
              <span className="w-4 h-4 rounded-full flex items-center justify-center flex-shrink-0"
                    style={{
                      border: `1px solid ${i < read ? 'transparent' : 'var(--line-strong)'}`,
                      background: i < read ? 'rgba(var(--process-rgb),0.15)' : 'transparent',
                      transition: 'background 0.3s ease, border-color 0.3s ease',
                    }}>
                <svg viewBox="0 0 12 12" className="w-2.5 h-2.5" style={{ opacity: i < read ? 1 : 0, transition: 'opacity 0.3s ease' }}>
                  <path d="M2.5 6.2l2.2 2.2 4.8-4.9" fill="none" stroke="var(--process)" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </span>
              <span className="text-[13px] truncate" style={{ color: i < read ? 'var(--text)' : 'var(--text-faint)', transition: 'color 0.3s ease' }}>{t}</span>
            </div>
          ))}
        </div>
      </div>
      <div className="p-4 sm:p-6 border-t md:border-t-0" style={{ borderColor: 'var(--line)' }}>
        <p className="label-mono mb-3">What it learned</p>
        <div className="space-y-2">
          {LEARNED.map((l, i) => (
            <div key={l.k} className="flex items-baseline justify-between gap-4 px-3 py-2.5 rounded-lg"
                 style={{
                   background: 'var(--bg-app)', border: '1px solid var(--line)',
                   opacity: done ? 1 : 0, transform: done ? 'none' : 'translateY(6px)',
                   transition: `opacity 0.45s ease ${i * 120}ms, transform 0.45s cubic-bezier(.2,.7,.2,1) ${i * 120}ms`,
                 }}>
              <span className="font-mono text-[10.5px] uppercase tracking-wider flex-shrink-0" style={{ color: 'var(--text-faint)' }}>{l.k}</span>
              <span className="text-[13px] text-right truncate" style={{ color: 'var(--text)' }}>{l.v}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
