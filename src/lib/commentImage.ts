// Renders a fake social comment to a canvas, for creators who overlay them on
// their videos (the "replying to a comment" hook, chat reactions, and so on).
//
// Drawn directly on canvas rather than screenshotting DOM: the export has to be
// pixel-exact and transparent so it can sit over footage, and DOM-to-image
// libraries are unreliable about both, especially with emoji.

export type Platform = 'tiktok' | 'twitch' | 'youtube' | 'instagram';

export type TwitchBadge = 'broadcaster' | 'moderator' | 'vip' | 'subscriber' | 'verified';

export interface CommentSpec {
  platform: Platform;
  username: string;
  text: string;
  verified: boolean;
  avatar: HTMLImageElement | null;
  likes: string;
  time: string;
  dark: boolean;
  transparent: boolean;
  usernameColor: string;
  badges: TwitchBadge[];
  /** TikTok only: the white "Replying to X" sticker instead of a feed comment. */
  replySticker: boolean;
}

export const TWITCH_COLORS = [
  '#FF0000', '#0000FF', '#008000', '#B22222', '#FF7F50',
  '#9ACD32', '#FF4500', '#2E8B57', '#DAA520', '#D2691E',
  '#5F9EA0', '#1E90FF', '#FF69B4', '#8A2BE2', '#00FF7F',
];

const FONT = '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif';
const font = (weight: number, size: number) => `${weight} ${size}px ${FONT}`;

// Palette per platform, so a renderer never hardcodes a colour twice.
function palette(p: Platform, dark: boolean) {
  if (p === 'twitch') return { bg: '#18181B', text: '#EFEFF1', muted: '#ADADB8' };
  if (dark) return { bg: '#0F0F0F', text: '#F1F1F1', muted: '#AAAAAA' };
  return { bg: '#FFFFFF', text: '#161823', muted: '#8A8B91' };
}

// Deterministic colour for a generated avatar, so the same name keeps the same
// look between renders instead of flickering on every keystroke.
function avatarColor(name: string): string {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) % 360;
  return `hsl(${h}, 62%, 52%)`;
}

function drawAvatar(ctx: CanvasRenderingContext2D, spec: CommentSpec, x: number, y: number, size: number) {
  ctx.save();
  ctx.beginPath();
  ctx.arc(x + size / 2, y + size / 2, size / 2, 0, Math.PI * 2);
  ctx.clip();
  if (spec.avatar) {
    // Cover-fit, so a non-square upload isn't squashed into the circle.
    const img = spec.avatar;
    const scale = Math.max(size / img.width, size / img.height);
    const w = img.width * scale;
    const h = img.height * scale;
    ctx.drawImage(img, x + (size - w) / 2, y + (size - h) / 2, w, h);
  } else {
    const name = spec.username || '?';
    ctx.fillStyle = avatarColor(name);
    ctx.fillRect(x, y, size, size);
    ctx.fillStyle = '#FFFFFF';
    ctx.font = font(600, size * 0.44);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(name.trim().charAt(0).toUpperCase(), x + size / 2, y + size / 2 + size * 0.02);
  }
  ctx.restore();
}

