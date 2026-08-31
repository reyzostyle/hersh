import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { CloseCircleOutlineIcon as X, RefreshOutlineIcon as Loader2, MagnifierOutlineIcon as Search } from '@solar-icons/react';
import { Check } from './BrandIcons';
import { getSessionToken } from '../lib/supabase';
import { callFunction, formatViews } from '../lib/competitors';
import { ErrorNotice } from './ErrorNotice';
import { Empty } from './Page';

export interface Suggestion {
  channelId: string;
  name: string;
  thumbnail: string;
  subscribers: number | null;
  hits: number;
}

// The picker for auto-find. Nothing is added until Add is pressed: the search
// is a suggestion, and five tracked channels is a small enough budget that
// having one spent for you would be worse than typing a URL.
export function FindCompetitorsModal({ slotsLeft, onAdd, onClose }: {
  slotsLeft: number;
  onAdd: (ids: string[]) => Promise<void>;
  onClose: () => void;
}) {
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [query, setQuery] = useState('');
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [picked, setPicked] = useState<Set<string>>(new Set());

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  useEffect(() => {
    (async () => {
      try {
        const token = await getSessionToken();
        if (!token) throw new Error('Not authenticated');
        const res = await callFunction('find-competitor-channels', token, {});
        const data = await res.json();
        if (data.error === 'upgrade_required') {
          window.dispatchEvent(new CustomEvent('hershy:navigate', { detail: 'upgrade' }));
          onClose();
          return;
        }
        // Both of these are answers, not failures: one says come back tomorrow,
        // the other says fill in your profile first.
        if (data.error === 'rate_limited' || data.error === 'no_profile') {
          setNotice(data.message);
          return;
        }
        if (!res.ok) throw new Error(data.error || 'Could not search');
        setQuery(data.query || '');
        setSuggestions(data.channels || []);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Could not search');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const toggle = (id: string) => {
    setPicked(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else if (next.size < slotsLeft) next.add(id);
      return next;
    });
  };

  const confirm = async () => {
    if (picked.size === 0) return;
    setAdding(true);
    await onAdd([...picked]);
    setAdding(false);
    onClose();
  };

  const atLimit = picked.size >= slotsLeft;

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-6">
      <div className="absolute inset-0 animate-fade-in" style={{ background: 'rgba(0,0,0,0.6)' }} onClick={onClose} />

      <div
        className="relative w-full sm:max-w-lg max-h-[85vh] flex flex-col animate-scale-in overflow-hidden"
        style={{ background: 'var(--bg-app)', border: '1px solid var(--line)', borderRadius: 'var(--r-lg)' }}
      >
        <div className="flex items-start gap-3 px-5 py-4 flex-shrink-0" style={{ borderBottom: '1px solid var(--line)' }}>
          <div className="flex-1 min-w-0">
            <p className="label-mono mb-1.5">Auto-find</p>
            <p className="text-[15px] font-medium" style={{ color: 'var(--text)' }}>
              Channels winning on your subject
            </p>
            {query && (
              <p className="text-[12px] mt-1" style={{ color: 'var(--text-muted)' }}>
                Read off your own uploads, then searched for{' '}
                <span className="font-mono" style={{ color: 'var(--text)' }}>{query}</span>
              </p>
            )}
          </div>
          <button onClick={onClose} className="p-1 flex-shrink-0 transition-colors hover:text-[var(--text)]" style={{ color: 'var(--text-faint)' }}>
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          {loading ? (
            <div className="flex flex-col items-center gap-3 py-12">
              <Loader2 className="w-5 h-5 animate-spin" style={{ color: 'var(--text-faint)' }} />
              <p className="text-[13px]" style={{ color: 'var(--text-muted)' }}>Looking for who is already winning this</p>
            </div>
          ) : error ? (
            <ErrorNotice message={error} />
          ) : notice ? (
            <Empty icon={<Search className="w-7 h-7" style={{ color: 'var(--text-faint)' }} />}>{notice}</Empty>
          ) : suggestions.length === 0 ? (
            <Empty icon={<Search className="w-7 h-7" style={{ color: 'var(--text-faint)' }} />}>
              Nothing came back for that subject. Add a channel by URL instead, and auto-find gets sharper once you have uploads it can read.
            </Empty>
          ) : (
            <div className="space-y-1.5">
              {suggestions.map(s => {
                const on = picked.has(s.channelId);
                const blocked = !on && atLimit;
                return (
                  <button
                    key={s.channelId}
                    onClick={() => toggle(s.channelId)}
                    disabled={blocked}
                    className="w-full flex items-center gap-3 px-3 py-2.5 rounded-[var(--r-sm)] text-left transition-colors disabled:opacity-35"
                    style={{
                      background: on ? 'var(--bg-raised-hover)' : 'var(--bg-raised)',
                      border: `1px solid ${on ? 'var(--line-strong)' : 'var(--line)'}`,
                    }}
                  >
                    <span
                      className="w-4 h-4 rounded flex items-center justify-center flex-shrink-0"
                      style={on ? { background: 'var(--accent)' } : { border: '1px solid var(--line-strong)' }}
                    >
                      {on && <Check className="w-3 h-3" style={{ color: 'var(--on-accent)' }} />}
                    </span>
                    {s.thumbnail
                      ? <img src={s.thumbnail} alt="" className="w-8 h-8 rounded-full object-cover flex-shrink-0" />
                      : <span className="w-8 h-8 rounded-full flex-shrink-0" style={{ background: 'rgba(255,255,255,0.08)' }} />}
                    <span className="flex-1 min-w-0">
                      <span className="block text-[13px] font-medium truncate" style={{ color: 'var(--text)' }}>{s.name}</span>
                      <span className="block font-mono text-[11px] tabular-nums" style={{ color: 'var(--text-faint)' }}>
                        {s.subscribers != null ? `${formatViews(s.subscribers)} subs` : 'subs hidden'}
                        {' · '}
                        {s.hits} {s.hits === 1 ? 'hit' : 'hits'} in the top 50
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {suggestions.length > 0 && (
          <div className="flex items-center gap-3 px-5 py-4 flex-shrink-0" style={{ borderTop: '1px solid var(--line)' }}>
            <p className="flex-1 font-mono text-[11px] tabular-nums" style={{ color: 'var(--text-faint)' }}>
              {picked.size} of {slotsLeft} {slotsLeft === 1 ? 'slot' : 'slots'} left
            </p>
            <button onClick={onClose} className="px-4 py-2 rounded-[var(--r-sm)] text-sm font-medium transition-colors" style={{ color: 'var(--text-muted)' }}>
              Cancel
            </button>
            <button
              onClick={confirm}
              disabled={picked.size === 0 || adding}
              className="btn-primary flex items-center gap-2 px-4 py-2 rounded-[var(--r-sm)] text-sm font-medium disabled:opacity-35"
            >
              {adding && <Loader2 className="w-4 h-4 animate-spin" />}
              {adding ? 'Adding' : `Add ${picked.size || ''}`.trim()}
            </button>
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}
