import { Sparkles, Wand2, Trophy, Scissors, Users, ArrowRight } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { NavTab, HIDDEN_TABS } from './AppShell';

interface HomePageProps {
  onNavigate: (tab: NavTab) => void;
}

interface Tool {
  id: NavTab;
  label: string;
  description: string;
  icon: React.ReactNode;
  badge?: string;
}

const tools: Tool[] = [
  {
    id: 'hooks',
    label: 'Analysis',
    description: 'Score any short and see the exact second where it starts losing people.',
    icon: <Sparkles className="w-5 h-5" />,
  },
  {
    id: 'hooklab',
    label: 'Hook Lab',
    description: 'Test hook lines before you spend a whole day filming the video.',
    icon: <Wand2 className="w-5 h-5" />,
  },
  {
    id: 'rank',
    label: 'Rank',
    description: 'Track how your channel actually moves from season to season.',
    icon: <Trophy className="w-5 h-5" />,
  },
  {
    id: 'clips',
    label: 'Clip Engine',
    description: 'Your streams get watched and cut into clips that are ready to post.',
    icon: <Scissors className="w-5 h-5" />,
    badge: 'New',
  },
  {
    id: 'competitors',
    label: 'Competitors',
    description: 'See what is working for the channels you are up against.',
    icon: <Users className="w-5 h-5" />,
  },
];

export function HomePage({ onNavigate }: HomePageProps) {
  const { user } = useAuth();
  const name = user?.email?.split('@')[0] ?? '';
  const visibleTools = tools.filter(t => !HIDDEN_TABS.includes(t.id));

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 pt-6 sm:pt-10 pb-12 animate-fade-in-up">
      <div className="mb-7 sm:mb-9">
        <h1 className="text-2xl sm:text-3xl font-bold text-white mb-1.5 tracking-tight">
          Welcome back{name ? `, ${name}` : ''}
        </h1>
        <p className="text-sm text-gray-500">Pick a tool and get to work.</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
        {visibleTools.map((tool, i) => (
          <button
            key={tool.id}
            onClick={() => onNavigate(tool.id)}
            className="group text-left p-5 rounded-xl motion-card glass-panel animate-fade-in-up"
            style={{ animationDelay: `${i * 70}ms` }}
          >
            <div className="flex items-center gap-2.5 mb-2.5">
              <span className="text-[#0EA4E9] flex-shrink-0">{tool.icon}</span>
              <span className="text-white font-semibold">{tool.label}</span>
              {tool.badge && (
                <span
                  className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full flex-shrink-0"
                  style={{ background: 'rgba(14,164,233,0.12)', color: '#0EA4E9' }}
                >
                  {tool.badge}
                </span>
              )}
              <ArrowRight className="w-4 h-4 text-gray-600 ml-auto flex-shrink-0 transition-all group-hover:text-[#0EA4E9] group-hover:translate-x-0.5" />
            </div>
            <p className="text-sm text-gray-400 leading-relaxed">{tool.description}</p>
          </button>
        ))}
      </div>
    </div>
  );
}
