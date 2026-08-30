import { VideoCamera as VideoIcon, MagicWand as Wand2, FileText, UsersThree as Users, ArrowUpRight } from '@phosphor-icons/react';
import { useAuth } from '../contexts/AuthContext';
import { NavTab, HIDDEN_TABS } from './AppShell';

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
    id: 'video',
    index: '01',
    label: 'Video',
    description: 'Watches the cut and returns timestamped fixes, against your real retention curve.',
    icon: <VideoIcon className="w-[18px] h-[18px]" />,
  },
  {
    id: 'hook',
    index: '02',
    label: 'Hook',
    description: 'Scores an opening line and hands back three finished rewrites.',
    icon: <Wand2 className="w-[18px] h-[18px]" />,
  },
  {
    id: 'script',
    index: '03',
    label: 'Script',
    description: 'Breaks a script down before you film, with the lines to paste.',
    icon: <FileText className="w-[18px] h-[18px]" />,
  },
  {
    id: 'competitors',
    index: '04',
    label: 'Competitors',
    description: 'Surfaces only the shorts beating a channel’s own median, rebuilt for yours.',
    icon: <Users className="w-[18px] h-[18px]" />,
  },
];

export function HomePage({ onNavigate }: HomePageProps) {
  const { user } = useAuth();
  const name = user?.email?.split('@')[0] ?? '';
  const visibleTools = tools.filter(t => !HIDDEN_TABS.includes(t.id));

  return (
    <div className="max-w-3xl mx-auto px-5 sm:px-8 pt-12 sm:pt-20 pb-16">
      <p className="label-mono mb-4">Workspace</p>

      <h1 className="display text-white mb-3">
        {name ? `Welcome back, ${name}` : 'Welcome back'}
      </h1>
      <p className="text-[15px] text-white/40 mb-12 max-w-md">
        Pick a tool and get to work.
      </p>

      {/* A single column, not a grid of small cards. Fewer, larger rows read as
          deliberate; four tiles of the same weight read as a template. */}
      <div style={{ borderTop: '1px solid var(--line)' }}>
        {visibleTools.map(tool => (
          <button
            key={tool.id}
            onClick={() => onNavigate(tool.id)}
            className="group w-full text-left flex items-start gap-5 py-5 transition-colors"
            style={{ borderBottom: '1px solid var(--line)' }}
          >
            <span className="font-mono text-[11px] text-white/25 pt-1 w-6 flex-shrink-0 tabular-nums">
              {tool.index}
            </span>
            <span className="text-white/40 pt-0.5 flex-shrink-0 transition-colors group-hover:text-white">
              {tool.icon}
            </span>
            <span className="flex-1 min-w-0">
              <span className="block text-[15px] font-medium text-white mb-1">{tool.label}</span>
              <span className="block text-[13px] leading-relaxed text-white/40 text-balance">
                {tool.description}
              </span>
            </span>
            <ArrowUpRight className="w-4 h-4 text-white/15 flex-shrink-0 mt-1 transition-colors group-hover:text-white" />
          </button>
        ))}
      </div>
    </div>
  );
}
