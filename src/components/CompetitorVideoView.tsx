import { AltArrowLeftOutlineIcon as ArrowLeft, SquareArrowRightUpOutlineIcon as ExternalLink, LockKeyholeMinimalisticOutlineIcon as Lock } from '@solar-icons/react';
import { formatViews, type FeedItem, type CompetitorIdea } from '../lib/competitors';
import { useIdeaGeneration } from '../lib/useIdeaGeneration';
import { CREDIT_COSTS } from '../lib/useUsage';
import { PENDING_CHAT_KEY } from '../lib/intents';
import { resetAnalysisSession } from './AnalysisChat';
import { Page, Button, Skeleton } from './Page';
import { ErrorNotice } from './ErrorNotice';

// One idea, opened up a step at a time (rebuilt 2026-09-30).
//
// The screen used to be the other channel's title as a heading and then two
// paragraphs and an outline in one long scroll. What Ivan asked for instead is
// the thing he liked about the steal checklist: press a button, watch it work,
// see what comes out - a small reveal each time. So the steps are stacked and
// locked in order: the angle (1 credit, reads the video), the outline (4,
// watches it), the script (in Chat, where it can be argued with). A locked
// step shows its shape blurred, so there is always something to unlock.
export function CompetitorVideoView({
  item, onBack, onBreakDown, breaking, onSave, onDismiss, onUpdated, backLabel = 'Feed',
}: {
  backLabel?: string;
  item: FeedItem;
  onBack: () => void;
  onBreakDown: () => void;
  breaking: boolean;
  onSave: () => void;
  onDismiss: () => void;
  onUpdated: (idea: CompetitorIdea) => void;
}) {
  const idea = item.idea;
  const isSaved = idea?.liked === true;
  const isDismissed = idea?.liked === false;

  const { generatingOutline, generateOutline, error, errorIsPlanLimit } =
    useIdeaGeneration(idea ?? ({ id: '' } as CompetitorIdea), onUpdated);

  const hasAngle = !!idea?.concept;
  const outline = idea?.outline ?? null;

  const writeScript = () => {
    if (!idea) return;
    // Kept, so the chat's lookup finds it among their saved ideas and it lands
    // in Saved with the conversation that follows.
    if (!isSaved) onSave();
    const name = outline?.hook || idea.pitch || idea.video_title || 'this idea';
    try {
      localStorage.setItem(PENDING_CHAT_KEY, JSON.stringify({ text: `Write the full script for my saved idea "${name}".`, ideaId: idea.id }));
    } catch { /* ignore */ }
    resetAnalysisSession();
    window.dispatchEvent(new CustomEvent('chumoku:navigate', { detail: 'analyze' }));
  };

  return (
    <Page className="animate-tab-in">
      <button
        onClick={onBack}
        className="flex items-center gap-1.5 mb-8 t-small transition-colors hover:text-[var(--text)]"
        style={{ color: 'var(--text-muted)' }}
      >
        <ArrowLeft className="w-4 h-4" /> {backLabel}
      </button>

      <div className="flex flex-col sm:flex-row gap-6 sm:gap-8 mb-12">
        <div className="idea-hero__media">
          <img src={`https://i.ytimg.com/vi/${item.video_id}/hqdefault.jpg`} alt="" />
          {item.outlier_score != null && item.outlier_score < 1000 && (
            <span className="idea-card__mult">{item.outlier_score}×</span>
          )}
        </div>

        <div className="flex-1 min-w-0 flex flex-col">
          <p className="t-label mb-3" style={{ color: 'var(--text-muted)' }}>
            {[item.channel_name, item.video_views != null ? `${formatViews(item.video_views)} views` : null].filter(Boolean).join(' · ')}
            {' · '}
            <a href={`https://www.youtube.com/watch?v=${item.video_id}`} target="_blank" rel="noopener noreferrer"
               className="inline-flex items-center gap-1 transition-colors hover:text-[var(--text)]">
              watch <ExternalLink className="w-3 h-3" />
            </a>
          </p>
          <h1 className="t-title" style={{ color: 'var(--text)' }}>{idea?.pitch || item.video_title || 'Untitled video'}</h1>
          {idea?.pitch && item.video_title && (
            <p className="t-small mt-3" style={{ color: 'var(--text-faint)' }}>From “{item.video_title}”</p>
          )}
          <div className="flex items-center gap-2 mt-6">
            <Button variant={isSaved ? 'primary' : 'secondary'} size="sm" onClick={onSave}>{isSaved ? 'Saved' : 'Save'}</Button>
            <Button variant="ghost" size="sm" onClick={onDismiss}>{isDismissed ? 'Restore' : 'Dismiss'}</Button>
          </div>
        </div>
      </div>

      {error && (
        <div className="mb-6">
          {errorIsPlanLimit
            ? <p className="t-small" style={{ color: 'var(--text-muted)' }}>{error}</p>
            : <ErrorNotice message={error} />}
        </div>
      )}

      <ol className="flex flex-col gap-3">
        {/* 1. The angle */}
        <Step n={1} title="Your angle" done={hasAngle}>
          {hasAngle ? (
            <div className="animate-msg-in">
              <p className="t-body" style={{ color: 'var(--text)' }}>{idea!.adapted_idea}</p>
              {idea!.concept && (
                <details className="mt-4">
                  <summary className="t-small cursor-pointer select-none" style={{ color: 'var(--text-faint)' }}>Why the original worked</summary>
                  <p className="t-small mt-2" style={{ color: 'var(--text-muted)' }}>{idea!.concept}</p>
                </details>
              )}
            </div>
          ) : breaking ? (
            <Working label="Reading the video" lines={3} />
          ) : (
            <Locked lines={3}>
              <Button variant="primary" onClick={onBreakDown}>Reveal the angle · {CREDIT_COSTS.competitor_idea} credit</Button>
            </Locked>
          )}
        </Step>

        {/* 2. The outline */}
        <Step n={2} title="Outline" done={!!outline} dim={!hasAngle}>
          {outline ? (
            <div className="animate-msg-in">
              <p className="t-label mb-1.5" style={{ color: 'var(--text-muted)' }}>Hook</p>
              <p className="t-heading mb-5" style={{ color: 'var(--text)' }}>{outline.hook}</p>
              <ol className="flex flex-col gap-3">
                {outline.sections?.map((sec, i) => (
                  <li key={i} className="grid grid-cols-[3.5rem_1fr] gap-3">
                    <span className="t-small tabular-nums" style={{ color: 'var(--text-faint)' }}>{sec.duration}</span>
                    <div>
                      <p className="t-small font-medium" style={{ color: 'var(--text)' }}>{sec.title}</p>
                      <p className="t-small" style={{ color: 'var(--text-muted)' }}>{sec.content}</p>
                    </div>
                  </li>
                ))}
              </ol>
              {outline.cta && (
                <p className="t-small mt-4" style={{ color: 'var(--text-muted)' }}><span style={{ color: 'var(--text-faint)' }}>End · </span>{outline.cta}</p>
              )}
            </div>
          ) : generatingOutline ? (
            <Working label="Watching it frame by frame" lines={4} />
          ) : (
            <Locked lines={4}>
              {hasAngle
                ? <Button variant="primary" onClick={generateOutline}>Build the outline · {CREDIT_COSTS.competitor_outline} credits</Button>
                : <p className="t-small flex items-center gap-1.5" style={{ color: 'var(--text-faint)' }}><Lock className="w-3.5 h-3.5" />Reveal the angle first</p>}
            </Locked>
          )}
        </Step>

        {/* 3. The script, in Chat */}
        <Step n={3} title="Script" dim={!outline}>
          {outline ? (
            <div className="flex flex-col items-start gap-3">
              <p className="t-small" style={{ color: 'var(--text-muted)' }}>Chumoku writes it in Chat, where you can push back on any line.</p>
              <Button variant="primary" onClick={writeScript}>Write the script in Chat</Button>
            </div>
          ) : (
            <p className="t-small flex items-center gap-1.5" style={{ color: 'var(--text-faint)' }}><Lock className="w-3.5 h-3.5" />Build the outline first</p>
          )}
        </Step>
      </ol>
    </Page>
  );
}

