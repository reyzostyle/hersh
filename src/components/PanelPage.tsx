import { useEffect, useRef, useState } from 'react';
import { RefreshOutlineIcon as Loader2 } from '@solar-icons/react';
import { useAuth } from '../contexts/AuthContext';
import { getSessionToken, supabase } from '../lib/supabase';
import { stealVideo, itemFromIdea, type CompetitorIdea } from '../lib/competitors';
import { listProjects, touchProject, type Project } from '../lib/projects';
import { PENDING_ANALYZE_KEY } from '../lib/intents';
import { SITE_URL } from '../lib/brand';
import { AnalysisChat, resetAnalysisSession } from './AnalysisChat';
import { CompetitorVideoView } from './CompetitorVideoView';
import { AnalysisProgressModal } from './AnalysisProgressModal';
import { ErrorNotice } from './ErrorNotice';

// Chumoku inside the Chrome extension's side panel, docked beside YouTube.
//
// The extension's panel page is an iframe of this route, so everything here is
// the real app: the same session (Chrome gives an extension's frames first-party
// storage on hosts it has permission for), the same chat, the same idea view.
// An analysis is saved as a conversation and a steal as a saved idea exactly
// as they would be in a tab - there is no second copy of any of it.
//
// Requests arrive two ways: ?action=&url= on the first load, and postMessage
// from the panel page for every press after that, so scrolling to the next
// Short and pressing again does not reload the app.

type Action = 'analyze' | 'steal';
type Request = { action: Action; url: string; n: number };

// One live slot per action, so analysing a Short and then stealing it leaves
// both on screen: the second press used to replace the first, and the
// conversation went with it. Switching between them is a switch, not a rerun -
// each slot keeps its own mounted component, and only a new press for that
// action starts anything.
type Slots = { analyze: Request | null; steal: Request | null };

// Only the extension may start a paid run here. Any site can put this route in
// an iframe; one that is not the extension gets partitioned storage (so no
// session) and, with this check, no action either.
const fromExtension = (origin: string | undefined) => !!origin && origin.startsWith('chrome-extension://');

function initialRequest(): Request | null {
  const parent = window.location.ancestorOrigins?.[0];
  if (!fromExtension(parent)) return null;
  const p = new URLSearchParams(window.location.search);
  const action = p.get('action');
  const url = p.get('url');
  if ((action === 'analyze' || action === 'steal') && url) return { action, url, n: 1 };
  return null;
}

