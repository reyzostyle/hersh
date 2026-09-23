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
// Hairline, eyebrow, a headline in two weights (the sentence continues in the
// muted colour rather than splitting into a subhead), one paragraph opposite.

export function Head({ eyebrow, title, muted, sub, id }: {
  eyebrow: string; title: string; muted?: string; sub?: string; id?: string;
}) {
  const { ref, inView } = useInView<HTMLDivElement>(0.3);
  return (
    <div ref={ref} id={id} className="pt-8 sm:pt-10 mb-10 sm:mb-14 scroll-mt-16" style={{ borderTop: '1px solid var(--line)' }}>
      <p className="label-mono mb-5 flex items-center gap-2" style={enter(inView)}>
        <span className="inline-block w-1 h-1 rounded-full" style={{ background: 'var(--text-faint)' }} />
        {eyebrow}
      </p>
      <div className="grid md:grid-cols-[minmax(0,1fr)_minmax(0,19rem)] gap-5 md:gap-12 items-start">
        <h2 className="display text-balance" style={{ ...enter(inView, 1), color: 'var(--text)' }}>
          {title}
          {muted && <span className="block" style={{ color: 'var(--text-muted)' }}>{muted}</span>}
        </h2>
        {sub && (
          <p className="text-[14.5px] leading-relaxed md:pt-2 text-pretty" style={{ ...enter(inView, 2), color: 'var(--text-muted)' }}>
            {sub}
          </p>
        )}
      </div>
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

function StealTile({ inView }: { inView: boolean | null }) {
  return (
    <Tile className="flex items-center justify-center">
      {/* A Short with the extension's two buttons in its action column. */}
      <div className="relative w-[104px] h-[156px] rounded-[14px] overflow-hidden"
           style={{ background: 'linear-gradient(160deg, #1d1d22, #0c0c0e)', border: '1px solid var(--line-strong)' }}>
        <div className="absolute left-2.5 bottom-3 right-10">
          <p className="text-[7.5px] font-medium" style={{ color: '#f1f1f1' }}>@tobbss</p>
          <p className="text-[7px] leading-tight mt-0.5" style={{ color: 'rgba(241,241,241,0.75)' }}>i ranked every mob by how scary it is</p>
        </div>
        <div className="absolute right-2 bottom-3 flex flex-col items-center gap-2">
          {['Analyze', 'Steal'].map((l, i) => (
            <div key={l} className="flex flex-col items-center gap-0.5" style={enter(inView, i, 200)}>
              <span className={`w-6 h-6 rounded-full ${l === 'Steal' && inView ? 'lp-pulse' : ''}`}
                    style={{ background: l === 'Steal' ? '#f1f1f1' : 'rgba(255,255,255,0.14)' }} />
              <span className="text-[7px]" style={{ color: '#f1f1f1' }}>{l}</span>
            </div>
          ))}
          <span className="w-6 h-6 rounded-full" style={{ background: 'rgba(255,255,255,0.14)' }} />
        </div>
      </div>
      <span className="absolute right-4 top-4 label-mono">On YouTube</span>
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
  { n: '01', title: 'Find what works', text: 'Shorts that beat the channel they came from, in your niche.', Tile: FindTile },
  { n: '02', title: 'Steal it while you scroll', text: 'One button on any Short, right above Like.', Tile: StealTile },
  { n: '03', title: 'Get your version', text: 'The same moves, rebuilt as an outline for your channel.', Tile: OutlineTile },
  { n: '04', title: 'Score it before you film', text: 'Hooks and scripts out of 100, with the lines to swap in.', Tile: ScoreTile },
  { n: '05', title: 'Ask for anything', text: 'A chat that reads your ideas, projects and numbers.', Tile: ChatTile },
  { n: '06', title: 'See why it flopped', text: 'Your real retention, and the second people left.', Tile: RetentionTile },
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
          <p className="text-[13px] leading-relaxed mt-1 text-pretty" style={{ color: 'var(--text-muted)' }}>{text}</p>
        </div>
      </div>
    </div>
  );
}

// ─── Showcase ────────────────────────────────────────────────────────────────
// One big true number in the middle, the things it buys drifting around it.

const FLOATERS: { label: string; value: string; pos: string; delay: number; hideSm?: boolean }[] = [
  { label: 'Hook scored', value: '72 / 100', pos: 'left-[6%] top-[14%]', delay: 0 },
  { label: 'Outline', value: 'ready', pos: 'right-[7%] top-[10%]', delay: 1.2 },
  { label: 'Idea saved', value: '6.2x outlier', pos: 'left-[10%] bottom-[14%]', delay: 2.1, hideSm: true },
  { label: 'Script', value: 'written', pos: 'right-[9%] bottom-[16%]', delay: 0.6, hideSm: true },
  { label: 'Retention', value: 'read', pos: 'left-[38%] top-[6%]', delay: 1.7, hideSm: true },
];

export function Showcase() {
  const { ref, inView } = useInView<HTMLDivElement>(0.3);
  return (
    <div ref={ref} className="relative overflow-hidden px-6 py-20 sm:py-28 text-center"
         style={{ background: 'var(--bg-raised)', border: '1px solid var(--line)', borderRadius: 'var(--r-lg)' }}>
      {FLOATERS.map((f, i) => (
        <div key={f.label} className={`absolute ${f.pos} ${f.hideSm ? 'hidden md:block' : ''}`} style={enter(inView, i, 250)}>
          <div className="lp-float px-3 py-2 text-left" style={{ animationDelay: `${f.delay}s`, background: 'var(--bg-app)', border: '1px solid var(--line)', borderRadius: 'var(--r-sm)' }}>
            <p className="font-mono text-[9.5px] uppercase tracking-wider" style={{ color: 'var(--text-faint)' }}>{f.label}</p>
            <p className="text-[13px] font-medium mt-0.5" style={{ color: 'var(--text)' }}>{f.value}</p>
          </div>
        </div>
      ))}
      <div className="relative">
        <p className="font-semibold tabular-nums leading-none" style={{ ...enter(inView), color: 'var(--text)', fontSize: 'clamp(3.5rem, 2rem + 6vw, 6.5rem)', letterSpacing: '-0.045em' }}>
          1 credit
        </p>
        <p className="text-[15px] mt-4 max-w-sm mx-auto text-balance" style={{ color: 'var(--text-muted)' }}>
          for a message. Hooks and scripts included. Watching a video is 5.
        </p>
      </div>
    </div>
  );
}
