import { useEffect, useRef, useState } from 'react';
import { RefreshOutlineIcon as Loader2, ArrowRightUpOutlineIcon as ArrowUpRight, PlayOutlineIcon as Play } from '@solar-icons/react';
import { supabase, FUNCTIONS_URL, getSessionToken } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { Page, PageHead, BackLink, Panel, Button, Section, Loading, Skeleton } from './Page';
import { ShortThumb } from './ShortThumb';
import { ShortPlayer, type ShortPlayerHandle } from './ShortPlayer';
import { RetentionChart, RetentionSpark } from './RetentionChart';
import { LessonList, type Lessons } from './RetentionLessons';
import { resetAnalysisSession } from './AnalysisChat';
import { OPEN_RETENTION_KEY, PENDING_CHAT_KEY, peek } from '../lib/intents';
import { formatViews } from '../lib/competitors';
import {
  LIST_COLUMNS, beatAt, beatsIn, clock, dropAt, labelOf, mmss, pctAt, replayShare, usualOf,
  type Beat, type Drop, type RetentionListRow, type RetentionRow,
} from '../lib/retention';

// Every Short on the creator's channel with its real retention, and one screen
// per Short: the curve YouTube measured, the stretches where people left, and
// what was being said and shown at each second, beside the video itself
// (2026-10-28). The same rows feed every prompt (sync-retention), so what is
// on this screen is exactly what the chat and the reviews are told.

const LOSS = 'rgb(var(--danger-rgb))';

const day = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : null;

const pct = (n: number | null | undefined) => (n == null ? '-' : `${Math.round(Number(n))}%`);

const metaLine = (r: { published_at: string | null; duration_s: number | null; views: number | null }) =>
  [day(r.published_at), r.duration_s ? mmss(r.duration_s) : null, r.views != null ? `${formatViews(r.views)} views` : null]
    .filter(Boolean).join(' · ');

interface Account {
  connected: boolean;
  problem: string | null;
  syncedAt: string | null;
  lessons: Lessons | null;
}

