import { useState, useEffect } from 'react';
import { VideocameraOutlineIcon as VideoIcon, FolderOutlineIcon as Folder, UsersGroupRoundedOutlineIcon as Users, GraphUpOutlineIcon as GraphUp, ArrowRightUpOutlineIcon as ArrowUpRight, ChatRoundOutlineIcon as Chat, CloseCircleOutlineIcon as Remove, PenOutlineIcon as Pen, FolderOutlineIcon as FolderIcon } from '@solar-icons/react';
import { useAuth } from '../contexts/AuthContext';
import { NavTab, HIDDEN_TABS } from './AppShell';
import { Page, PageHead, Section, EditActions } from './Page';
import { listRecentThreads, deleteThread, renameThread, requestOpenThread, fileThread, listProjects, createProject, type RecentThread, type Project } from '../lib/projects';
import { SaveToProjectModal } from './SaveToProjectModal';
import { formatDate } from '../lib/competitors';

interface HomePageProps {
  onNavigate: (tab: NavTab) => void;
}

interface Tool {
  id: NavTab;
  index: string;
  label: string;
  description: string;
  icon: React.ReactNode;
}

// Numbered like a contents page. It gives the grid an order to read in, and the
// mono numerals are the same voice used for scores and timestamps elsewhere.
const tools: Tool[] = [
  {
    id: 'analyze',
    index: '01',
    label: 'Analyze',
    description: 'Send a link, a hook or a script and talk it through until you know what to change.',
    icon: <VideoIcon className="w-[18px] h-[18px]" />,
  },
  {
    id: 'projects',
    index: '02',
    label: 'Projects',
    description: 'Keep the conversation, the reference video and the ideas off it in one place.',
    icon: <Folder className="w-[18px] h-[18px]" />,
  },
  {
    id: 'analytics',
    index: '03',
    label: 'Analytics',
    description: 'Your own numbers from YouTube, and the shape your last analysed videos came out at.',
    icon: <GraphUp className="w-[18px] h-[18px]" />,
  },
  {
    id: 'competitors',
    index: '04',
    label: 'Competitors',
    description: 'Surfaces only the shorts beating a channel\'s own median, rebuilt for yours.',
    icon: <Users className="w-[18px] h-[18px]" />,
  },
];

export function HomePage({ onNavigate }: HomePageProps) {
  const { user } = useAuth();
  const name = user?.email?.split('@')[0] ?? '';
  const visibleTools = tools.filter(t => !HIDDEN_TABS.includes(t.id));

  return (
    <Page>
      <PageHead
        eyebrow="Workspace"
        title={name ? `Welcome back, ${name}` : 'Welcome back'}
        subtitle="Pick a tool and get to work."
      />

      {/* A single column, not a grid of small cards. Fewer, larger rows read as
          deliberate; four tiles of the same weight read as a template. The rows
          sit on the sheet, so the hairline between two of them is the only
          horizontal line the eye has to resolve — the ruled grid used to add a
          second one at a slightly different grey, right through the copy. */}
      <div style={{ borderTop: '1px solid var(--line)' }}>
        {visibleTools.map(tool => (
          <button
            key={tool.id}
            onClick={() => onNavigate(tool.id)}
            className="group w-full text-left flex items-start gap-5 py-5 transition-colors"
            style={{ borderBottom: '1px solid var(--line)' }}
          >
            <span className="font-mono text-[11px] pt-1 w-6 flex-shrink-0 tabular-nums" style={{ color: 'var(--text-faint)' }}>
              {tool.index}
            </span>
            <span className="pt-0.5 flex-shrink-0 transition-colors group-hover:text-[var(--text)]" style={{ color: 'var(--text-muted)' }}>
              {tool.icon}
            </span>
            <span className="flex-1 min-w-0">
              <span className="block text-[15px] font-medium mb-1" style={{ color: 'var(--text)' }}>{tool.label}</span>
              <span className="block text-[13px] leading-relaxed text-balance" style={{ color: 'var(--text-muted)' }}>
                {tool.description}
              </span>
            </span>
            <ArrowUpRight className="w-4 h-4 flex-shrink-0 mt-1 transition-colors group-hover:text-[var(--text)]" style={{ color: 'var(--text-faint)' }} />
          </button>
        ))}
      </div>

      <RecentChats />
    </Page>
  );
}

