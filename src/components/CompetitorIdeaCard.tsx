import { useState } from 'react';
import { Eye, Calendar, TrendingUp, Trash2, Loader2 } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { formatViews, formatDate, type CompetitorIdea } from '../lib/competitors';
import { CompetitorIdeaAnalysis } from './CompetitorIdeaAnalysis';

// The full expanded idea, used by the Scripts workspace where the whole point
// is reading the generated outline and script. The discovery feed uses the
// compact CompetitorVideoCard plus a drawer instead — there, this much text
// per row was what made the list unscannable.
export function CompetitorIdeaCard({ idea, onUpdated, isPro, onRemove }: {
  idea: CompetitorIdea;
  onUpdated: (updated: CompetitorIdea) => void;
  isPro: boolean;
  // Only the Scripts workspace passes this: "remove" there means discard the
  // generated work, which is what takes the row out of that list.
  onRemove?: () => void;
}) {
  const [removing, setRemoving] = useState(false);


  // Clears the outline and script rather than deleting the row. The row is
  // also the record that this video was already analyzed — dropping it would
  // let the next fetch pull the same video again and charge for it a second
  // time. Wiping the generated fields is what actually removes it from the
  // Scripts list, since that list is "ideas that have an outline or script".
  const handleRemove = async () => {
    if (!window.confirm('Delete the outline and script for this idea? Regenerating them later costs credits again.')) return;
    setRemoving(true);
    const { error } = await supabase
      .from('competitor_ideas')
      .update({ outline: null, script: null })
      .eq('id', idea.id);
    setRemoving(false);
    if (!error) {
      onUpdated({ ...idea, outline: null, script: null });
      onRemove?.();
    }
  };

  return (
    <div
      className="rounded-2xl p-5 space-y-4 transition-opacity glass-panel"
      style={{
        opacity: idea.liked === false ? 0.4 : 1,
        ...(idea.liked === false ? { border: '1px solid rgba(255,255,255,0.04)' } : {}),
      }}
    >
      {/* Video info row */}
      <div className="flex gap-3">
        {idea.video_thumbnail && (
          <a
            href={`https://www.youtube.com/watch?v=${idea.video_id}`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex-shrink-0"
          >
            <img
              src={idea.video_thumbnail}
              alt={idea.video_title || ''}
              className="w-24 h-14 rounded-lg object-cover hover:opacity-80 transition-opacity"
            />
          </a>
        )}
        <div className="flex-1 min-w-0 space-y-1">
          <p className="text-white text-sm font-medium leading-snug line-clamp-2">
            {idea.video_title || 'Untitled video'}
          </p>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            {idea.outlier_score != null && (
              <span
                className="flex items-center gap-1 text-xs font-semibold px-1.5 py-0.5 rounded-md"
                style={{ background: 'rgba(52,211,153,0.12)', color: '#6ee7b7' }}
                title="Views per day versus this channel's usual pace"
              >
                <TrendingUp className="w-3 h-3" />
                {idea.outlier_score}x
              </span>
            )}
            <span className="text-xs text-gray-500">{idea.channel_name}</span>
            {idea.video_views !== null && (
              <span className="flex items-center gap-1 text-xs text-gray-500">
                <Eye className="w-3 h-3" />
                {formatViews(idea.video_views)}
              </span>
            )}
            {idea.video_published_at && (
              <span className="flex items-center gap-1 text-xs text-gray-500">
                <Calendar className="w-3 h-3" />
                {formatDate(idea.video_published_at)}
              </span>
            )}
          </div>
        </div>
        {/* No save/dismiss here on purpose. This list is built from "has an
            outline or script", not from the liked flag, so those two buttons
            changed nothing you could see — they only mean something in the
            Feed, where Saved and Dismissed are actual tabs. */}
        {onRemove && (
          <div className="flex items-start flex-shrink-0">
            <button
              onClick={handleRemove}
              disabled={removing}
              title="Delete outline and script"
              className="p-1.5 rounded-lg transition-all text-gray-600 hover:text-red-400 disabled:opacity-50"
            >
              {removing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
            </button>
          </div>
        )}
      </div>

      <CompetitorIdeaAnalysis idea={idea} onUpdated={onUpdated} isPro={isPro} />
    </div>
  );
}
