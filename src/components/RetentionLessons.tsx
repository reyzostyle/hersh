import { useEffect, useState } from 'react';
import { RefreshOutlineIcon as Loader2 } from '@solar-icons/react';
import { FUNCTIONS_URL, supabase, getSessionToken } from '../lib/supabase';
import { openRetention } from '../lib/retention';
import { Button, Collapse } from './Page';

// What the creator's real retention curves add up to, under the brain in
// Settings (2026-10-28). sync-retention reads every Short's curve from YouTube
// Analytics and writes these; every idea, outline, script, review and chat
// answer is now written against them, so they are shown where they can be
// checked. Each rule opens to the videos and numbers behind it.

export interface Lessons {
  summary: string;
  lessons: { rule: string; evidence: string }[];
  stayed_median: number | null;
  avg_view_median: number | null;
  videos: number;
  made_at: string;
}

// The rules themselves. Settings and the retention screen show the same list;
// the screen leaves out the summary, which says the rules over again in one
// paragraph and pushed its list of Shorts off a phone's first screen.
export function LessonList({ lessons, summary = true }: { lessons: Lessons; summary?: boolean }) {
  const [open, setOpen] = useState<number | null>(null);
  const usual = lessons.stayed_median != null
    ? ` Usually ${Math.round(lessons.stayed_median)}% stay past the first seconds.`
    : '';
  const when = (iso: string) => new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

  return (
    <>
      {summary && <p className="text-sm leading-relaxed" style={{ color: 'var(--text)' }}>{lessons.summary}</p>}
      <ul className="space-y-2">
        {lessons.lessons.map((l, i) => (
          <li key={i}>
            <button
              type="button"
              onClick={() => setOpen(o => (o === i ? null : i))}
              className="text-left text-sm leading-relaxed flex gap-2 transition-colors hover:text-[var(--text)]"
              style={{ color: 'var(--text-muted)' }}
              aria-expanded={open === i}
            >
              <span style={{ color: 'var(--text-faint)' }}>-</span>
              <span>{l.rule}</span>
            </button>
            <Collapse open={open === i} className="!mt-0">
              <p className="text-xs leading-relaxed pl-4 pt-1.5" style={{ color: 'var(--text-faint)' }}>{l.evidence}</p>
            </Collapse>
          </li>
        ))}
      </ul>
      <p className="text-xs" style={{ color: 'var(--text-faint)' }}>
        From {lessons.videos} of your Shorts.{usual} Updated {when(lessons.made_at)}.
      </p>
    </>
  );
}

export function RetentionLessons({ userId, onReconnect }: { userId: string; onReconnect: () => void }) {
  const [lessons, setLessons] = useState<Lessons | null>(null);
  const [syncedAt, setSyncedAt] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const load = async () => {
    const { data } = await supabase
      .from('user_tokens')
      .select('retention_lessons, retention_synced_at, retention_error')
      .eq('user_id', userId)
      .maybeSingle();
    setLessons((data?.retention_lessons as Lessons | null) ?? null);
    setSyncedAt(data?.retention_synced_at ?? null);
    setProblem(data?.retention_error ?? null);
    setLoaded(true);
  };

  useEffect(() => { load().catch(() => setLoaded(true)); }, [userId]);

  const refresh = async () => {
    setBusy(true);
    setError('');
    try {
      const token = await getSessionToken();
      const res = await fetch(`${FUNCTIONS_URL}/sync-retention`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: '{}',
      });
      if (!res.ok) throw new Error(String(res.status));
      await load();
    } catch {
      setError('Could not read your retention. Try again.');
    } finally {
      setBusy(false);
    }
  };

  if (!loaded) return null;

  return (
    <div className="space-y-3 mt-5 pt-5" style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}>
      <p className="t-label" style={{ color: 'var(--text-muted)' }}>Your retention</p>

      {problem === 'no_scope' || problem === 'not_connected' ? (
        <>
          <p className="text-sm leading-relaxed" style={{ color: 'var(--text-muted)' }}>
            {problem === 'no_scope'
              ? <>YouTube did not let Chumoku read your retention. Reconnect and leave the analytics box&nbsp;ticked.</>
              : <>YouTube stopped letting Chumoku in. Reconnect to keep your numbers&nbsp;coming.</>}
          </p>
          <Button variant="secondary" onClick={onReconnect}>Reconnect YouTube</Button>
        </>
      ) : lessons?.lessons?.length ? (
        <LessonList lessons={lessons} />
      ) : (
        <p className="text-sm leading-relaxed" style={{ color: 'var(--text-muted)' }}>
          {syncedAt
            ? 'Not enough Shorts with views yet. This fills in by itself as they come in.'
            : 'Not read yet.'}
        </p>
      )}

      {error && <p className="text-red-400 text-sm">{error}</p>}
      {problem !== 'no_scope' && problem !== 'not_connected' && (
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" onClick={() => openRetention()}>See every Short</Button>
          <Button variant="ghost" onClick={refresh} disabled={busy}>
            {busy && <Loader2 className="w-4 h-4 animate-spin" />}
            {busy ? 'Reading your retention' : 'Refresh'}
          </Button>
        </div>
      )}
    </div>
  );
}