function Step({ n, title, done, dim, children }: { n: number; title: string; done?: boolean; dim?: boolean; children: React.ReactNode }) {
  return (
    <li className="idea-step" data-dim={dim ? 'true' : undefined}>
      <div className="flex items-center gap-3 mb-4">
        <span className="idea-step__n" data-done={done ? 'true' : undefined}>{n}</span>
        <p className="t-heading" style={{ color: 'var(--text)' }}>{title}</p>
      </div>
      {children}
    </li>
  );
}

// A step not opened yet: its shape, blurred, with the button that opens it on
// top. Something to unlock rather than an empty box.
function Locked({ lines, children }: { lines: number; children: React.ReactNode }) {
  return (
    <div className="relative">
      <div className="flex flex-col gap-2.5 blur-[3px] opacity-60 select-none" aria-hidden="true">
        {Array.from({ length: lines }, (_, i) => (
          <span key={i} className="block h-3.5 rounded" style={{ width: `${92 - i * 14}%`, background: 'rgba(255,255,255,0.1)' }} />
        ))}
      </div>
      <div className="absolute inset-0 flex items-center">{children}</div>
    </div>
  );
}

function Working({ label, lines }: { label: string; lines: number }) {
  return (
    <div aria-live="polite">
      <p className="t-small text-working mb-3">{label}</p>
      <div className="flex flex-col gap-2.5">
        {Array.from({ length: lines }, (_, i) => <Skeleton key={i} className="h-3.5" style={{ width: `${92 - i * 14}%` }} />)}
      </div>
    </div>
  );
}
