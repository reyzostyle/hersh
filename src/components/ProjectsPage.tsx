import { useState, useEffect, useCallback, useRef } from 'react';
import {
  AddOutlineIcon as Plus, FolderOutlineIcon as Folder, RefreshOutlineIcon as Loader2,
  ChatRoundOutlineIcon as Chat, AltArrowLeftOutlineIcon as ArrowLeft,
  TrashBinMinimalisticOutlineIcon as Trash2, BookmarkOutlineIcon as Bookmark,
} from '@solar-icons/react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import {
  listProjects, createProject, saveNotes, deleteProject, loadProjectContents,
  type Project, type ProjectThread,
} from '../lib/projects';
import { formatDate, type CompetitorIdea } from '../lib/competitors';
import { Page, PageHead, Panel, Section, Empty } from './Page';

// A project is a grouping, not a container: nothing has to live in one, and
// deleting one never takes the work with it. It exists because a conversation,
// the competitor video that prompted it and the notes about both are one piece
// of work that used to be scattered across three tabs - and, until this screen,
// could be created but never actually filled: project_id was written by nothing.
export function ProjectsPage() {
  // Gated on the context's user rather than calling supabase.auth.getUser()
  // at mount: straight after a hard reload the session is still being restored
  // from storage, the query runs with no user, and the tab renders "no projects
  // yet" over a database that has three.
  const { user } = useAuth();
  const [projects, setProjects] = useState<Project[]>([]);
  const [counts, setCounts] = useState<Record<string, { threads: number; ideas: number }>>({});
  const [openId, setOpenId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('');

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      const rows = await listProjects();
      setProjects(rows);
      if (rows.length === 0) { setCounts({}); return; }

      // Two grouped counts rather than two queries per project: the old version
      // fired 2N round trips to render N rows.
      const ids = rows.map(p => p.id);
      const [{ data: threads }, { data: ideas }] = await Promise.all([
        supabase.from('chat_threads').select('project_id').in('project_id', ids),
        supabase.from('competitor_ideas').select('project_id').in('project_id', ids),
      ]);
      const tally: Record<string, { threads: number; ideas: number }> = {};
      for (const id of ids) tally[id] = { threads: 0, ideas: 0 };
      for (const t of threads ?? []) if (t.project_id) tally[t.project_id].threads++;
      for (const i of ideas ?? []) if (i.project_id) tally[i.project_id].ideas++;
      setCounts(tally);
    } finally {
      setLoading(false);
    }
  }, [user?.id]);

  useEffect(() => { load(); }, [load]);

  // Re-selecting the tab returns to the list, the way clicking a section in any
  // sidebar does.
  useEffect(() => {
    const onNav = (e: Event) => {
      if ((e as CustomEvent).detail === 'projects') setOpenId(null);
    };
    window.addEventListener('hershy:navigate', onNav);
    return () => window.removeEventListener('hershy:navigate', onNav);
  }, []);

  const create = async () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    const project = await createProject(trimmed);
    setName('');
    setCreating(false);
    if (project) { setProjects(prev => [project, ...prev]); setCounts(c => ({ ...c, [project.id]: { threads: 0, ideas: 0 } })); }
  };

  const open = projects.find(p => p.id === openId) ?? null;
  if (open) {
    return (
      <ProjectDetail
        project={open}
        onBack={() => { setOpenId(null); load(); }}
        onRenamed={p => setProjects(prev => prev.map(x => (x.id === p.id ? p : x)))}
        onDeleted={() => { setOpenId(null); load(); }}
      />
    );
  }

  return (
    <Page>
      <PageHead
        eyebrow="Projects"
        title="Everything in one place"
        subtitle="Group a conversation with the video that prompted it and the ideas you kept."
      />

      {creating ? (
        <div className="flex items-center gap-2 mb-8">
          <input
            value={name}
            onChange={e => setName(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') create(); if (e.key === 'Escape') { setCreating(false); setName(''); } }}
            autoFocus
            placeholder="Project name"
            className="flex-1 rounded-[var(--r-sm)] px-4 py-2.5 text-sm focus:outline-none"
            style={{ background: 'var(--bg-raised)', border: '1px solid var(--line)', color: 'var(--text)' }}
          />
          <button onClick={create} disabled={!name.trim()}
            className="btn-primary px-4 py-2.5 rounded-[var(--r-sm)] text-sm font-medium disabled:opacity-30">
            Create
          </button>
        </div>
      ) : (
        <button onClick={() => setCreating(true)}
          className="btn-primary flex items-center gap-2 mb-8 px-4 py-2.5 rounded-[var(--r-sm)] text-sm font-medium">
          <Plus className="w-4 h-4" /> New project
        </button>
      )}

      {loading ? (
        <div className="flex justify-center py-10">
          <Loader2 className="w-5 h-5 animate-spin" style={{ color: 'var(--text-faint)' }} />
        </div>
      ) : projects.length === 0 ? (
        <Empty icon={<Folder className="w-7 h-7" style={{ color: 'var(--text-faint)' }} />}>
          No projects yet. Make one when a video is worth coming back to.
        </Empty>
      ) : (
        <div style={{ borderTop: '1px solid var(--line)' }}>
          {projects.map(p => {
            const c = counts[p.id] ?? { threads: 0, ideas: 0 };
            return (
              <button
                key={p.id}
                onClick={() => setOpenId(p.id)}
                className="w-full flex items-center gap-4 py-4 text-left transition-colors group"
                style={{ borderBottom: '1px solid var(--line)' }}
              >
                <Folder className="w-[18px] h-[18px] flex-shrink-0" style={{ color: 'var(--text-faint)' }} />
                <span className="flex-1 min-w-0">
                  <span className="block text-[15px] font-medium truncate" style={{ color: 'var(--text)' }}>{p.name}</span>
                  <span className="block font-mono text-[11px] mt-0.5" style={{ color: 'var(--text-faint)' }}>
                    {c.threads} {c.threads === 1 ? 'chat' : 'chats'} · {c.ideas} {c.ideas === 1 ? 'idea' : 'ideas'}
                    {p.notes ? ' · notes' : ''}
                  </span>
                </span>
                <Chat className="w-4 h-4 flex-shrink-0 transition-colors group-hover:text-[var(--text)]" style={{ color: 'var(--text-faint)' }} />
              </button>
            );
          })}
        </div>
      )}
    </Page>
  );
}

// ─── One project ──────────────────────────────────────────────────────────────

function ProjectDetail({ project, onBack, onRenamed, onDeleted }: {
  project: Project;
  onBack: () => void;
  onRenamed: (p: Project) => void;
  onDeleted: () => void;
}) {
  const [threads, setThreads] = useState<ProjectThread[]>([]);
  const [ideas, setIdeas] = useState<CompetitorIdea[]>([]);
  const [notes, setNotes] = useState(project.notes ?? '');
  const [saved, setSaved] = useState(true);
  const [loading, setLoading] = useState(true);
  const timer = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    loadProjectContents(project.id)
      .then(({ threads, ideas }) => { setThreads(threads); setIdeas(ideas as CompetitorIdea[]); })
      .finally(() => setLoading(false));
  }, [project.id]);

  // Notes save themselves a beat after you stop typing. A Save button on a
  // notes field is a button whose only job is to be forgotten.
  const onNotesChange = (v: string) => {
    setNotes(v);
    setSaved(false);
    clearTimeout(timer.current);
    timer.current = setTimeout(async () => {
      await saveNotes(project.id, v);
      setSaved(true);
      onRenamed({ ...project, notes: v });
    }, 700);
  };

  useEffect(() => () => clearTimeout(timer.current), []);

  const remove = async () => {
    if (!window.confirm(`Delete "${project.name}"? The chats and ideas inside stay, they just stop being grouped.`)) return;
    await deleteProject(project.id);
    onDeleted();
  };

  return (
    <Page>
      <button
        onClick={onBack}
        className="flex items-center gap-1.5 mb-6 text-[13px] transition-colors hover:text-[var(--text)]"
        style={{ color: 'var(--text-muted)' }}
      >
        <ArrowLeft className="w-4 h-4" /> Projects
      </button>

      <PageHead
        eyebrow="Project"
        title={project.name}
        action={
          <button
            onClick={remove}
            title="Delete this project"
            className="p-2 rounded-[var(--r-sm)] transition-colors"
            style={{ border: '1px solid rgba(var(--danger-rgb),0.25)', color: 'rgb(var(--danger-rgb))' }}
          >
            <Trash2 className="w-4 h-4" />
          </button>
        }
      />

      <Section label="Notes" action={
        <span className="font-mono text-[10px]" style={{ color: saved ? 'var(--text-faint)' : 'var(--process)' }}>
          {saved ? 'saved' : 'saving'}
        </span>
      } className="mt-0">
        <textarea
          value={notes}
          onChange={e => onNotesChange(e.target.value)}
          rows={5}
          placeholder="What are you trying to make here?"
          className="w-full rounded-[var(--r-md)] px-4 py-3 text-[14px] leading-relaxed resize-y focus:outline-none"
          style={{ background: 'var(--bg-raised)', border: '1px solid var(--line)', color: 'var(--text)' }}
        />
      </Section>

      {loading ? (
        <div className="flex justify-center py-10">
          <Loader2 className="w-5 h-5 animate-spin" style={{ color: 'var(--text-faint)' }} />
        </div>
      ) : (
        <>
          <Section label="Conversations">
            {threads.length === 0 ? (
              <Empty icon={<Chat className="w-7 h-7" style={{ color: 'var(--text-faint)' }} />}>
                No chats filed here yet. Save one from Analyze once it has said something worth keeping.
              </Empty>
            ) : (
              <div style={{ borderTop: '1px solid var(--line)' }}>
                {threads.map(t => (
                  <div key={t.id} className="flex items-center gap-4 py-3.5" style={{ borderBottom: '1px solid var(--line)' }}>
                    <Chat className="w-4 h-4 flex-shrink-0" style={{ color: 'var(--text-faint)' }} />
                    <p className="flex-1 min-w-0 text-[14px] truncate" style={{ color: 'var(--text)' }}>
                      {t.title || 'Untitled conversation'}
                    </p>
                    <span className="font-mono text-[11px] flex-shrink-0" style={{ color: 'var(--text-faint)' }}>
                      {formatDate(t.updated_at)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </Section>

          <Section label="Saved ideas">
            {ideas.length === 0 ? (
              <Empty icon={<Bookmark className="w-7 h-7" style={{ color: 'var(--text-faint)' }} />}>
                Nothing filed here from Competitors yet.
              </Empty>
            ) : (
              <div className="space-y-2">
                {ideas.map(i => (
                  <Panel key={i.id} className="p-3.5">
                    <div className="flex items-center gap-2 mb-1.5">
                      {i.outlier_score != null && (
                        <span className="font-mono text-[11px] px-1.5 py-0.5 rounded tabular-nums"
                              style={{ background: 'rgba(var(--process-rgb),0.12)', color: 'var(--process)' }}>
                          {i.outlier_score}x
                        </span>
                      )}
                      <span className="text-[11px] truncate" style={{ color: 'var(--text-muted)' }}>{i.channel_name}</span>
                      <a
                        href={`https://www.youtube.com/watch?v=${i.video_id}`}
                        target="_blank" rel="noopener noreferrer"
                        className="ml-auto font-mono text-[11px] transition-colors hover:text-[var(--text)]"
                        style={{ color: 'var(--text-faint)' }}
                      >
                        watch
                      </a>
                    </div>
                    <p className="text-[13px] font-medium leading-snug" style={{ color: 'var(--text)' }}>
                      {i.video_title || 'Untitled video'}
                    </p>
                    {i.adapted_idea && (
                      <p className="text-[12px] leading-relaxed mt-1.5" style={{ color: 'var(--text-muted)' }}>{i.adapted_idea}</p>
                    )}
                    {i.outline && (
                      <div className="mt-3 pt-3" style={{ borderTop: '1px solid var(--line)' }}>
                        <p className="label-mono mb-2">Outline</p>
                        <p className="text-[12px] leading-relaxed" style={{ color: 'var(--text)' }}>{i.outline.hook}</p>
                        {i.outline.sections?.map((sec, n) => (
                          <p key={n} className="text-[12px] leading-relaxed mt-1.5" style={{ color: 'var(--text-muted)' }}>
                            <span className="font-mono text-[10px] mr-2" style={{ color: 'var(--text-faint)' }}>{sec.duration}</span>
                            {sec.content}
                          </p>
                        ))}
                      </div>
                    )}
                  </Panel>
                ))}
              </div>
            )}
          </Section>
        </>
      )}
    </Page>
  );
}
