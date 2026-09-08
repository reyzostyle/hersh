import { useState, useEffect } from 'react';
import { VideocameraOutlineIcon as VideoIcon, FolderOutlineIcon as Folder, UsersGroupRoundedOutlineIcon as Users, GraphUpOutlineIcon as GraphUp, ArrowRightUpOutlineIcon as ArrowUpRight, ChatRoundOutlineIcon as Chat, CloseCircleOutlineIcon as Remove, PenOutlineIcon as Pen, FolderOutlineIcon as FolderIcon } from '@solar-icons/react';
import { useAuth } from '../contexts/AuthContext';
import { NavTab, HIDDEN_TABS } from './AppShell';
import { Page, PageHead, Section, EditActions, Row } from './Page';
import { listRecentThreads, deleteThread, renameThread, requestOpenThread, fileThread, listProjects, createProject, type RecentThread, type Project } from '../lib/projects';
import { SaveToProjectModal } from './SaveToProjectModal';
import { formatDate } from '../lib/competitors';

interface HomePageProps {
  onNavigate: (tab: NavTab) => void;
}

interface Tool {
  id: NavTab;
  label: string;
  description: string;
  icon: React.ReactNode;
}

// The mono numerals are gone with the rules they sat on. Numbering a list is
// what a contents page does, and that was the whole problem: it read as an
// index of the product rather than as four things you press.
const tools: Tool[] = [
  {
    id: 'analyze',
    label: 'Analyze',
    description: 'Send a link, a hook or a script and talk it through until you know what to change.',
    icon: <VideoIcon className="w-[18px] h-[18px]" />,
  },
  {
    // The tab is still `competitors` everywhere it is persisted or dispatched.
    // Only the word people read changed - see AppShell for why the id stays.
    id: 'competitors',
    label: 'Ideas',
    description: 'Steal the shorts beating the channel they came from, remade for yours.',
    icon: <Users className="w-[18px] h-[18px]" />,
  },
  {
    id: 'projects',
    label: 'Projects',
    description: 'Keep the conversation, the reference video and the ideas off it in one place.',
    icon: <Folder className="w-[18px] h-[18px]" />,
  },
  {
    id: 'analytics',
    label: 'Analytics',
    description: 'Your own numbers from YouTube, and the shape your last analysed videos came out at.',
    icon: <GraphUp className="w-[18px] h-[18px]" />,
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

      {/* Raised rows rather than ruled ones. The hairline version read as a
          contents page - handsome, and nothing about it said the four lines
          were buttons, which is exactly the complaint. Same object as Projects,
          Settings and the landing page now. */}
      <div className="row-list">
        {visibleTools.map(tool => (
          <Row
            key={tool.id}
            icon={tool.icon}
            title={tool.label}
            subtitle={tool.description}
            arrow={<ArrowUpRight className="w-4 h-4 row-arrow" />}
            onClick={() => onNavigate(tool.id)}
          />
        ))}
      </div>

      <RecentChats />
    </Page>
  );
}

const HISTORY_NOTE = 'Every analysis you have run. Open one to pick the conversation back up.';

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
      <Section label="Chat history" note={HISTORY_NOTE}>
        <div className="row-list">
          {[0, 1, 2].map(i => (
            <div key={i} className="row">
              <span className="row-icon" />
              <span className="h-3 rounded skeleton" style={{ width: `${58 - i * 11}%` }} />
              <span className="ml-auto h-3 w-10 rounded skeleton" />
            </div>
          ))}
        </div>
      </Section>
    );
  }

  return (
    // "Recent" named when they happened, not what they are, and the rules
    // under it read as a footnote to the tools above rather than as the record
    // of every conversation in the account. It says what it is now, with a
    // line under the label saying what pressing one does - and the rows are
    // the same plate as everything else on the page.
    <Section label="Chat history" note={HISTORY_NOTE}>
      <div className="row-list">
        {threads.map(t => (
          renamingId === t.id ? (
            <div key={t.id} className="row">
              <span className="row-icon"><Chat className="w-[18px] h-[18px]" /></span>
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
                className="flex-1 min-w-0 bg-transparent text-[15px] focus:outline-none"
                style={{ color: 'var(--text)', borderBottom: '1px solid var(--line-strong)' }}
              />
              <EditActions onSave={() => commitRename(t)} onCancel={() => setRenamingId(null)} />
            </div>
          ) : (
            <Row
              key={t.id}
              icon={<Chat className="w-[18px] h-[18px]" />}
              title={t.title || 'Untitled conversation'}
              meta={formatDate(t.updated_at)}
              onClick={() => requestOpenThread(t.id)}
              /* All three stay visible. They were revealed on hover to keep the
                 list quiet, which cost more than it bought: a phone has no
                 hover, so rename and delete were simply unreachable there, and
                 a control nobody can see is a control nobody knows exists. They
                 sit at the faint end of the palette instead, and brighten when
                 the cursor reaches them. The folder is a step brighter once the
                 conversation is filed, because which project it is in is
                 information rather than an action. */
              actions={<>
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
              </>}
            />
          )
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
