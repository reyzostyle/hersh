import { VideocameraOutlineIcon as VideoIcon, FolderOutlineIcon as Folder, UsersGroupRoundedOutlineIcon as Users, ArrowRightUpOutlineIcon as ArrowUpRight } from '@solar-icons/react';
import { useAuth } from '../contexts/AuthContext';
import { NavTab, HIDDEN_TABS } from './AppShell';
import { Page, PageHead } from './Page';

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
    id: 'competitors',
    index: '03',
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
    </Page>
  );
}
