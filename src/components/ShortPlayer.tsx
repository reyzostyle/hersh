import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';

// The Short itself, beside its retention curve (2026-10-28). A drop is a
// second, and the only way to know why people left there is to watch that
// second: pressing a point on the curve plays the video from it, and while it
// plays the curve follows. YouTube's IFrame API, loaded on first use, from the
// no-cookie host.

// The part of the IFrame API this uses.
interface YTPlayer {
  seekTo(seconds: number, allowSeekAhead: boolean): void;
  playVideo(): void;
  getCurrentTime(): number;
  destroy(): void;
}
interface YTApi {
  Player: new (el: HTMLElement, opts: Record<string, unknown>) => YTPlayer;
  PlayerState: { ENDED: number; PLAYING: number; PAUSED: number; BUFFERING: number };
}

declare global {
  interface Window {
    YT?: YTApi;
    onYouTubeIframeAPIReady?: () => void;
  }
}

let api: Promise<YTApi> | null = null;
function loadApi(): Promise<YTApi> {
  if (window.YT?.Player) return Promise.resolve(window.YT);
  if (!api) {
    api = new Promise((resolve, reject) => {
      const prev = window.onYouTubeIframeAPIReady;
      window.onYouTubeIframeAPIReady = () => { prev?.(); if (window.YT) resolve(window.YT); };
      const s = document.createElement('script');
      s.src = 'https://www.youtube.com/iframe_api';
      s.async = true;
      s.onerror = () => { api = null; reject(new Error('The YouTube player did not load')); };
      document.head.appendChild(s);
    });
  }
  return api;
}

export interface ShortPlayerHandle {
  // Plays from second `t`. Before the player is ready the second waits.
  seek: (t: number) => void;
}

export const ShortPlayer = forwardRef<ShortPlayerHandle, {
  videoId: string;
  // The second on screen while it plays; held where it stopped when paused.
  onTime: (t: number) => void;
}>(function ShortPlayer({ videoId, onTime }, ref) {
  const host = useRef<HTMLDivElement>(null);
  const player = useRef<YTPlayer | null>(null);
  const ready = useRef(false);
  const waiting = useRef<number | null>(null);
  const onTimeRef = useRef(onTime);
  onTimeRef.current = onTime;
  const [failed, setFailed] = useState(false);

  const playFrom = (t: number) => {
    if (!player.current) return;
    player.current.seekTo(Math.max(0, t), true);
    player.current.playVideo();
    onTimeRef.current(t);
  };

  useImperativeHandle(ref, () => ({
    seek: (t: number) => {
      if (ready.current) playFrom(t);
      else waiting.current = t;
    },
  }), []);

  useEffect(() => {
    let alive = true;
    let tick: number | undefined;
    setFailed(false);
    const box = host.current;
    const mount = document.createElement('div');
    box?.appendChild(mount);

    loadApi().then(YT => {
      if (!alive) return;
      const now = () => {
        const t = player.current?.getCurrentTime();
        if (typeof t === 'number' && isFinite(t)) onTimeRef.current(t);
      };
      player.current = new YT.Player(mount, {
        videoId,
        host: 'https://www.youtube-nocookie.com',
        width: '100%',
        height: '100%',
        playerVars: { playsinline: 1, rel: 0, modestbranding: 1 },
        events: {
          onReady: () => {
            ready.current = true;
            if (waiting.current != null) { playFrom(waiting.current); waiting.current = null; }
          },
          onStateChange: (e: { data: number }) => {
            const { PLAYING, PAUSED, ENDED, BUFFERING } = YT.PlayerState;
            window.clearInterval(tick);
            if (e.data === PLAYING) tick = window.setInterval(now, 100);
            // Not on load (unstarted, cued): an untouched player is at 0:00,
            // and that is not a second anyone chose to look at.
            else if (e.data === PAUSED || e.data === ENDED || e.data === BUFFERING) now();
          },
          // 101 and 150: the owner turned embedding off.
          onError: () => { if (alive) setFailed(true); },
        },
      });
    }).catch(() => { if (alive) setFailed(true); });

    return () => {
      alive = false;
      window.clearInterval(tick);
      ready.current = false;
      try { player.current?.destroy(); } catch { /* already gone */ }
      player.current = null;
      if (box) box.innerHTML = '';
    };
  }, [videoId]);

  return (
    <div className="relative w-full overflow-hidden" style={{ aspectRatio: '9 / 16', borderRadius: 'var(--r-md)', background: '#000' }}>
      <div ref={host} className="absolute inset-0 [&>iframe]:w-full [&>iframe]:h-full" />
      {failed && (
        <a
          href={`https://www.youtube.com/shorts/${videoId}`}
          target="_blank"
          rel="noreferrer"
          className="absolute inset-0 flex items-center justify-center text-center px-4 text-[13px]"
          style={{ color: 'var(--text-muted)', background: '#000' }}
        >
          Watch it on YouTube
        </a>
      )}
    </div>
  );
});
