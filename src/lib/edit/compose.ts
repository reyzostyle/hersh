import type { CapWord, CaptionStyleId, EditSettings, Segment } from './types';
import { OUT_W, OUT_H } from './types';

// One drawing routine for the preview and the export, so what plays in the
// editor is the file you get. Everything is in output pixels (1080x1920).

export interface CaptionStyle {
  id: CaptionStyleId;
  label: string;
  font: string; // canvas font family
  weight: number;
  size: number;
  upper: boolean;
  maxWords: number;
  maxChars: number;
  fill: string;
  hot: string; // emphasised words, and the spoken word where the style tracks it
  stroke: number; // outline width, 0 for shadow only
  trackActive: 'none' | 'color' | 'dim'; // how the word being spoken stands out
  pop: number; // starting scale of a new group
}

export const YELLOW = '#FFE81A';

export const CAPTION_STYLES: Record<Exclude<CaptionStyleId, 'none'>, CaptionStyle> = {
  pop: {
    id: 'pop', label: 'Pop', font: 'Montserrat', weight: 900, size: 84, upper: true,
    maxWords: 3, maxChars: 18, fill: '#FFFFFF', hot: YELLOW, stroke: 11, trackActive: 'color', pop: 0.86,
  },
  bold: {
    id: 'bold', label: 'Bold', font: 'Anton', weight: 400, size: 118, upper: true,
    maxWords: 2, maxChars: 14, fill: YELLOW, hot: '#FFFFFF', stroke: 13, trackActive: 'none', pop: 0.9,
  },
  word: {
    id: 'word', label: 'One word', font: 'Inter', weight: 800, size: 124, upper: false,
    maxWords: 1, maxChars: 99, fill: '#FFFFFF', hot: YELLOW, stroke: 0, trackActive: 'none', pop: 0.82,
  },
  clean: {
    id: 'clean', label: 'Clean', font: 'Geist', weight: 600, size: 60, upper: false,
    maxWords: 6, maxChars: 30, fill: '#FFFFFF', hot: YELLOW, stroke: 0, trackActive: 'dim', pop: 1,
  },
};

const FONTS_CSS = 'https://fonts.googleapis.com/css2?family=Anton&family=Inter:wght@800&family=Montserrat:wght@900&display=swap';

let fontsReady: Promise<void> | null = null;
export function loadCaptionFonts(): Promise<void> {
  if (fontsReady) return fontsReady;
  fontsReady = (async () => {
    if (!document.querySelector(`link[href="${FONTS_CSS}"]`)) {
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = FONTS_CSS;
      document.head.appendChild(link);
      await new Promise(r => { link.onload = r; link.onerror = r; });
    }
    await Promise.all(Object.values(CAPTION_STYLES).map(s =>
      document.fonts.load(`${s.weight} ${s.size}px "${s.font}"`).catch(() => null)));
  })();
  return fontsReady;
}

export interface CapGroup {
  words: CapWord[];
  t0: number;
  t1: number;
}