async function readRetention(body: Record<string, unknown>): Promise<{ row?: RetentionRow | null; error?: string }> {
  const token = await getSessionToken();
  const res = await fetch(`${FUNCTIONS_URL}/sync-retention`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(String(res.status));
  return res.json();
}

// Settings opens on the card a button here is about.
function goToSettings(card: 'youtube') {
  try { localStorage.setItem('chumoku_open_settings', card); } catch { /* opens closed */ }
  window.dispatchEvent(new CustomEvent('chumoku:navigate', { detail: 'settings' }));
}

export function RetentionPage() {
  const { user } = useAuth();
  const [account, setAccount] = useState<Account | null>(null);
  const [rows, setRows] = useState<RetentionListRow[] | null>(null);
  // A Short asked for from elsewhere (a review in the chat). Read here, removed
  // after mount: an initializer must be pure.
  const [open, setOpen] = useState<string | null>(() => peek(OPEN_RETENTION_KEY));
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState('');
  const autoSynced = useRef(false);

  useEffect(() => {
    try { localStorage.removeItem(OPEN_RETENTION_KEY); } catch { /* ignore */ }
  }, []);

  // Pressing Retention in the sidebar while a Short is open goes back to the
  // list; a review's link while already here opens its Short.
  useEffect(() => {
    const onNav = (e: Event) => {
      if ((e as CustomEvent).detail !== 'retention') return;
      const asked = peek(OPEN_RETENTION_KEY);
      try { localStorage.removeItem(OPEN_RETENTION_KEY); } catch { /* ignore */ }
      setOpen(asked);
    };
    window.addEventListener('chumoku:navigate', onNav);
    return () => window.removeEventListener('chumoku:navigate', onNav);
  }, []);

  useEffect(() => {
    document.querySelector('main')?.scrollTo({ top: 0 });
  }, [open]);

  const load = async () => {
    if (!user) return;
    const [{ data: tok }, { data: list }] = await Promise.all([
      supabase.from('user_tokens')
        .select('access_token, retention_error, retention_synced_at, retention_lessons')
        .eq('user_id', user.id).maybeSingle(),
      supabase.from('video_retention').select(LIST_COLUMNS)
        .eq('user_id', user.id)
        .order('published_at', { ascending: false, nullsFirst: false })
        .limit(60),
    ]);
    setAccount({
      connected: !!tok?.access_token,
      problem: tok?.retention_error ?? null,
      syncedAt: tok?.retention_synced_at ?? null,
      lessons: (tok?.retention_lessons as Lessons | null) ?? null,
    });
    setRows((list as unknown as RetentionListRow[] | null) ?? []);
  };

  useEffect(() => { load().catch(() => { setAccount(a => a ?? { connected: false, problem: null, syncedAt: null, lessons: null }); setRows(r => r ?? []); }); }, [user?.id]);

  const refresh = async () => {
    setSyncing(true);
    setError('');
    try {
      await readRetention({});
      await load();
    } catch {
      setError('Could not read your Shorts. Try again.');
    } finally {
      setSyncing(false);
    }
  };

  // The first visit after connecting: nothing has been read yet, so read now
  // rather than waiting for the hourly run.
  useEffect(() => {
    if (autoSynced.current || !account?.connected || account.syncedAt || account.problem || rows?.length) return;
    autoSynced.current = true;
    refresh();
  }, [account, rows]);

  if (!account || !rows) return <Page><Loading rows={5} /></Page>;

  if (open && user) {
    return (
      <Page>
        <VideoView id={open} userId={user.id} list={rows} onBack={() => setOpen(null)} />
      </Page>
    );
  }

  const blocked = !account.connected || account.problem === 'no_scope' || account.problem === 'not_connected';

  return (
    <Page>
      <PageHead
        title="Retention"
        action={!blocked && (
          <Button variant="ghost" size="sm" onClick={refresh} disabled={syncing}>
            {syncing && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
            {syncing ? 'Reading your Shorts' : 'Refresh'}
          </Button>
        )}
      />

      {blocked ? (
        <Panel className="text-center py-10 flex flex-col items-center gap-4">
          <p className="text-[15px] max-w-sm text-balance" style={{ color: 'var(--text-muted)' }}>
            {!account.connected
              ? <>Connect your YouTube channel and every Short you post shows up here, with the second people left and what you were saying&nbsp;then.</>
              : account.problem === 'no_scope'
                ? <>YouTube did not let Chumoku read your retention. Reconnect and leave the analytics box&nbsp;ticked.</>
                : <>YouTube stopped letting Chumoku in. Reconnect to keep your numbers&nbsp;coming.</>}
          </p>
          <Button variant="primary" onClick={() => goToSettings('youtube')}>
            {account.connected ? 'Reconnect YouTube' : 'Connect YouTube'}
          </Button>
        </Panel>
      ) : (
        <>
          {account.lessons?.lessons?.length ? (
            <Panel className="space-y-3">
              <LessonList lessons={account.lessons} summary={false} />
            </Panel>
          ) : null}

          {error && <p className="text-red-400 text-sm mt-4">{error}</p>}

          <Section label="Your Shorts" className={account.lessons?.lessons?.length ? '' : '!mt-0'}>
            {rows.length ? (
              <>
                <div className="row-list">
                  {rows.map(r => <ShortRow key={r.video_id} row={r} onOpen={() => setOpen(r.video_id)} />)}
                </div>
                <p className="text-xs mt-4 max-w-xl" style={{ color: 'var(--text-faint)' }}>
                  Stayed is the share of the Shorts feed that did not swipe away. Studio can show it a few points&nbsp;lower.
                </p>
              </>
            ) : syncing ? (
              <div className="row-list">
                {Array.from({ length: 4 }, (_, i) => <Skeleton key={i} className="h-[92px] w-full" style={{ borderRadius: 'var(--r-md)' }} />)}
              </div>
            ) : (
              <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
                {account.syncedAt ? 'No Shorts on your channel yet.' : 'Not read yet.'}
              </p>
            )}
          </Section>
        </>
      )}
    </Page>
  );
}

function ShortRow({ row, onOpen }: { row: RetentionListRow; onOpen: () => void }) {
  const d = row.duration_s ?? 0;
  return (
    <button onClick={onOpen} className="row">
      <span className="ret-thumb w-9 flex-shrink-0"><ShortThumb videoId={row.video_id} /></span>
      <span className="flex-1 min-w-0">
        <span className="block text-[15px] leading-snug font-medium line-clamp-2" style={{ color: 'var(--text)' }}>{labelOf(row)}</span>
        <span className="block text-[13px] mt-0.5" style={{ color: 'var(--text-muted)' }}>{metaLine(row)}</span>
      </span>
      {row.curve && row.curve.length > 1 && d > 0 && (
        <span className="hidden sm:block">
          <RetentionSpark curve={row.curve} duration={d} drops={row.drops} />
        </span>
      )}
      <span className="flex-shrink-0 w-14 text-right">
        <span className="block text-[15px] font-medium tabular-nums" style={{ color: 'var(--text)' }}>{pct(row.stayed_pct)}</span>
        <span className="block text-[11px]" style={{ color: 'var(--text-faint)' }}>stayed</span>
      </span>
      <ArrowUpRight className="w-4 h-4 row-arrow" />
    </button>
  );
}

function VideoView({ id, userId, list, onBack }: {
  id: string;
  userId: string;
  list: RetentionListRow[];
  onBack: () => void;
}) {
  // undefined while loading, null when there is nothing for this Short.
  const [row, setRow] = useState<RetentionRow | null | undefined>(undefined);
  // Where the video is, and the second under the pointer.
  const [playing, setPlaying] = useState<number | null>(null);
  const [hover, setHover] = useState<number | null>(null);
  const [reading, setReading] = useState(false);
  const [readError, setReadError] = useState('');
  const player = useRef<ShortPlayerHandle>(null);
  const playerBox = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let alive = true;
    setRow(undefined);
    setPlaying(null);
    (async () => {
      const { data } = await supabase.from('video_retention').select('*')
        .eq('user_id', userId).eq('video_id', id).maybeSingle();
      if (!alive) return;
      if (data) { setRow(data as RetentionRow); return; }
      // Not stored yet (a review opened it the day it was posted): read it now.
      try {
        const r = await readRetention({ videoId: id });
        if (alive) setRow(r.row ?? null);
      } catch {
        if (alive) setRow(null);
      }
    })();
    return () => { alive = false; };
  }, [id, userId]);

  if (row === undefined) return <Loading rows={3} />;
  if (row === null) {
    return (
      <>
        <BackLink label="Retention" onClick={onBack} />
        <p className="text-sm" style={{ color: 'var(--text-muted)' }}>YouTube has no numbers for this Short yet.</p>
      </>
    );
  }

  const d = row.duration_s ?? 0;
  const curve = row.curve ?? [];
  const drops = row.drops ?? [];
  const hasCurve = curve.length > 1 && d > 0;
  const beats = row.beats?.length ? row.beats : null;
  const usual = usualOf(list, id);
  const replays = hasCurve ? replayShare(curve) : 0;
  const label = labelOf(row);

  // The second being looked at: under the pointer, else where the video is,
  // else the start of the biggest drop, which is the one worth seeing first.
  const at = hasCurve ? (hover ?? playing ?? drops[0]?.from_s ?? 0) : null;
  const beat = at != null ? beatAt(beats, at) : null;
  const inDrop = at != null ? dropAt(drops, at) : null;

  // `reveal` brings the video back on screen when it was pressed from further
  // down the page (a drop, a line): playing something nobody can see is the
  // same as not playing it. The curve sits beside the video, so it never needs to.
  const seek = (t: number, reveal = false) => {
    player.current?.seek(t);
    setPlaying(t);
    if (reveal) playerBox.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  };

  // The chat, opened on this Short with a first line waiting in the composer.
  // The video rides along with every message, so the answer is written against
  // this curve rather than whatever a title search turns up.
  const askChat = (text: string) => {
    try { localStorage.setItem(PENDING_CHAT_KEY, JSON.stringify({ text, videoId: id, draft: true })); } catch { /* ignore */ }
    resetAnalysisSession();
    window.dispatchEvent(new CustomEvent('chumoku:navigate', { detail: 'analyze' }));
  };

  const readBeats = async () => {
    setReading(true);
    setReadError('');
    try {
      const r = await readRetention({ videoId: id });
      if (r.row?.beats?.length) setRow(r.row);
      else setReadError('Could not read it. Try again.');
    } catch {
      setReadError('Could not read it. Try again.');
    } finally {
      setReading(false);
    }
  };

  const stats: { label: string; value: string; sub: string }[] = [
    {
      label: 'Stayed to watch',
      value: pct(row.stayed_pct),
      sub: usual?.stayed != null ? `Usually ${Math.round(usual.stayed)}%` : row.stayed_pct != null ? `${Math.round(100 - row.stayed_pct)}% swiped away` : '',
    },
    {
      label: 'Average view',
      value: row.avg_view_s != null ? mmss(row.avg_view_s) : '-',
      sub: row.avg_view_pct != null ? `${Math.round(row.avg_view_pct)}% of it${usual?.avgView != null ? `, usually ${Math.round(usual.avgView)}%` : ''}` : '',
    },
    {
      label: 'Watched to the end',
      value: hasCurve ? pct(pctAt(curve, d * 0.97, d)) : '-',
      sub: replays >= 5 ? `${replays}% looped it` : '',
    },
    {
      label: 'Views',
      value: row.views != null ? formatViews(row.views) : '-',
      sub: row.subs_gained ? `+${row.subs_gained} subscribers` : row.likes ? `${row.likes} likes` : '',
    },
  ];

  return (
    <>
      <BackLink label="Retention" onClick={onBack} />

      <header className="mb-8">
        <h1 className="t-title text-balance" style={{ color: 'var(--text)' }}>{label}</h1>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-3 mt-3">
          <p className="text-[13px] flex-1 min-w-0" style={{ color: 'var(--text-muted)' }}>{metaLine(row)}</p>
          <Button variant="secondary" size="sm" onClick={() => askChat(`How do I improve the script of "${label}"?`)}>
            Improve the script
          </Button>
        </div>
      </header>

      <div className="grid gap-3 sm:gap-4 grid-cols-[minmax(0,1fr)_minmax(0,1fr)] sm:grid-cols-[200px_minmax(0,1fr)] lg:grid-cols-[240px_minmax(0,1fr)] lg:grid-rows-[auto_minmax(0,1fr)]">
        <div ref={playerBox} className="lg:row-span-2" style={{ scrollMarginTop: 16 }}>
          <ShortPlayer ref={player} videoId={id} onTime={setPlaying} />
        </div>

        <Panel padded={false} className="self-start">
          <dl className="ret-stats">
            {stats.map(s => (
              <div key={s.label} className="px-3.5 py-2 sm:px-4 sm:py-3.5 min-w-0">
                <dt className="label-mono">{s.label}</dt>
                <dd className="text-[19px] sm:text-[24px] leading-tight font-medium tracking-tight tabular-nums mt-0.5" style={{ color: 'var(--text)' }}>{s.value}</dd>
                <dd className="text-[11px] sm:text-[12px] leading-snug mt-0.5 min-h-[1em]" style={{ color: 'var(--text-faint)' }}>{s.sub}</dd>
              </div>
            ))}
          </dl>
        </Panel>

        <div className="col-span-2 lg:col-span-1 min-w-0">
          <Panel className="!p-4">
            {hasCurve ? (
              <>
                <RetentionChart
                  curve={curve}
                  duration={d}
                  drops={drops}
                  at={at}
                  onScrub={setHover}
                  onPick={seek}
                />
                <div className="mt-3 pt-3 min-h-[92px]" style={{ borderTop: '1px solid var(--line)' }} aria-live="polite">
                  <div className="flex items-baseline gap-3">
                    <span className="font-mono text-[13px] tabular-nums" style={{ color: 'var(--text)' }}>{clock(at ?? 0)}</span>
                    <span className="text-[13px] tabular-nums" style={{ color: 'var(--text-muted)' }}>{Math.round(pctAt(curve, at ?? 0, d))}% still watching</span>
                    {inDrop && (
                      <span className="ml-auto text-[12px] font-medium tabular-nums flex-shrink-0" style={{ color: LOSS }}>
                        {`Leaving here, −${inDrop.lost}`}
                      </span>
                    )}
                  </div>
                  {beat ? (
                    <>
                      <p className="text-[15px] leading-relaxed mt-1.5" style={{ color: beat.says ? 'var(--text)' : 'var(--text-faint)' }}>
                        {beat.says ? `“${beat.says}”` : 'No words here.'}
                      </p>
                      {beat.shows && (
                        <p className="text-[13px] leading-relaxed mt-1" style={{ color: 'var(--text-faint)' }}>On screen: {beat.shows}</p>
                      )}
                    </>
                  ) : (
                    <div className="flex flex-wrap items-center gap-3 mt-2">
                      <p className="text-[13px]" style={{ color: 'var(--text-muted)' }}>What is said here is not read yet.</p>
                      <Button variant="ghost" size="sm" onClick={readBeats} disabled={reading}>
                        {reading && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                        {reading ? 'Watching your Short' : 'Read it'}
                      </Button>
                      {readError && <p className="text-red-400 text-[13px] w-full">{readError}</p>}
                    </div>
                  )}
                </div>
              </>
            ) : (
              <p className="text-[13px] py-6 text-center text-balance" style={{ color: 'var(--text-muted)' }}>
                YouTube has not drawn a curve for this Short yet. It needs more&nbsp;views.
              </p>
            )}
          </Panel>
          {hasCurve && replays >= 5 && (
            <p className="text-xs mt-2.5 leading-relaxed" style={{ color: 'var(--text-faint)' }}>
              100% is everyone who got past the swipe. It starts above that because people who reach the end loop back to the&nbsp;start.
            </p>
          )}
        </div>
      </div>

      {hasCurve && (
        <Section label="Where they left">
          {drops.length ? (
            <div className="flex flex-col gap-2.5">
              {drops.map((x, i) => (
                <DropCard
                  key={x.from_s}
                  drop={x}
                  lines={beatsIn(beats, x)}
                  first={i === 0}
                  duration={d}
                  replays={replays}
                  onPlay={() => seek(x.from_s, true)}
                  onFix={() => askChat(`How do I fix the drop at ${mmss(x.from_s)} to ${mmss(x.to_s)} in "${label}"?`)}
                />
              ))}
            </div>
          ) : (
            <p className="text-sm" style={{ color: 'var(--text-muted)' }}>No stretch loses people faster than the rest. The line falls&nbsp;evenly.</p>
          )}
        </Section>
      )}

      {beats && (
        <Section label="Everything said">
          <div className="flex flex-col gap-0.5">
            {beats.map((b, i) => {
              const end = beats[i + 1]?.t ?? d;
              const active = at != null && at >= b.t && at < end;
              const lost = drops.some(x => b.t < x.to_s && end > x.from_s);
              return (
                <button
                  key={`${b.t}-${i}`}
                  type="button"
                  onClick={() => seek(b.t, true)}
                  className="text-left grid grid-cols-[40px_minmax(0,1fr)] gap-3 px-3 py-2.5 rounded-[var(--r-sm)] transition-colors hover:bg-[var(--bg-raised)]"
                  style={{
                    background: active ? 'var(--bg-raised-hover)' : undefined,
                    boxShadow: lost ? `inset 2px 0 0 ${LOSS}` : undefined,
                  }}
                >
                  <span className="font-mono text-[12px] leading-[22px] tabular-nums" style={{ color: lost ? LOSS : 'var(--text-faint)' }}>{clock(b.t)}</span>
                  <span className="min-w-0">
                    <span className="block text-[14px] leading-[22px]" style={{ color: b.says ? 'var(--text)' : 'var(--text-faint)' }}>{b.says || 'No words'}</span>
                    {b.shows && <span className="block text-[12px] leading-relaxed mt-0.5" style={{ color: 'var(--text-faint)' }}>{b.shows}</span>}
                  </span>
                </button>
              );
            })}
          </div>
        </Section>
      )}
    </>
  );
}

function DropCard({ drop, lines, first, duration, replays, onPlay, onFix }: {
  drop: Drop;
  // What was said through it, line by line; empty until the Short is read.
  lines: Beat[];
  first: boolean;
  duration: number;
  replays: number;
  onPlay: () => void;
  onFix: () => void;
}) {
  // Worded the way the prompts word it (retentionBlock), so the screen and
  // the chat say the same thing about the same drop.
  const atEnd = drop.to_s >= duration - 1;
  const early = replays >= 8 && drop.from_s < duration / 2 && !atEnd;
  const firstTimers = early ? Math.max(0, drop.lost - replays) : null;
  const fastest = drop.steepest_s != null && drop.to_s - drop.from_s > 2 ? `, fastest at ${mmss(drop.steepest_s)}` : '';
  const why = atEnd
    ? ' In the last seconds: people swiping before it loops.'
    : firstTimers != null
      ? ` Part of it is replays ending: at least ${firstTimers} of the ${drop.lost} points are first-time viewers.`
      : '';

  return (
    <Panel>
      <div className="flex items-baseline gap-3">
        <p className="text-[15px] font-medium tabular-nums" style={{ color: 'var(--text)' }}>
          {mmss(drop.from_s)} to {mmss(drop.to_s)}
        </p>
        <p className="ml-auto text-[15px] font-medium tabular-nums" style={{ color: LOSS }}>{`−${drop.lost}`}</p>
      </div>
      <p className="text-[13px] leading-relaxed mt-1" style={{ color: 'var(--text-muted)' }}>
        {drop.from_pct}% to {drop.to_pct}%{fastest}.{why}
      </p>
      {lines.length ? (
        <ul className="mt-3 space-y-2.5">
          {lines.map((b, i) => (
            <li key={`${b.t}-${i}`} className="grid grid-cols-[40px_minmax(0,1fr)] gap-3">
              <span className="font-mono text-[12px] leading-[22px] tabular-nums" style={{ color: 'var(--text-faint)' }}>{clock(b.t)}</span>
              <span className="min-w-0">
                <span className="block text-[15px] leading-[22px]" style={{ color: b.says ? 'var(--text)' : 'var(--text-faint)' }}>
                  {b.says ? `“${b.says}”` : 'No words'}
                </span>
                {b.shows && <span className="block text-[12px] leading-relaxed mt-0.5" style={{ color: 'var(--text-faint)' }}>{b.shows}</span>}
              </span>
            </li>
          ))}
        </ul>
      ) : drop.says ? (
        <p className="text-[15px] leading-relaxed mt-3" style={{ color: 'var(--text)' }}>{`“${drop.says}”`}</p>
      ) : null}
      <div className="flex flex-wrap gap-2 mt-4">
        <Button variant={first ? 'primary' : 'secondary'} size="sm" onClick={onPlay}>
          <Play className="w-3.5 h-3.5" /> Play from {mmss(drop.from_s)}
        </Button>
        <Button variant="ghost" size="sm" onClick={onFix}>Fix this drop</Button>
      </div>
    </Panel>
  );
}