function drawVerified(ctx: CanvasRenderingContext2D, x: number, y: number, size: number, color: string) {
  ctx.save();
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(x + size / 2, y + size / 2, size / 2, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#FFFFFF';
  ctx.lineWidth = Math.max(1.4, size * 0.12);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.beginPath();
  ctx.moveTo(x + size * 0.28, y + size * 0.52);
  ctx.lineTo(x + size * 0.44, y + size * 0.68);
  ctx.lineTo(x + size * 0.73, y + size * 0.34);
  ctx.stroke();
  ctx.restore();
}

const BADGE_STYLE: Record<TwitchBadge, { bg: string; glyph: string }> = {
  broadcaster: { bg: '#E91916', glyph: '●' },
  moderator: { bg: '#00AD03', glyph: '⚔' },
  vip: { bg: '#E005B9', glyph: '♦' },
  subscriber: { bg: '#6441A5', glyph: '★' },
  verified: { bg: '#5A5A5A', glyph: '✓' },
};

function drawBadges(ctx: CanvasRenderingContext2D, badges: TwitchBadge[], x: number, y: number, size: number) {
  // save/restore matters here: the glyphs are centred, and leaking that
  // textAlign onto the caller drew the username and message off to the left.
  ctx.save();
  let cx = x;
  for (const b of badges) {
    const s = BADGE_STYLE[b];
    ctx.fillStyle = s.bg;
    ctx.beginPath();
    ctx.roundRect(cx, y, size, size, size * 0.2);
    ctx.fill();
    ctx.fillStyle = '#FFFFFF';
    ctx.font = font(700, size * 0.66);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(s.glyph, cx + size / 2, y + size / 2 + size * 0.04);
    cx += size + size * 0.25;
  }
  ctx.restore();
  return cx - x;
}

// Greedy wrap. Returns the lines rather than drawing them, because every
// renderer needs the line count to size the canvas before it draws anything.
function wrapText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const out: string[] = [];
  for (const paragraph of text.split('\n')) {
    if (!paragraph) { out.push(''); continue; }
    let line = '';
    for (const word of paragraph.split(' ')) {
      const next = line ? `${line} ${word}` : word;
      if (ctx.measureText(next).width > maxWidth && line) {
        out.push(line);
        line = word;
      } else {
        line = next;
      }
    }
    out.push(line);
  }
  return out;
}

interface Layout { width: number; height: number; draw: (ctx: CanvasRenderingContext2D) => void }

// ── TikTok ──────────────────────────────────────────────────────────────────
function tiktok(measure: CanvasRenderingContext2D, spec: CommentSpec): Layout {
  const c = palette('tiktok', spec.dark);

  if (spec.replySticker) {
    // The white rounded card used as a video hook, not a feed comment.
    const PAD = 26, AV = 44, W = 760;
    measure.font = font(600, 30);
    const lines = wrapText(measure, spec.text || 'your comment here', W - PAD * 2);
    const height = PAD + 30 + 16 + lines.length * 40 + PAD;

    return {
      width: W, height,
      draw: ctx => {
        ctx.fillStyle = '#FFFFFF';
        ctx.beginPath();
        ctx.roundRect(0, 0, W, height, 20);
        ctx.fill();

        drawAvatar(ctx, spec, PAD, PAD, AV * 0.62);
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = '#6B6B72';
        ctx.font = font(400, 21);
        ctx.fillText(`Replying to ${spec.username || 'user'}'s comment`, PAD + AV * 0.62 + 12, PAD + AV * 0.31);

        ctx.fillStyle = '#161823';
        ctx.font = font(700, 30);
        ctx.textBaseline = 'top';
        lines.forEach((l, i) => ctx.fillText(l, PAD, PAD + 46 + i * 40));
      },
    };
  }

  const PAD = 24, AV = 76, GAP = 20, W = 900;
  const textW = W - PAD * 2 - AV - GAP;
  measure.font = font(400, 27);
  const lines = wrapText(measure, spec.text || 'your comment here', textW);
  const height = PAD * 2 + Math.max(AV, 36 + lines.length * 36 + 30);

  return {
    width: W, height,
    draw: ctx => {
      if (!spec.transparent) { ctx.fillStyle = c.bg; ctx.fillRect(0, 0, W, height); }
      drawAvatar(ctx, spec, PAD, PAD, AV);

      const tx = PAD + AV + GAP;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';
      ctx.fillStyle = c.muted;
      ctx.font = font(600, 24);
      ctx.fillText(spec.username || 'username', tx, PAD + 2);
      const nameW = ctx.measureText(spec.username || 'username').width;
      if (spec.verified) drawVerified(ctx, tx + nameW + 8, PAD + 2, 22, '#20D5EC');

      ctx.fillStyle = c.text;
      ctx.font = font(400, 27);
      lines.forEach((l, i) => ctx.fillText(l, tx, PAD + 38 + i * 36));

      const by = PAD + 38 + lines.length * 36 + 6;
      ctx.fillStyle = c.muted;
      ctx.font = font(400, 22);
      ctx.fillText(spec.time || '2h', tx, by);
      ctx.fillText('Reply', tx + 76, by);

      // Heart, right-aligned with its count under nothing in particular.
      const hx = W - PAD - 30, hy = by + 4;
      ctx.strokeStyle = c.muted;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(hx, hy + 16);
      ctx.bezierCurveTo(hx - 14, hy + 4, hx - 8, hy - 6, hx, hy + 2);
      ctx.bezierCurveTo(hx + 8, hy - 6, hx + 14, hy + 4, hx, hy + 16);
      ctx.stroke();
      if (spec.likes) {
        ctx.textAlign = 'right';
        ctx.fillText(spec.likes, hx - 22, by);
        ctx.textAlign = 'left';
      }
    },
  };
}

