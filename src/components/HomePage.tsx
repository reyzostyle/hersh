import { ArrowRightUpOutlineIcon as ArrowUpRight, ChatRoundOutlineIcon as Chat, BookmarkOutlineIcon as Bookmark, LightbulbOutlineIcon as Bulb } from '@solar-icons/react';
import { useAuth } from '../contexts/AuthContext';
import { NavTab, HIDDEN_TABS } from './AppShell';
import { Page, PageHead, Row } from './Page';
import { ChatHistory } from './ChatHistory';
import { displayNameOf, isNewAccount } from '../lib/user';

interface HomePageProps {
  onNavigate: (tab: NavTab) => void;
}

interface Tool {
  id: NavTab;
  label: string;
  icon: React.ReactNode;
}

// The product is three things since 2026-09-29, in the order you use them:
// find an idea, talk it through, keep what worked.
const tools: Tool[] = [
  {
    // The tab is still `competitors` everywhere it is persisted or dispatched.
    // Only the word people read changed - see AppShell for why the id stays.
    id: 'competitors',
    label: 'Ideas',
    icon: <Bulb className="w-[18px] h-[18px]" />,
  },
  {
    // Still `analyze` underneath, for the same reason.
    id: 'analyze',
    label: 'Chat',
    icon: <Chat className="w-[18px] h-[18px]" />,
  },
  {
    id: 'saved',
    label: 'Saved',
    icon: <Bookmark className="w-[18px] h-[18px]" />,
  },
];

export function HomePage({ onNavigate }: HomePageProps) {
  const { user } = useAuth();
  // The name they chose in Settings, or the one Google handed over, before the
  // part of their email in front of the @ - see lib/user.ts.
  const name = displayNameOf(user);
  // Someone who signed up ten minutes ago has nothing to come back to.
  const fresh = isNewAccount(user);
  const visibleTools = tools.filter(t => !HIDDEN_TABS.includes(t.id));

  return (
    <Page>
      <PageHead title={`${fresh ? 'Welcome' : 'Welcome back'}${name ? `, ${name}` : ''}`} />

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
            arrow={<ArrowUpRight className="w-4 h-4 row-arrow" />}
            onClick={() => onNavigate(tool.id)}
          />
        ))}
      </div>

      <ChatHistory />
    </Page>
  );
}
