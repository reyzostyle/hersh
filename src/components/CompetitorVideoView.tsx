import { useState } from 'react';
import {
  AltArrowLeftOutlineIcon as ArrowLeft, SlashCircleOutlineIcon as Dismissed,
  Stars2OutlineIcon as Sparkles, RefreshOutlineIcon as Loader2,
  SquareArrowRightUpOutlineIcon as ExternalLink, FolderOutlineIcon as Folder,
  BookmarkOutlineIcon as Bookmark,
} from '@solar-icons/react';
import { Check } from './BrandIcons';
import { formatViews, formatDate, type FeedItem, type CompetitorIdea } from '../lib/competitors';
import { useIdeaGeneration } from '../lib/useIdeaGeneration';
import { CREDIT_COSTS } from '../lib/useUsage';
import { type Project } from '../lib/projects';
import { Page, PageHead, Panel, Section } from './Page';
import { ErrorNotice } from './ErrorNotice';

// Working on one video happens here, on its own screen, not in a tray over the
// grid. The tray was fine for reading a paragraph and wrong for everything the
// step actually became: an outline is a document, and a 384px column with the
// feed showing through beside it is not where you read one.
export function CompetitorVideoView({
  item, projects, onBack, onBreakDown, breaking, onSave, onDismiss, onFile, onUpdated,
}: {
  item: FeedItem;
  projects: Project[];
  onBack: () => void;
  onBreakDown: () => void;
  breaking: boolean;
  onSave: () => void;
  onDismiss: () => void;
  onFile: (projectId: string | null) => void;
  onUpdated: (idea: CompetitorIdea) => void;
}) {
  const idea = item.idea;
  const isSaved = idea?.liked === true;
  const isDismissed = idea?.liked === false;
  const [filingOpen, setFilingOpen] = useState(false);

  const { generatingOutline, generateOutline, error, errorIsPlanLimit } =
    useIdeaGeneration(idea ?? ({ id: '' } as CompetitorIdea), onUpdated);

  return (
    <Page className="animate-tab-in">
      <button
        onClick={onBack}
        className="flex items-center gap-1.5 mb-6 text-[13px] transition-colors hover:text-[var(--text)]"
        style={{ color: 'var(--text-muted)' }}
      >
        <ArrowLeft className="w-4 h-4" /> Feed
      </button>

      <PageHead eyebrow={item.channel_name || 'Competitor'} title={item.video_title || 'Untitled video'} />

      {/* Facts read as a line of type; only the things you can DO are buttons.
          Wrapping the view count and the date in pills made six controls out of
          three, and the two you cannot press looked exactly like the four you
          can. */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-3 -mt-4 mb-8">
        <div className="flex items-center gap-3 font-mono text-[12px] tabular-nums">
          {item.outlier_score != null && (
            <span style={{ color: 'var(--process)' }} title="Views against this channel's median">
              {item.outlier_score}x
            </span>
          )}
          {item.video_views != null && (
            <span style={{ color: 'var(--text-muted)' }}>{formatViews(item.video_views)} views</span>
          )}
          {item.video_published_at && (
            <span style={{ color: 'var(--text-faint)' }}>{formatDate(item.video_published_at)}</span>
          )}
          {/* A link out, not an action on the idea, so it belongs with the
              facts. As a fourth pill it was also what pushed the row onto two
              lines on a phone. */}
          <a
            href={`https://www.youtube.com/watch?v=${item.video_id}`}
            target="_blank" rel="noopener noreferrer"
            className="flex items-center gap-1 transition-colors hover:text-[var(--text)]"
            style={{ color: 'var(--text-faint)' }}
          >
            watch <ExternalLink className="w-3 h-3" />
          </a>
        </div>

        <div className="flex items-center gap-2 sm:ml-auto">
          <button onClick={onSave} className="chip" data-on={isSaved}>
            {isSaved ? <Check className="w-3.5 h-3.5" /> : <Bookmark className="w-3.5 h-3.5" />}
            {isSaved ? 'Saved' : 'Save'}
          </button>
          <button onClick={() => setFilingOpen(o => !o)} className="chip" title="File this into a project">
            <Folder className="w-3.5 h-3.5" />
            {projects.find(p => p.id === idea?.project_id)?.name ?? 'Project'}
          </button>
          <button onClick={onDismiss} className="chip" data-on={isDismissed}>
            <Dismissed className="w-3.5 h-3.5" />
            {isDismissed ? 'Dismissed' : 'Dismiss'}
          </button>
        </div>
      </div>

      {filingOpen && (
        <Panel className="mb-8">
          <p className="label-mono mb-3">File into</p>
          <div className="flex flex-wrap gap-2">
            <button onClick={() => { onFile(null); setFilingOpen(false); }} className="chip" data-on={!idea?.project_id}>
              Unfiled
            </button>
            {projects.map(p => (
              <button key={p.id} onClick={() => { onFile(p.id); setFilingOpen(false); }}
                      className="chip" data-on={idea?.project_id === p.id}>
                <Folder className="w-3.5 h-3.5" />{p.name}
              </button>
            ))}
            {projects.length === 0 && (
              <p className="text-[13px]" style={{ color: 'var(--text-muted)' }}>
                No projects yet. Make one in the Projects tab.
              </p>
            )}
          </div>
        </Panel>
      )}

      {/* The two paid steps, in the order you would take them. */}
      {!idea?.concept ? (
        <Panel className="flex flex-col items-start gap-4">
          <p className="text-[14px] max-w-md text-balance" style={{ color: 'var(--text-muted)' }}>
            Nothing has read this yet. Break it down and you get what the video is doing and how the same move
            works on your channel.
          </p>
          <button onClick={onBreakDown} disabled={breaking}
                  className="btn-primary flex items-center gap-2 px-4 py-2.5 rounded-[var(--r-sm)] text-sm font-medium disabled:opacity-40">
            {breaking ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
            {breaking ? 'Reading the transcript' : `Break it down · ${CREDIT_COSTS.competitor_idea} cr`}
          </button>
        </Panel>
      ) : (
        <>
          {idea.concept && (
            <Section label="What they did" className="mt-0">
              <p className="text-[14px] leading-relaxed" style={{ color: 'var(--text-muted)' }}>{idea.concept}</p>
            </Section>
          )}

          {idea.adapted_idea && (
            <Section label="Your angle">
              <p className="text-[15px] leading-relaxed" style={{ color: 'var(--text)' }}>{idea.adapted_idea}</p>
            </Section>
          )}

          <Section label="Outline">
            {error && !errorIsPlanLimit && <ErrorNotice message={error} />}
            {errorIsPlanLimit && (
              <p className="text-[13px] mb-3" style={{ color: 'var(--text-muted)' }}>{error}</p>
            )}

            {idea.outline ? (
              <Panel>
                <p className="label-mono mb-2">Hook, first 3s</p>
                <p className="text-[15px] leading-relaxed mb-5" style={{ color: 'var(--text)' }}>{idea.outline.hook}</p>
                {idea.outline.sections?.map((sec, i) => (
                  <div key={i} className="py-3" style={{ borderTop: '1px solid var(--line)' }}>
                    <div className="flex items-baseline gap-3 mb-1">
                      <span className="text-[13px] font-medium" style={{ color: 'var(--text)' }}>{sec.title}</span>
                      <span className="font-mono text-[11px]" style={{ color: 'var(--text-faint)' }}>{sec.duration}</span>
                    </div>
                    <p className="text-[13px] leading-relaxed" style={{ color: 'var(--text-muted)' }}>{sec.content}</p>
                  </div>
                ))}
                {idea.outline.cta && (
                  <div className="pt-3" style={{ borderTop: '1px solid var(--line)' }}>
                    <p className="label-mono mb-1.5">Close</p>
                    <p className="text-[13px] leading-relaxed" style={{ color: 'var(--text)' }}>{idea.outline.cta}</p>
                  </div>
                )}
              </Panel>
            ) : (
              <Panel className="flex flex-col items-start gap-4">
                <p className="text-[14px] max-w-md text-balance" style={{ color: 'var(--text-muted)' }}>
                  The outline is written while watching the video, so it can carry over the cuts, the framing and
                  what is on screen, not just the words.
                </p>
                <button onClick={generateOutline} disabled={generatingOutline}
                        className="btn-primary flex items-center gap-2 px-4 py-2.5 rounded-[var(--r-sm)] text-sm font-medium disabled:opacity-40">
                  {generatingOutline ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                  {generatingOutline ? 'Watching the video' : `Create outline · ${CREDIT_COSTS.competitor_outline} cr`}
                </button>
              </Panel>
            )}
          </Section>
        </>
      )}
    </Page>
  );
}