// ── Twitch ──────────────────────────────────────────────────────────────────
function twitch(measure: CanvasRenderingContext2D, spec: CommentSpec): Layout {
  const c = palette('twitch', true);
  const PAD = 20, BADGE = 26, SIZE = 27, W = 900;

  measure.font = font(700, SIZE);
  const nameW = measure.measureText(`${spec.username || 'username'}:`).width;
  const badgesW = spec.badges.length ? spec.badges.length * (BADGE + BADGE * 0.25) : 0;
  const indent = PAD + badgesW + nameW + 12;

  measure.font = font(400, SIZE);
  const first = wrapText(measure, spec.text || 'your message here', W - indent - PAD);
  const height = PAD * 2 + Math.max(BADGE, first.length * 38 - 4);

  return {
    width: W, height,
    draw: ctx => {
      if (!spec.transparent) {
        ctx.fillStyle = c.bg;
        ctx.beginPath();
        ctx.roundRect(0, 0, W, height, 10);
        ctx.fill();
      }
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      const midY = PAD + 17;

      let x = PAD;
      if (spec.badges.length) x += drawBadges(ctx, spec.badges, x, midY - BADGE / 2, BADGE);

      ctx.fillStyle = spec.usernameColor;
      ctx.font = font(700, SIZE);
      ctx.fillText(`${spec.username || 'username'}:`, x, midY);

      ctx.fillStyle = c.text;
      ctx.font = font(400, SIZE);
      first.forEach((l, i) => ctx.fillText(l, i === 0 ? indent : PAD, midY + i * 38));
    },
  };
}

// ── YouTube ─────────────────────────────────────────────────────────────────
function youtube(measure: CanvasRenderingContext2D, spec: CommentSpec): Layout {
  const c = palette('youtube', spec.dark);
  const PAD = 24, AV = 72, GAP = 20, W = 900;
  const textW = W - PAD * 2 - AV - GAP;

  measure.font = font(400, 27);
  const lines = wrapText(measure, spec.text || 'your comment here', textW);
  const height = PAD * 2 + Math.max(AV, 36 + lines.length * 36 + 34);

  return {
    width: W, height,
    draw: ctx => {
      if (!spec.transparent) { ctx.fillStyle = c.bg; ctx.fillRect(0, 0, W, height); }
      drawAvatar(ctx, spec, PAD, PAD, AV);

      const tx = PAD + AV + GAP;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';
      ctx.fillStyle = c.text;
      ctx.font = font(600, 23);
      const handle = spec.username ? (spec.username.startsWith('@') ? spec.username : `@${spec.username}`) : '@username';
      ctx.fillText(handle, tx, PAD + 2);
      const nameW = ctx.measureText(handle).width;
      let after = tx + nameW + 8;
      if (spec.verified) { drawVerified(ctx, after, PAD + 2, 20, spec.dark ? '#AAAAAA' : '#606060'); after += 28; }
      ctx.fillStyle = c.muted;
      ctx.font = font(400, 22);
      ctx.fillText(spec.time || '2 hours ago', after, PAD + 3);

      ctx.fillStyle = c.text;
      ctx.font = font(400, 27);
      lines.forEach((l, i) => ctx.fillText(l, tx, PAD + 38 + i * 36));

      // Thumbs up with a count, thumbs down bare, the way YouTube shows it now.
      const by = PAD + 38 + lines.length * 36 + 10;
      ctx.strokeStyle = c.muted;
      ctx.lineWidth = 2;
      const thumb = (ox: number, flip: boolean) => {
        ctx.save();
        ctx.translate(ox, by + (flip ? 20 : 0));
        if (flip) ctx.scale(1, -1);
        ctx.beginPath();
        ctx.roundRect(0, 8, 7, 12, 1);
        ctx.moveTo(10, 20);
        ctx.lineTo(10, 9);
        ctx.lineTo(15, 0);
        ctx.lineTo(19, 2);
        ctx.lineTo(17, 9);
        ctx.lineTo(25, 9);
        ctx.lineTo(23, 20);
        ctx.closePath();
        ctx.stroke();
        ctx.restore();
      };
      thumb(tx, false);
      ctx.fillStyle = c.muted;
      ctx.font = font(400, 21);
      ctx.fillText(spec.likes || '', tx + 34, by + 4);
      thumb(tx + 100, true);
      ctx.fillText('Reply', tx + 150, by + 4);
    },
  };
}

