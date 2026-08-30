import { useState, useEffect } from 'react';
import { AddOutlineIcon as Plus, FolderOutlineIcon as Folder, RefreshOutlineIcon as Loader2, ChatRoundOutlineIcon as Chat } from '@solar-icons/react';
import { supabase } from '../lib/supabase';

interface Project {
  id: string;
  name: string;
  updated_at: string;
  thread_count: number;
  idea_count: number;
}

// A project is a grouping, not a container: nothing has to live in one, and
// deleting one never takes the work with it. It exists because a conversation,
// the competitor video that prompted it and the ideas saved off it are one
// piece of work that used to be scattered across three tabs.
export function ProjectsPage() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('');

  const load = async () => {
    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data } = await supabase
        .from('projects').select('id, name, updated_at').eq('user_id', user.id)
        .order('updated_at', { ascending: false });

      const rows = data ?? [];
      const withCounts = await Promise.all(rows.map(async (p) => {
        const [{ count: threads }, { count: ideas }] = await Promise.all([
          supabase.from('chat_threads').select('*', { count: 'exact', head: true }).eq('project_id', p.id),
          supabase.from('competitor_ideas').select('*', { count: 'exact', head: true }).eq('project_id', p.id),
        ]);
        return { ...p, thread_count: threads ?? 0, idea_count: ideas ?? 0 };
      }));
      setProjects(withCounts);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const create = async () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    await supabase.from('projects').insert({ user_id: user.id, name: trimmed });
    setName('');
    setCreating(false);
    load();
  };

  return (
    <div className="max-w-2xl mx-auto px-5 sm:px-8 pt-12 sm:pt-16 pb-16">
      <p className="label-mono mb-4">Projects</p>
      <h1 className="display mb-3" style={{ color: 'var(--text)' }}>Everything in one place</h1>
      <p className="text-[15px] mb-10 max-w-md" style={{ color: 'var(--text-muted)' }}>
        Group a conversation with the video that prompted it and the ideas you kept.
      </p>

      {creating ? (
        <div className="flex items-center gap-2 mb-8">
          <input
            value={name}
            onChange={e => setName(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') create(); if (e.key === 'Escape') { setCreating(false); setName(''); } }}
            autoFocus
            placeholder="Project name"
            className="flex-1 rounded-xl px-4 py-2.5 text-sm focus:outline-none"
            style={{ background: 'var(--bg-raised)', border: '1px solid var(--line)', color: 'var(--text)' }}
          />
          <button onClick={create} disabled={!name.trim()}
            className="px-4 py-2.5 rounded-xl text-sm font-medium transition-opacity disabled:opacity-30"
            style={{ background: 'var(--accent)', color: 'var(--on-accent)' }}>
            Create
          </button>
        </div>
      ) : (
        <button onClick={() => setCreating(true)}
          className="flex items-center gap-2 mb-8 px-4 py-2.5 rounded-xl text-sm font-medium transition-opacity hover:opacity-90"
          style={{ background: 'var(--accent)', color: 'var(--on-accent)' }}>
          <Plus className="w-4 h-4" /> New project
        </button>
      )}

      {loading ? (
        <div className="flex justify-center py-10">
          <Loader2 className="w-5 h-5 animate-spin" style={{ color: 'var(--text-faint)' }} />
        </div>
      ) : projects.length === 0 ? (
        <div className="py-12 text-center">
          <Folder className="w-8 h-8 mx-auto mb-3" style={{ color: 'var(--text-faint)' }} />
          <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
            No projects yet. Make one when a video is worth coming back to.
          </p>
        </div>
      ) : (
        <div style={{ borderTop: '1px solid var(--line)' }}>
          {projects.map(p => (
            <div key={p.id} className="flex items-center gap-4 py-4" style={{ borderBottom: '1px solid var(--line)' }}>
              <Folder className="w-[18px] h-[18px] flex-shrink-0" style={{ color: 'var(--text-faint)' }} />
              <div className="flex-1 min-w-0">
                <p className="text-[15px] font-medium truncate" style={{ color: 'var(--text)' }}>{p.name}</p>
                <p className="font-mono text-[11px] mt-0.5" style={{ color: 'var(--text-faint)' }}>
                  {p.thread_count} {p.thread_count === 1 ? 'chat' : 'chats'} · {p.idea_count} {p.idea_count === 1 ? 'idea' : 'ideas'}
                </p>
              </div>
              <Chat className="w-4 h-4 flex-shrink-0" style={{ color: 'var(--text-faint)' }} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
