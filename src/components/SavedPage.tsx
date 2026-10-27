import { useEffect, useState } from 'react';
import { ArrowRightUpOutlineIcon as ArrowUpRight, StarsMinimalisticOutlineIcon as Sparkle } from '@solar-icons/react';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import { requestOpenVideo } from '../lib/projects';
import { formatViews, isOwnIdea, type CompetitorIdea } from '../lib/competitors';
import { Page, PageHead, Section, Row, Skeleton, Empty } from './Page';
import { ChatHistory } from './ChatHistory';

// What replaced Projects (2026-09-29). Projects were folders you had to make
// and file into; almost nobody did, and the thing people actually came back for
// was the ideas they kept and the conversations about them. So this is those
// two lists, with nothing to organise.
export function SavedPage() {
  // Gated on the context's user, not a getUser() call at mount: straight after
  // a reload the session is still being restored and the query would run as
  // nobody, rendering "nothing saved" over a table that has twenty rows.
  const { user } = useAuth();
  const [ideas, setIdeas] = useState<CompetitorIdea[] | null>(null);

  useEffect(() => {
    if (!user) return;
    supabase
      .from('competitor_ideas')
      .select('*')
      .eq('user_id', user.id)
      .eq('liked', true)
      .order('created_at', { ascending: false })
      .limit(100)
      .then(({ data }) => setIdeas((data ?? []) as CompetitorIdea[]));
  }, [user]);

  return (
    <Page>
      <PageHead title="Saved" />

      <Section label="Ideas">
        {ideas === null ? (
          <div className="row-list">
            {[0, 1, 2].map(i => <Skeleton key={i} className="h-[68px] w-full" style={{ borderRadius: 'var(--r-md)' }} />)}
          </div>
        ) : ideas.length === 0 ? (
          <Empty>Nothing saved yet. Steal a Short or press Save on an idea and it lands here.</Empty>
        ) : (
          <div className="row-list">
            {ideas.map(idea => (
              <Row
                key={idea.id}
                icon={isOwnIdea(idea) && !idea.basis?.video_id ? (
                  <Sparkle className="w-5 h-5" style={{ color: 'var(--process)' }} />
                ) : (
                  <img
                    src={isOwnIdea(idea)
                      ? `https://i.ytimg.com/vi/${idea.basis!.video_id}/sddefault.jpg`
                      : idea.video_thumbnail || `https://i.ytimg.com/vi/${idea.video_id}/sddefault.jpg`}
                    alt=""
                    className="w-full h-full object-cover rounded-[11px]"
                    // A Short's thumbnail is letterboxed; this scales the bars out.
                    style={{ transform: 'scale(1.35)', ...(isOwnIdea(idea) ? { filter: 'blur(1.5px) brightness(0.7)' } : {}) }}
                  />
                )}
                iconStyle={isOwnIdea(idea) && !idea.basis?.video_id ? undefined : { padding: 0, overflow: 'hidden' }}
                // The hook they would film, when one was written; the source
                // title only when nothing was.
                title={idea.outline?.hook || (isOwnIdea(idea) ? idea.pitch : idea.video_title) || 'Untitled'}
                subtitle={isOwnIdea(idea) ? 'AI idea from your channel · untested' : [
                  idea.channel_name,
                  idea.outlier_score != null && idea.outlier_score < 1000 ? `${idea.outlier_score}× its channel` : null,
                  idea.video_views != null ? `${formatViews(idea.video_views)} views` : null,
                ].filter(Boolean).join(' · ')}
                arrow={<ArrowUpRight className="w-4 h-4 row-arrow" />}
                onClick={() => requestOpenVideo(idea.video_id)}
              />
            ))}
          </div>
        )}
      </Section>

      <ChatHistory />
    </Page>
  );
}