// Chat history lives here rather than in Analyze. Analyze's empty screen is a
// headline and a composer, and putting a list under it would turn the one
// uncluttered surface in the product into a dashboard. The hub, meanwhile, was
// three links that also exist in the sidebar - it had nothing of its own to
// show. Now it shows the work.
function RecentChats() {
  const [threads, setThreads] = useState<RecentThread[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  // Projects load only when the picker is opened - most conversations are
  // never filed, and the hub should not pay for that on every visit.
  const [projects, setProjects] = useState<Project[]>([]);
  const [filing, setFiling] = useState<RecentThread | null>(null);

  useEffect(() => {
    listRecentThreads().then(setThreads).finally(() => setLoaded(true));
  }, []);

  const remove = async (id: string) => {
    setThreads(prev => prev.filter(t => t.id !== id));
    await deleteThread(id);
  };

  const commitRename = async (t: RecentThread) => {
    const title = draft.trim();
    setRenamingId(null);
    if (!title || title === t.title) return;
    setThreads(prev => prev.map(x => (x.id === t.id ? { ...x, title } : x)));
    await renameThread(t.id, title);
  };

  const openFiling = async (t: RecentThread) => {
    setProjects(await listProjects());
    setFiling(t);
  };

  const fileInto = async (projectId: string | null) => {
    if (!filing) return;
    await fileThread(filing.id, projectId);
    setThreads(prev => prev.map(x => (x.id === filing.id ? { ...x, project_id: projectId } : x)));
    setFiling(null);
  };

  // Three states, not two. Rendering nothing until the query came back meant
  // the section appeared out of nowhere a moment after the page settled, which
  // shifted everything under it. Skeleton rows hold the space at the height the
  // real rows will occupy, so the list fills in rather than arrives.
  //
  // Nothing at all is still nothing: an empty account should not be told it has
  // no history on the screen it lands on.
  if (loaded && threads.length === 0) return null;

  if (!loaded) {
    return (
      <Section label="Recent">
        <div style={{ borderTop: '1px solid var(--line)' }}>
          {[0, 1, 2].map(i => (
            <div key={i} className="flex items-center gap-4 py-3.5" style={{ borderBottom: '1px solid var(--line)' }}>
              <span className="w-4 h-4 rounded-full flex-shrink-0 skeleton" />
              <span className="h-3 rounded skeleton" style={{ width: `${58 - i * 11}%` }} />
              <span className="ml-auto h-3 w-10 rounded skeleton" />
            </div>
          ))}
        </div>
      </Section>
    );
  }

  return (
    <Section label="Recent">
      <div style={{ borderTop: '1px solid var(--line)' }}>
        {threads.map(t => (
          <div key={t.id} className="flex items-center gap-2 group" style={{ borderBottom: '1px solid var(--line)' }}>
            {renamingId === t.id ? (
              <div className="flex-1 min-w-0 flex items-center gap-4 py-3.5">
                <Chat className="w-4 h-4 flex-shrink-0" style={{ color: 'var(--text-faint)' }} />
                <input
                  autoFocus
                  value={draft}
                  onChange={e => setDraft(e.target.value)}
                  onBlur={() => commitRename(t)}
                  onKeyDown={e => {
                    if (e.key === 'Enter') commitRename(t);
                    if (e.key === 'Escape') setRenamingId(null);
                  }}
                  maxLength={120}
                  className="flex-1 min-w-0 bg-transparent text-[14px] focus:outline-none"
                  style={{ color: 'var(--text)', borderBottom: '1px solid var(--line-strong)' }}
                />
                <EditActions onSave={() => commitRename(t)} onCancel={() => setRenamingId(null)} />
              </div>
            ) : (
              <button
                onClick={() => requestOpenThread(t.id)}
                className="flex-1 min-w-0 flex items-center gap-4 py-3.5 text-left"
              >
                <Chat className="w-4 h-4 flex-shrink-0" style={{ color: 'var(--text-faint)' }} />
                <span className="flex-1 min-w-0 text-[14px] truncate" style={{ color: 'var(--text)' }}>
                  {t.title || 'Untitled conversation'}
                </span>
                <span className="font-mono text-[11px] flex-shrink-0" style={{ color: 'var(--text-faint)' }}>
                  {formatDate(t.updated_at)}
                </span>
              </button>
            )}

            {/* All three stay visible. They were revealed on hover to keep the
                list quiet, which cost more than it bought: a phone has no
                hover, so rename and delete were simply unreachable there, and
                a control nobody can see is a control nobody knows exists. They
                sit at the faint end of the palette instead, and brighten when
                the cursor reaches them. The folder is a step brighter once the
                conversation is filed, because which project it is in is
                information rather than an action. */}
            <div className={`flex items-center gap-1 flex-shrink-0 ${renamingId === t.id ? 'hidden' : ''}`}>
              <button
                onClick={() => openFiling(t)}
                title={t.project_id ? 'Change project' : 'Save to a project'}
                className="p-1 transition-colors hover:text-[var(--text)]"
                style={{ color: t.project_id ? 'var(--text-muted)' : 'var(--text-faint)' }}
              >
                <FolderIcon className="w-4 h-4" />
              </button>
              <button
                onClick={() => { setDraft(t.title || ''); setRenamingId(t.id); }}
                title="Rename"
                className="p-1 transition-colors hover:text-[var(--text)]"
                style={{ color: 'var(--text-faint)' }}
              >
                <Pen className="w-4 h-4" />
              </button>
              <button
                onClick={() => remove(t.id)}
                title="Delete this conversation"
                className="p-1 transition-colors hover:text-[rgb(var(--danger-rgb))]"
                style={{ color: 'var(--text-faint)' }}
              >
                <Remove className="w-4 h-4" />
              </button>
            </div>
          </div>
        ))}
      </div>

      {filing && (
        <SaveToProjectModal
          projects={projects}
          currentProjectId={filing.project_id}
          isSaved={!!filing.project_id}
          onPick={fileInto}
          onUnsave={() => fileInto(null)}
          onCreateProject={async name => {
            const project = await createProject(name);
            if (project) setProjects(prev => [project, ...prev]);
            return project;
          }}
          onClose={() => setFiling(null)}
        />
      )}
    </Section>
  );
}