function clean(text: string, style: CaptionStyle): string {
  let t = text.trim();
  if (style.id !== 'clean') t = t.replace(/[.,;:]+$/g, '');
  if (style.id === 'word') t = t.replace(/^["'(]+|["')]+$/g, '');
  return style.upper ? t.toUpperCase() : t;
}

// Words into the phrases that share the screen. A phrase breaks on its word
// limit, its character limit, a sentence end, or a pause long enough to hear.
export function groupCaptions(caps: CapWord[], styleId: CaptionStyleId): CapGroup[] {
  if (styleId === 'none') return [];
  const style = CAPTION_STYLES[styleId];
  const groups: CapGroup[] = [];
  let cur: CapWord[] = [];
  const flush = () => { if (cur.length) groups.push({ words: cur, t0: cur[0].t0, t1: cur[cur.length - 1].t1 }); cur = []; };
  caps.forEach((w, i) => {
    const prev = caps[i - 1];
    const chars = cur.reduce((n, x) => n + x.text.length + 1, 0) + w.text.length;
    if (cur.length && (
      cur.length >= style.maxWords ||
      chars > style.maxChars ||
      (prev && w.t0 - prev.t1 > 0.45) ||
      (prev && /[.?!]$/.test(prev.text)) ||
      (style.id === 'pop' && prev && /[,;:]$/.test(prev.text))
    )) flush();
    cur.push({ ...w, text: clean(w.text, style) });
  });
  flush();
  // A phrase stays up until the next one starts, unless that is far away.
  for (let i = 0; i < groups.length; i++) {
    const next = groups[i + 1];
    groups[i].t1 = next ? Math.min(next.t0, groups[i].t1 + 0.6) : groups[i].t1 + 0.4;
  }
  return groups;
}

const easeOut = (x: number) => 1 - Math.pow(1 - Math.min(1, Math.max(0, x)), 3);

function punchAt(caps: CapWord[], t: number): number {
  let amt = 0;
  for (const w of caps) {
    if (!w.hot) continue;
    if (t < w.t0 - 0.06 || t > w.t1 + 0.45) continue;
    const a = Math.min(easeOut((t - (w.t0 - 0.06)) / 0.14), easeOut((w.t1 + 0.45 - t) / 0.3));
    amt = Math.max(amt, a);
  }
  return amt;
}

export interface FrameSource {
  image: CanvasImageSource;
  width: number;
  height: number;
}

export function drawFrame(
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  src: FrameSource | null,
  seg: Segment | null,
  t: number,
  settings: EditSettings,
  caps: CapWord[],
  groups: CapGroup[],
) {
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, OUT_W, OUT_H);

  if (src && seg && src.width > 0) {
    let zoom = seg.zoom;
    if (settings.zoom !== 'off') {
      const len = Math.max(0.001, seg.out1 - seg.out0);
      zoom *= 1 + 0.025 * ((t - seg.out0) / len); // a slow push so a long take never sits dead
    }
    if (settings.zoom === 'punch') zoom *= 1 + 0.09 * punchAt(caps, t);
    const scale = Math.max(OUT_W / src.width, OUT_H / src.height) * zoom;
    const dw = src.width * scale, dh = src.height * scale;
    // Zoom toward the upper middle, where a face sits in a talking-head frame.
    const ax = OUT_W / 2, ay = OUT_H * 0.4;
    const baseScale = Math.max(OUT_W / src.width, OUT_H / src.height);
    const bx = (OUT_W - src.width * baseScale) / 2, by = (OUT_H - src.height * baseScale) / 2;
    const k = scale / baseScale;
    const dx = ax - (ax - bx) * k, dy = ay - (ay - by) * k;
    ctx.drawImage(src.image, dx, dy, dw, dh);
  }

  if (settings.captions !== 'none') drawCaptions(ctx, t, settings, groups);
}

function drawCaptions(
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  t: number,
  settings: EditSettings,
  groups: CapGroup[],
) {
  const style = CAPTION_STYLES[settings.captions as Exclude<CaptionStyleId, 'none'>];
  const g = groups.find(x => t >= x.t0 && t < x.t1);
  if (!g) return;

  ctx.save();
  ctx.font = `${style.weight} ${style.size}px "${style.font}", Inter, sans-serif`;
  ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round';

  // Lay the words out, wrapping onto a second line past 900 px.
  const space = ctx.measureText(' ').width;
  const lines: { w: CapWord; width: number }[][] = [[]];
  let lineW = 0;
  for (const w of g.words) {
    const width = ctx.measureText(w.text).width;
    if (lines[lines.length - 1].length && lineW + space + width > 900) { lines.push([]); lineW = 0; }
    lines[lines.length - 1].push({ w, width });
    lineW += (lineW ? space : 0) + width;
  }
  const lh = style.size * 1.12;
  const cy = settings.capPos === 'middle' ? OUT_H * 0.62 : OUT_H * 0.74;
  const top = cy - ((lines.length - 1) * lh) / 2;

  const p = style.pop < 1 ? style.pop + (1 - style.pop) * easeOut((t - g.t0) / 0.1) : 1;
  ctx.translate(OUT_W / 2, cy);
  ctx.scale(p, p);
  ctx.translate(-OUT_W / 2, -cy);

  // The word being said is the last one that has started: one word lit at a
  // time, and it stays lit through the pause after it.
  let active: CapWord | null = null;
  for (const w of g.words) if (t >= w.t0) active = w;

  lines.forEach((line, li) => {
    const total = line.reduce((n, x) => n + x.width, 0) + space * (line.length - 1);
    let x = (OUT_W - total) / 2;
    const y = top + li * lh;
    for (const { w, width } of line) {
      const speaking = w === active;
      const spoken = t >= w.t0;
      let color = w.hot ? style.hot : style.fill;
      let alpha = 1;
      if (style.trackActive === 'color' && speaking) color = style.hot;
      if (style.trackActive === 'dim' && !spoken) alpha = 0.55;
      ctx.globalAlpha = alpha;
      if (style.stroke > 0) {
        ctx.lineWidth = style.stroke * 2;
        ctx.strokeStyle = '#000';
        ctx.shadowColor = 'rgba(0,0,0,0.5)';
        ctx.shadowBlur = 18;
        ctx.shadowOffsetY = 6;
        ctx.strokeText(w.text, x, y);
        ctx.shadowColor = 'transparent';
      } else {
        ctx.shadowColor = 'rgba(0,0,0,0.75)';
        ctx.shadowBlur = 28;
        ctx.shadowOffsetY = 4;
      }
      ctx.fillStyle = color;
      ctx.fillText(w.text, x, y);
      ctx.shadowColor = 'transparent';
      x += width + space;
    }
  });
  ctx.restore();
}
