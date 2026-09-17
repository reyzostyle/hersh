// Cover art for a post, drawn rather than photographed.
//
// A card grid needs an image or it reads as a list of links, and this site has
// no photography and no budget for stock. So a cover is generated from the
// slug: the same post always gets the same picture, a new post gets one for
// free, and nothing has to be commissioned before it can ship.
//
// It stays inside the brand, which is monochrome. White on --bg-app at low
// opacity, the app's own hairline and radius, no colour. The four motifs are
// all things this blog is actually about - a retention curve, a run of Shorts
// in a feed, attention spreading out from a moment, a grid with one frame that
// does not match - so the picture is about the subject rather than decoration.
//
// A post with a real image sets `cover` and this is not used. There is no
// randomness and no state: it renders identically at build time and in the
// browser, which is what prerendering requires.

/** djb2. Small, stable, and enough to pick a motif and jitter it. */
function hash(s: string): number {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0;
  return h;
}

/** mulberry32, so the jitter is deterministic per slug rather than per render. */
function rng(seed: number): () => number {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const W = 400;
const H = 240;

// Every computed coordinate goes through this. Unrounded floats were writing
// x="80.89549486071121" into the prerendered HTML, several hundred times per
// page, for a difference no screen can show.
const n = (v: number) => Math.round(v * 10) / 10;

/** A retention curve: the cliff in the first second, then the normal decline. */
function Curve(r: () => number, id: string) {
  const cliff = 0.5 + r() * 0.24;
  const tail = 0.16 + r() * 0.18;
  const bump = r() * 0.14;
  // toFixed(1) is already applied when the path string is built below.

  const y = (v: number) => H - 30 - v * (H - 78);
  const pts: [number, number][] = [
    [26, y(0.95)],
    [26 + (W - 52) * 0.05, y(cliff)],
    [26 + (W - 52) * 0.31, y(cliff * 0.84)],
    [26 + (W - 52) * 0.53, y(cliff * 0.62 + bump)],
    [26 + (W - 52) * 0.75, y(cliff * 0.44)],
    [W - 26, y(tail)],
  ];
  const d = pts.map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(' ');

  return (
    <>
      <path d={`${d} L${W - 26} ${H - 30} L26 ${H - 30} Z`} fill={`url(#${id}f)`} />
      <path d={d} fill="none" stroke="#fff" strokeOpacity="0.8" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
      {pts.map((p, i) => (
        <circle key={i} cx={p[0]} cy={p[1]} r={i === 1 ? 3.4 : 2.4} fill="#fff" fillOpacity={i === 1 ? 1 : 0.35} />
      ))}
      <line x1="26" y1={H - 30} x2={W - 26} y2={H - 30} stroke="#fff" strokeOpacity="0.2" strokeWidth="1" />
    </>
  );
}

/** A run of Shorts in a feed: one frame held, the rest swiped past. */
function Feed(r: () => number) {
  const count = 6 + Math.floor(r() * 3);
  const held = 1 + Math.floor(r() * (count - 2));
  const w = 34;
  const gap = 14;
  const total = count * w + (count - 1) * gap;
  return (
    <>
      {Array.from({ length: count }, (_, i) => {
        const x = n((W - total) / 2 + i * (w + gap));
        const h = n(i === held ? 156 : 70 + r() * 42);
        return (
          <rect
            key={i}
            x={x}
            y={n((H - h) / 2)}
            width={w}
            height={h}
            rx="5"
            fill="#fff"
            fillOpacity={i === held ? 0.9 : 0.07 + r() * 0.05}
            stroke="#fff"
            strokeOpacity={i === held ? 0 : 0.16}
            strokeWidth="1"
          />
        );
      })}
    </>
  );
}

/** Attention spreading out from the one moment that worked. */
function Arcs(r: () => number) {
  const cx = n(W * (0.26 + r() * 0.48));
  const cy = n(H * (0.46 + r() * 0.24));
  const rings = 6 + Math.floor(r() * 4);
  const step = 18 + r() * 10;
  return (
    <>
      {Array.from({ length: rings }, (_, i) => (
        <circle
          key={i}
          cx={cx}
          cy={cy}
          r={n(14 + i * step)}
          fill="none"
          stroke="#fff"
          strokeOpacity={Math.max(0.04, 0.42 - i * (0.36 / rings))}
          strokeWidth={i === 0 ? 2 : 1}
        />
      ))}
      <circle cx={cx} cy={cy} r="5" fill="#fff" fillOpacity="0.95" />
    </>
  );
}

/** A grid of frames with one that does not match the others. */
function Grid(r: () => number) {
  const cols = 6 + Math.floor(r() * 4);
  const rows = 4 + Math.floor(r() * 2);
  const odd = Math.floor(r() * cols * rows);
  const cw = (W - 56) / cols;
  const ch = (H - 56) / rows;
  const round = r() > 0.5;
  return (
    <>
      {Array.from({ length: cols * rows }, (_, i) => {
        const c = i % cols;
        const rw = Math.floor(i / cols);
        const isOdd = i === odd;
        const s = isOdd ? 1 : 0.3 + r() * 0.24;
        const w = n(cw * 0.7 * s);
        const h = n(ch * 0.7 * s);
        const x = n(28 + c * cw + (cw - w) / 2);
        const y = n(28 + rw * ch + (ch - h) / 2);
        return round ? (
          <circle key={i} cx={n(x + w / 2)} cy={n(y + h / 2)} r={n(Math.min(w, h) / 2)} fill="#fff" fillOpacity={isOdd ? 0.95 : 0.15} />
        ) : (
          <rect key={i} x={x} y={y} width={w} height={h} rx="2" fill="#fff" fillOpacity={isOdd ? 0.95 : 0.15} />
        );
      })}
    </>
  );
}

/** A waveform: the sound, with the loudest moment marked. */
function Wave(r: () => number) {
  const bars = 40 + Math.floor(r() * 16);
  const mid = H / 2;
  const peak = Math.floor(bars * (0.2 + r() * 0.6));
  const gap = (W - 56) / bars;
  return (
    <>
      <line x1="28" y1={mid} x2={W - 28} y2={mid} stroke="#fff" strokeOpacity="0.1" strokeWidth="1" />
      {Array.from({ length: bars }, (_, i) => {
        const dist = Math.abs(i - peak) / bars;
        const h = n((14 + r() * 42) * (1 + (1 - dist) * 1.5));
        const isPeak = i === peak;
        return (
          <rect
            key={i}
            x={n(28 + i * gap)}
            y={n(mid - h / 2)}
            width={n(Math.max(1.5, gap * 0.45))}
            height={h}
            rx="1"
            fill="#fff"
            fillOpacity={isPeak ? 0.95 : 0.2 + (1 - dist) * 0.22}
          />
        );
      })}
    </>
  );
}

/** A timeline with the seconds that decide it marked off at the front. */
function Timeline(r: () => number) {
  const track = n(H * (0.42 + r() * 0.2));
  const cut = 0.08 + r() * 0.12;
  const marks = 5 + Math.floor(r() * 4);
  return (
    <>
      <rect x="28" y={track - 16} width={W - 56} height="32" rx="6" fill="#fff" fillOpacity="0.07" />
      <rect x="28" y={track - 16} width={n((W - 56) * cut)} height="32" rx="6" fill="#fff" fillOpacity="0.9" />
      {Array.from({ length: marks }, (_, i) => {
        const x = n(28 + (W - 56) * (cut + ((1 - cut) / marks) * (i + 0.5)));
        return (
          <g key={i}>
            <line x1={x} y1={track - 16} x2={x} y2={track + 16} stroke="#fff" strokeOpacity="0.22" strokeWidth="1" />
            <circle cx={x} cy={track + 34} r={n(2 + r() * 2)} fill="#fff" fillOpacity={0.14 + r() * 0.18} />
          </g>
        );
      })}
      <line x1="28" y1={track + 56} x2={W - 28} y2={track + 56} stroke="#fff" strokeOpacity="0.08" strokeWidth="1" />
    </>
  );
}

// Typed so a motif that does not need the gradient id can just not declare it.
type Motif = (r: () => number, id: string) => JSX.Element;
const MOTIFS: Record<MotifName, Motif> = { curve: Curve, feed: Feed, arcs: Arcs, grid: Grid, wave: Wave, timeline: Timeline };
export const MOTIF_NAMES = ['curve', 'feed', 'arcs', 'grid', 'wave', 'timeline'] as const;
export type MotifName = (typeof MOTIF_NAMES)[number];

export function BlogCover({ slug, art, className }: { slug: string; art?: MotifName; className?: string }) {
  const h = hash(slug);
  const r = rng(h);
  // A post can name the picture it wants; otherwise the slug picks one, so a
  // new post never has to decide before it can ship.
  const Motif = MOTIFS[art ?? MOTIF_NAMES[h % MOTIF_NAMES.length]];
  // Unique per slug: two of these can sit on the same page, and SVG gradient
  // ids are global, so a shared id would make the second one inherit the first.
  const id = `c${h.toString(36)}`;

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className={className}
      preserveAspectRatio="xMidYMid slice"
      aria-hidden="true"
      role="presentation"
    >
      <defs>
        <radialGradient id={`${id}w`} cx="30%" cy="18%" r="85%">
          <stop offset="0%" stopColor="#fff" stopOpacity="0.10" />
          <stop offset="100%" stopColor="#fff" stopOpacity="0" />
        </radialGradient>
        <linearGradient id={`${id}f`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#fff" stopOpacity="0.16" />
          <stop offset="100%" stopColor="#fff" stopOpacity="0" />
        </linearGradient>
        <pattern id={`${id}g`} width="28" height="28" patternUnits="userSpaceOnUse">
          <path d="M28 0 L0 0 0 28" fill="none" stroke="#fff" strokeOpacity="0.045" strokeWidth="1" />
        </pattern>
      </defs>

      <rect width={W} height={H} fill="var(--bg-app)" />
      <rect width={W} height={H} fill={`url(#${id}g)`} />
      <rect width={W} height={H} fill={`url(#${id}w)`} />
      {Motif(r, id)}
    </svg>
  );
}
