import { useEffect, useState } from 'react';
import { ArrowRightUpOutlineIcon as ArrowUpRight, ChatRoundOutlineIcon as Chat, BookmarkOutlineIcon as Bookmark, LightbulbOutlineIcon as Bulb, SettingsOutlineIcon as Gear } from '@solar-icons/react';
import { supabase } from '../lib/supabase';
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

// Settings on the hub, but only when it is owed a visit.
//
// A permanent Settings row would be a fourth line next to the three things the
// product does, for a screen the sidebar already reaches and most people open
// twice. What IS worth a row is the one setting that changes how good the
// other three are: ideas are pitched against the brain, and the brain reads the
// channel. So the row shows while the channel is not connected (or, connected,
// while there is no brain yet) and disappears once it is done.
//
// The last answer is remembered so the row is there from the first paint
// instead of arriving a beat later and pushing the history down.
type Missing = 'youtube' | 'brain' | null;
const MISSING_KEY = 'chumoku_hub_missing';
const MISSING_ROW: Record<'youtube' | 'brain', string> = {
  youtube: 'Connect your YouTube channel',
  brain: 'Build your Chumoku brain',
};

function useMissingSetup(userId?: string): Missing {
  const [missing, setMissing] = useState<Missing>(() => {
    try { return (localStorage.getItem(MISSING_KEY) as Missing) || null; } catch { return null; }
  });
  useEffect(() => {
    if (!userId) return;
    let alive = true;
    supabase.from('user_tokens').select('access_token, brain').eq('user_id', userId).maybeSingle()
      .then(({ data, error }) => {
        if (!alive || error) return;
        const next: Missing = !data?.access_token ? 'youtube' : !data?.brain ? 'brain' : null;
        setMissing(next);
        try {
          if (next) localStorage.setItem(MISSING_KEY, next); else localStorage.removeItem(MISSING_KEY);
        } catch { /* private mode */ }
      });
    return () => { alive = false; };
  }, [userId]);
  return missing;
}

export function HomePage({ onNavigate }: HomePageProps) {
  const { user } = useAuth();
  const missing = useMissingSetup(user?.id);
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
        {missing && (
          <Row
            icon={<Gear className="w-[18px] h-[18px]" />}
            title={MISSING_ROW[missing]}
            arrow={<ArrowUpRight className="w-4 h-4 row-arrow" />}
            onClick={() => {
              // Settings opens on the card this row is about.
              try { localStorage.setItem('chumoku_open_settings', missing); } catch { /* opens closed */ }
              onNavigate('settings');
            }}
          />
        )}
      </div>

      <ChatHistory />
    </Page>
  );
}