export function PanelPage() {
  const { user, loading } = useAuth();
  const [slots, setSlots] = useState<Slots>(() => {
    const first = initialRequest();
    return { analyze: null, steal: null, ...(first ? { [first.action]: first } : {}) };
  });
  const [active, setActive] = useState<Action | null>(() => initialRequest()?.action ?? null);

  const run = (action: Action, url: string) => {
    setSlots(prev => {
      const current = prev[action];
      // The same Short pressed twice for the same thing: show what is already
      // there rather than paying for it again.
      if (current?.url === url) return prev;
      return { ...prev, [action]: { action, url, n: (current?.n ?? 0) + 1 } };
    });
    setActive(action);
  };

  useEffect(() => {
    const onMessage = (e: MessageEvent) => {
      if (e.source !== window.parent || !fromExtension(e.origin)) return;
      const d = e.data;
      if (d?.type !== 'chumoku:run' || (d.action !== 'analyze' && d.action !== 'steal') || typeof d.url !== 'string') return;
      run(d.action, d.url);
    };
    window.addEventListener('message', onMessage);
    window.parent?.postMessage({ type: 'chumoku:panel-ready' }, '*');
    return () => window.removeEventListener('message', onMessage);
  }, []);

  // History, Upgrade, Projects and the rest live in the full app. Anything
  // that would switch tabs opens it instead, next to the video.
  useEffect(() => {
    const open = () => window.open(`${SITE_URL}/?utm_source=extension`, '_blank', 'noopener');
    window.addEventListener('chumoku:navigate', open);
    return () => window.removeEventListener('chumoku:navigate', open);
  }, []);

  return (
    <div className="h-screen flex flex-col" style={{ background: 'var(--bg-app)' }}>
      <header className="flex-shrink-0 flex items-center justify-between px-4 h-11" style={{ borderBottom: '1px solid var(--line)' }}>
        <span className="flex items-center gap-2 text-[14px] font-semibold" style={{ color: 'var(--text)' }}>
          <img src="/favicon.png" alt="" className="w-5 h-5 rounded-md" /> Chumoku
        </span>
        <div className="flex items-center gap-2">
          {/* Only once there is a choice to make. */}
          {slots.analyze && slots.steal && (['analyze', 'steal'] as Action[]).map(a => (
            <button key={a} onClick={() => setActive(a)} className="chip" data-on={active === a}
                    title={slots[a]?.url}>
              {a === 'analyze' ? 'Analysis' : 'Steal'}
            </button>
          ))}
          <a href={`${SITE_URL}/?utm_source=extension`} target="_blank" rel="noopener"
             className="text-[12px] transition-colors hover:text-[var(--text)]" style={{ color: 'var(--text-muted)' }}>
            Open app ↗
          </a>
        </div>
      </header>

      {/* No scrolling here: the chat scrolls its own conversation and the
          steal view scrolls its own page. A scroller wrapped around either one
          is a second scrollbar that drags the header out of view. */}
      <div className="flex-1 min-h-0">
        {loading ? (
          <Centered><Loader2 className="w-6 h-6 animate-spin" style={{ color: 'var(--text-muted)' }} /></Centered>
        ) : !user ? (
          <SignedOut />
        ) : !active ? (
          <Idle />
        ) : null}

        {/* Both slots stay mounted and the inactive one is hidden rather than
            unmounted: a chat that is thrown away and rebuilt has lost its
            messages, and a steal would have to be paid for twice. */}
        {user && slots.analyze && (
          <div className={`h-full ${active === 'analyze' ? '' : 'hidden'}`}>
            <AnalyzeRun key={slots.analyze.n} url={slots.analyze.url} />
          </div>
        )}
        {user && slots.steal && (
          <div className={`h-full overflow-y-auto ${active === 'steal' ? '' : 'hidden'}`}>
            <StealRun key={slots.steal.n} url={slots.steal.url} />
          </div>
        )}
      </div>
    </div>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return <div className="h-full flex flex-col items-center justify-center text-center px-6">{children}</div>;
}

function Idle() {
  return (
    <Centered>
      <p className="label-mono mb-3">Side panel</p>
      <h1 className="text-[20px] font-semibold tracking-tight mb-2 text-balance" style={{ color: 'var(--text)' }}>
        Press Analyze or Steal on any Short.
      </h1>
      <p className="text-[13px] leading-relaxed max-w-xs text-pretty" style={{ color: 'var(--text-muted)' }}>
        The result opens here, next to the video, and is saved to Chumoku like anything else you run.
      </p>
    </Centered>
  );
}

function SignedOut() {
  return (
    <Centered>
      <p className="label-mono mb-3">Not signed in</p>
      <h1 className="text-[20px] font-semibold tracking-tight mb-2 text-balance" style={{ color: 'var(--text)' }}>
        Sign in to Chumoku first.
      </h1>
      <p className="text-[13px] leading-relaxed max-w-xs mb-6 text-pretty" style={{ color: 'var(--text-muted)' }}>
        The panel uses the same account as the site. Sign in there, then come back.
      </p>
      <div className="flex items-center gap-2">
        <a href={`${SITE_URL}/?utm_source=extension`} target="_blank" rel="noopener"
           className="btn-primary px-4 py-2 rounded-full text-[13px] font-medium">
          Sign in
        </a>
        <button onClick={() => window.location.reload()} className="chip">I've signed in</button>
      </div>
    </Centered>
  );
}

// A fresh conversation per press. The pending key is written before
// AnalysisChat mounts, so its own mount effect picks the link up and runs it,
// the same path the landing page's hero uses.
function AnalyzeRun({ url }: { url: string }) {
  useState(() => {
    resetAnalysisSession();
    localStorage.setItem(PENDING_ANALYZE_KEY, url);
    return null;
  });
  return <AnalysisChat />;
}

function StealRun({ url }: { url: string }) {
  const [idea, setIdea] = useState<CompetitorIdea | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const [error, setError] = useState('');
  const [limit, setLimit] = useState<number | null>(null);
  const started = useRef(false);

  useEffect(() => {
    // StrictMode mounts twice in development; a steal costs credits.
    if (started.current) return;
    started.current = true;
    (async () => {
      try {
        const token = await getSessionToken();
        if (!token) throw new Error('Not authenticated');
        const [result, list] = await Promise.all([stealVideo(url, token), listProjects()]);
        setProjects(list);
        if ('limit' in result) setLimit(result.cost);
        else setIdea(result.idea);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Could not steal that video');
      }
    })();
  }, [url]);

  const update = (patch: Partial<CompetitorIdea>) => {
    if (!idea) return;
    const next = { ...idea, ...patch };
    setIdea(next);
    supabase.from('competitor_ideas').update(patch).eq('id', idea.id)
      .then(({ error: e }) => { if (e) console.error('[PanelPage] update idea error:', e); });
  };

  const running = !idea && !error && limit == null;

  if (limit != null) {
    return (
      <Centered>
        <h1 className="text-[18px] font-semibold mb-2" style={{ color: 'var(--text)' }}>Out of credits</h1>
        <p className="text-[13px] max-w-xs mb-5 text-pretty" style={{ color: 'var(--text-muted)' }}>
          Stealing a format costs {limit} credits and you've used this month's.
        </p>
        <a href={`${SITE_URL}/?utm_source=extension`} target="_blank" rel="noopener"
           className="btn-primary px-4 py-2 rounded-full text-[13px] font-medium">Get more</a>
      </Centered>
    );
  }

  if (error) {
    return <div className="p-5"><ErrorNotice message={error} /></div>;
  }

  if (!idea) return <AnalysisProgressModal open={running} mode="steal" done={false} variant="inline" />;

  return (
    <CompetitorVideoView
      item={itemFromIdea(idea)}
      projects={projects}
      backLabel="All ideas"
      onBack={() => window.open(`${SITE_URL}/?utm_source=extension`, '_blank', 'noopener')}
      onBreakDown={() => {}}
      breaking={false}
      onSave={() => update({ liked: idea.liked === true ? null : true })}
      onDismiss={() => update({ liked: idea.liked === false ? null : false })}
      onFile={projectId => {
        update({ project_id: projectId, liked: true });
        if (projectId) touchProject(projectId);
      }}
      onUpdated={setIdea}
    />
  );
}