// ── Instagram ───────────────────────────────────────────────────────────────
function instagram(measure: CanvasRenderingContext2D, spec: CommentSpec): Layout {
  const c = palette('instagram', spec.dark);
  const PAD = 24, AV = 64, GAP = 18, W = 900;
  const textW = W - PAD * 2 - AV - GAP - 40;

  // Username sits inline before the text, so the first line starts indented.
  measure.font = font(600, 26);
  const nameW = measure.measureText(spec.username || 'username').width + 12;
  measure.font = font(400, 26);

  const words = (spec.text || 'your comment here').split(' ');
  const lines: string[] = [];
  let line = '', limit = textW - nameW;
  for (const w of words) {
    const next = line ? `${line} ${w}` : w;
    if (measure.measureText(next).width > limit && line) {
      lines.push(line);
      line = w;
      limit = textW;
    } else line = next;
  }
  lines.push(line);
  const height = PAD * 2 + Math.max(AV, lines.length * 34 + 30);

  return {
    width: W, height,
    draw: ctx => {
      if (!spec.transparent) { ctx.fillStyle = c.bg; ctx.fillRect(0, 0, W, height); }
      drawAvatar(ctx, spec, PAD, PAD, AV);

      const tx = PAD + AV + GAP;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';
      ctx.fillStyle = c.text;
      ctx.font = font(600, 26);
      ctx.fillText(spec.username || 'username', tx, PAD);
      if (spec.verified) drawVerified(ctx, tx + nameW - 8, PAD + 1, 20, '#3897F0');

      ctx.font = font(400, 26);
      lines.forEach((l, i) => ctx.fillText(l, i === 0 ? tx + nameW : tx, PAD + i * 34));

      const by = PAD + lines.length * 34 + 6;
      ctx.fillStyle = c.muted;
      ctx.font = font(400, 21);
      ctx.fillText(spec.time || '2h', tx, by);
      if (spec.likes) ctx.fillText(`${spec.likes} likes`, tx + 60, by);
      ctx.fillText('Reply', tx + 170, by);
    },
  };
}

const RENDERERS: Record<Platform, (m: CanvasRenderingContext2D, s: CommentSpec) => Layout> = {
  tiktok, twitch, youtube, instagram,
};

/**
 * Draws `spec` onto `canvas` at `scale` device pixels per logical pixel.
 * Exports run at 3x so the result stays sharp when scaled up over footage.
 */
export function renderComment(canvas: HTMLCanvasElement, spec: CommentSpec, scale = 3) {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  // Measuring needs a context with the same font metrics, and this one is free.
  const layout = RENDERERS[spec.platform](ctx, spec);

  canvas.width = Math.round(layout.width * scale);
  canvas.height = Math.round(layout.height * scale);
  // Width only, height auto: an inline height survives max-width:100% and
  // squashes the drawing out of aspect (round avatars came out as ovals).
  canvas.style.width = `${layout.width}px`;
  canvas.style.height = 'auto';

  ctx.setTransform(scale, 0, 0, scale, 0, 0);
  ctx.clearRect(0, 0, layout.width, layout.height);
  layout.draw(ctx);
}

export function downloadCanvas(canvas: HTMLCanvasElement, filename: string) {
  canvas.toBlob(blob => {
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }, 'image/png');
}
