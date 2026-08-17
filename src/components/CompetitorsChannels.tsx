import { useState } from 'react';
import { Plus, Loader2, X, Users, RefreshCw, CheckCircle2 } from 'lucide-react';
import { ErrorNotice } from './ErrorNotice';
import { formatDate, type CompetitorChannel, type CompetitorIdea } from './CompetitorIdeaCard';

interface Props {
  channels: CompetitorChannel[];
  ideas: CompetitorIdea[];
  addingChannel: boolean;
  addError: string;
  removingId: string | null;
  syncingChannelId: string | null;
  onAddChannel: (url: string) => void;
  onRemoveChannel: (channel: CompetitorChannel) => void;
  fetchingIdeas: boolean;
  fetchError: string;
  fetchNotice: string;
  onFetchIdeas: () => void;
}

export function CompetitorsChannels({
  channels, ideas, addingChannel, addError, removingId, syncingChannelId,
  onAddChannel, onRemoveChannel, fetchingIdeas, fetchError, fetchNotice, onFetchIdeas,
}: Props) {
  const [channelUrl, setChannelUrl] = useState('');

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!channelUrl.trim()) return;
    onAddChannel(channelUrl.trim());
    setChannelUrl('');
  };

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 pt-4 sm:pt-6 pb-8 space-y-5 animate-fade-in-up">
      <div className="hidden lg:block mb-2">
        <h1 className="text-2xl font-bold text-white mb-1 tracking-tight">Channels</h1>
        <p className="text-sm text-gray-500 text-balance">Track up to 5 competitor channels. A new one syncs right away.</p>
      </div>

      {/* Add channel */}
      <div className="rounded-2xl p-4 sm:p-5 space-y-3 glass-panel">
        <form onSubmit={submit} className="flex gap-2">
          <input
            type="text"
            value={channelUrl}
            onChange={e => setChannelUrl(e.target.value)}
            placeholder="youtube.com/@channelname"
            disabled={addingChannel || channels.length >= 5}
            className="flex-1 px-3 py-2.5 rounded-xl text-white text-sm placeholder-gray-600 focus:outline-none disabled:opacity-50"
            style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.10)' }}
            onFocus={e => { e.currentTarget.style.borderColor = '#0EA4E9'; }}
            onBlur={e => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.10)'; }}
          />
          <button
            type="submit"
            disabled={addingChannel || !channelUrl.trim() || channels.length >= 5}
            className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-white text-sm font-semibold transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            style={{ background: '#0EA4E9' }}
          >
            {addingChannel ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
            Add
          </button>
        </form>

        {addError && <ErrorNotice message={addError} />}

        {channels.length < 5 && (
          <p className="lg:hidden text-[11px] text-gray-600">Up to 5 channels · a new one syncs right away</p>
        )}

        {channels.length > 0 && (
          <div className="space-y-2">
            {channels.map(channel => {
              const channelIdeas = ideas.filter(i => i.channel_id === channel.channel_id);
              const scored = channelIdeas.filter(i => i.outlier_score != null);
              const avgScore = scored.length > 0
                ? (scored.reduce((sum, i) => sum + (i.outlier_score || 0), 0) / scored.length).toFixed(1)
                : null;
              const lastFound = channelIdeas
                .map(i => i.video_published_at || i.created_at)
                .filter(Boolean)
                .sort()
                .pop();
              const isSyncing = syncingChannelId === channel.id;

              return (
                <div
                  key={channel.id}
                  className="flex items-center gap-3 px-3 py-2.5 rounded-xl"
                  style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)' }}
                >
                  {channel.channel_thumbnail ? (
                    <img src={channel.channel_thumbnail} alt="" className="w-9 h-9 rounded-full object-cover flex-shrink-0" />
                  ) : (
                    <div className="w-9 h-9 rounded-full flex-shrink-0" style={{ background: 'rgba(255,255,255,0.08)' }} />
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-gray-200 text-sm font-medium truncate">{channel.channel_name || channel.channel_id}</p>
                    <p className="text-[11px] text-gray-500 tabular-nums">
                      {channelIdeas.length} idea{channelIdeas.length === 1 ? '' : 's'} found
                      {avgScore && ` · avg ${avgScore}x`}
                      {lastFound && ` · last ${formatDate(lastFound)}`}
                    </p>
                  </div>
                  <span
                    className="flex items-center gap-1.5 text-[11px] font-medium px-2 py-1 rounded-full flex-shrink-0"
                    style={isSyncing
                      ? { background: 'rgba(14,164,233,0.12)', color: '#38bdf8' }
                      : { background: 'rgba(52,211,153,0.10)', color: '#6ee7b7' }
                    }
                  >
                    {isSyncing ? <Loader2 className="w-3 h-3 animate-spin" /> : <CheckCircle2 className="w-3 h-3" />}
                    {isSyncing ? 'Syncing...' : 'Tracked'}
                  </span>
                  <button
                    onClick={() => onRemoveChannel(channel)}
                    disabled={removingId === channel.id}
                    className="text-gray-500 hover:text-red-400 transition-colors flex-shrink-0"
                  >
                    {removingId === channel.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <X className="w-4 h-4" />}
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Manual refresh — 12h cooldown, shared across all tracked channels.
          A newly-added channel above already got its own sync, so this is
          for picking up new uploads on channels you've had for a while. */}
      {channels.length > 0 && (
        <div className="flex items-center gap-3">
          <button
            onClick={onFetchIdeas}
            disabled={fetchingIdeas}
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold transition-all disabled:opacity-50"
            style={{ background: 'rgba(14,164,233,0.15)', border: '1px solid rgba(14,164,233,0.35)', color: '#38bdf8' }}
          >
            {fetchingIdeas ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
            {fetchingIdeas ? 'Finding new ideas...' : 'Find new ideas'}
          </button>
        </div>
      )}

      {fetchError && <ErrorNotice message={fetchError} />}
      {fetchNotice && (
        <p className="text-gray-400 text-sm rounded-xl px-4 py-3" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)' }}>
          {fetchNotice}
        </p>
      )}

      {channels.length === 0 && (
        <div
          className="rounded-2xl p-10 flex flex-col items-center justify-center text-center space-y-3"
          style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)', borderStyle: 'dashed' }}
        >
          <Users className="w-8 h-8 text-gray-700" />
          <p className="text-gray-500 text-sm">Add a competitor channel above to start tracking their content.</p>
        </div>
      )}
    </div>
  );
}
