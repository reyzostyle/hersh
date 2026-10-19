import type { Clip, EditSettings, CapWord } from './types';
import { OUT_W } from './types';
import type { Timeline } from './timeline';
import { segmentAt, srcTime } from './timeline';
import { drawFrame, type CapGroup } from './compose';

// The preview. Each clip gets two <video> elements: one plays the current
// piece while the other is already parked on the start of the next, so a jump
// cut swaps elements instead of waiting on a seek. Frames go through the same
// drawFrame as the export.
export class EditPlayer {
  private ctx: CanvasRenderingContext2D;
  private pools: HTMLVideoElement[][] = [];
  private active: HTMLVideoElement | null = null;
  private seg = -1;
  private raf = 0;
  private parked = new Map<HTMLVideoElement, number>(); // element -> segment it is parked on
  // A replaced player can still have a 'seeked' listener in flight; it must
  // not paint its stale cut over the new one.
  private dead = false;
  playing = false;
  t = 0;
  onTime: (t: number) => void = () => {};
  onEnded: () => void = () => {};

  constructor(
    canvas: HTMLCanvasElement,
    clips: Clip[],
    private tl: Timeline,
    private settings: EditSettings,
    private caps: CapWord[],
    private groups: CapGroup[],
  ) {
    this.ctx = canvas.getContext('2d')!;
    const s = canvas.width / OUT_W;
    this.ctx.setTransform(s, 0, 0, s, 0, 0);
    this.pools = clips.map(c => [0, 1].map(() => {
      const v = document.createElement('video');
      v.src = c.url;
      v.muted = true;
      v.playsInline = true;
      v.preload = 'auto';
      v.crossOrigin = 'anonymous';
      return v;
    }));
  }

  update(tl: Timeline, settings: EditSettings, caps: CapWord[], groups: CapGroup[]) {
    const wasPlaying = this.playing;
    this.pause();
    this.tl = tl; this.settings = settings; this.caps = caps; this.groups = groups;
    this.parked.clear();
    this.seek(Math.min(this.t, Math.max(0, tl.duration - 0.01)));
    if (wasPlaying) this.play();
  }

  destroy() {
    this.dead = true;
    this.pause();
    this.pools.flat().forEach(v => { v.removeAttribute('src'); v.load(); });
  }

  private pick(segIdx: number, avoid: HTMLVideoElement | null): HTMLVideoElement {
    const pool = this.pools[this.tl.segments[segIdx].clip];
    for (const v of pool) if (this.parked.get(v) === segIdx) return v;
    return pool.find(v => v !== avoid) ?? pool[0];
  }

  private park(segIdx: number) {
    if (segIdx >= this.tl.segments.length) return;
    const v = this.pick(segIdx, this.active);
    if (v === this.active) return;
    this.parked.set(v, segIdx);
    v.currentTime = this.tl.segments[segIdx].src0;
  }

  private enter(segIdx: number, at: number) {
    const seg = this.tl.segments[segIdx];
    const v = this.pick(segIdx, this.active);
    const want = srcTime(seg, at, this.settings.speed);
    if (this.parked.get(v) !== segIdx || Math.abs(v.currentTime - want) > 0.05) v.currentTime = want;
    this.parked.delete(v);
    if (this.active && this.active !== v) { this.active.pause(); this.active.muted = true; }
    this.active = v;
    this.seg = segIdx;
    v.playbackRate = this.settings.speed;
    (v as HTMLVideoElement & { preservesPitch?: boolean }).preservesPitch = true;
    this.park(segIdx + 1);
  }

  play() {
    if (!this.tl.segments.length) return;
    if (this.t >= this.tl.duration - 0.02) this.t = 0;
    this.playing = true;
    this.enter(segmentAt(this.tl.segments, this.t), this.t);
    const v = this.active!;
    v.muted = false;
    v.play().catch(() => {});
    const tick = () => {
      if (!this.playing) return;
      const seg = this.tl.segments[this.seg];
      const cur = this.active!;
      if (cur.currentTime >= seg.src1 - 0.01 || cur.ended) {
        if (this.seg + 1 >= this.tl.segments.length) {
          this.t = this.tl.duration;
          this.pause();
          this.render();
          this.onEnded();
          return;
        }
        this.enter(this.seg + 1, this.tl.segments[this.seg + 1].out0);
        this.active!.muted = false;
        this.active!.play().catch(() => {});
      }
      const s = this.tl.segments[this.seg];
      this.t = Math.min(s.out1, s.out0 + Math.max(0, this.active!.currentTime - s.src0) / this.settings.speed);
      this.render();
      this.onTime(this.t);
      this.raf = requestAnimationFrame(tick);
    };
    this.raf = requestAnimationFrame(tick);
  }

  pause() {
    this.playing = false;
    cancelAnimationFrame(this.raf);
    if (this.active) { this.active.pause(); this.active.muted = true; }
  }

  seek(t: number) {
    this.t = Math.max(0, Math.min(t, this.tl.duration));
    if (!this.tl.segments.length) { this.render(); return; }
    const idx = segmentAt(this.tl.segments, this.t);
    if (this.playing) { this.pause(); this.t = t; this.play(); return; }
    this.enter(idx, this.t);
    const v = this.active!;
    const draw = () => this.render();
    if (v.readyState >= 2 && !v.seeking) draw();
    v.addEventListener('seeked', draw, { once: true });
    v.addEventListener('loadeddata', draw, { once: true });
    this.onTime(this.t);
  }

  render() {
    if (this.dead) return;
    const seg = this.seg >= 0 ? this.tl.segments[this.seg] : null;
    const v = this.active;
    const src = v && v.readyState >= 2 ? { image: v, width: v.videoWidth, height: v.videoHeight } : null;
    drawFrame(this.ctx, src, seg, this.t, this.settings, this.caps, this.groups);
  }
}
