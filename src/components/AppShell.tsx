import { useState, useEffect, createContext, useContext, useRef } from 'react';
import { FolderOutlineIcon as Folder, SettingsOutlineIcon as Settings, LogoutOutlineIcon as LogOut, HamburgerMenuOutlineIcon as Menu, CloseCircleOutlineIcon as X, BoltOutlineIcon as Zap, UsersGroupRoundedOutlineIcon as Users, HandShakeOutlineIcon as Handshake, ChartSquareOutlineIcon as BarChart2, SidebarMinimalisticOutlineIcon as PanelLeftClose, SidebarMinimalisticOutlineIcon as PanelLeftOpen, VideocameraOutlineIcon as VideoIcon } from '@solar-icons/react';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';

// Bold, filled house glyph — lucide's Home is a thin outline and reads too
// light next to the font-black wordmark next to it.
function HubIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className}>
      <path d="M12 2.7 2.5 10.8v10.5h6.2v-6.8h6.6v6.8h6.2V10.8L12 2.7Z" />
    </svg>
  );
}

export const MobileHeaderContext = createContext<{
  setRightAction: (node: React.ReactNode) => void;
}>({ setRightAction: () => {} });

export type NavTab = 'home' | 'analyze' | 'projects' | 'analytics' | 'competitors' | 'usage' | 'upgrade' | 'settings' | 'partners' | 'admin';

// Feature flags: tabs hidden from ALL users (incl. admin). Kept in code so they
// can be re-enabled instantly by removing them from this list.
export const HIDDEN_TABS: NavTab[] = [];

const ADMIN_EMAIL = 'reyzostyle@gmail.com';

interface NavItem {
  id: NavTab;
  label: string;
  icon: React.ReactNode;
  highlight?: boolean;
  badge?: string;
}

interface AppShellProps {
  activeTab: NavTab;
  onTabChange: (tab: NavTab) => void;
  children: React.ReactNode;
}

// One flat list. The Analyze sub-panel used to hold Video/Hook/Script in a
// second column, which cost a whole column on desktop and had nowhere sensible
// to live on a phone. They are tabs like everything else now.
const baseNavItems: NavItem[] = [
  // Hook and Script folded into Analyze. They were three doors into one room:
  // the chat takes a link, a hook or a script and answers in the same thread,
  // so splitting them cost a tab each and taught the user a distinction the
  // product no longer makes.
  { id: 'analyze', label: 'Analyze', icon: <VideoIcon className="w-4 h-4" /> },
  { id: 'projects', label: 'Projects', icon: <Folder className="w-4 h-4" /> },
  { id: 'competitors', label: 'Competitors', icon: <Users className="w-4 h-4" /> },
  { id: 'usage', label: 'Usage', icon: <BarChart2 className="w-4 h-4" /> },
  { id: 'upgrade', label: 'Upgrade', icon: <Zap className="w-4 h-4" />, highlight: true },
  { id: 'settings', label: 'Settings', icon: <Settings className="w-4 h-4" /> },
];

const partnersItem: NavItem = { id: 'partners', label: 'Partners', icon: <Handshake className="w-4 h-4" /> };

// Labels for tabs with no sidebar entry, used only for the mobile header title.
const TAB_LABELS: Partial<Record<NavTab, string>> = { home: 'Hershy' };

const SIDEBAR_COLLAPSED_KEY = 'hershy_sidebar_collapsed';

export function AppShell({ activeTab, onTabChange, children }: AppShellProps) {
  const { user, signOut } = useAuth();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === '1');
  const [isPartner, setIsPartner] = useState(false);
  const [rightAction, setRightAction] = useState<React.ReactNode>(null);

  useEffect(() => {
    localStorage.setItem(SIDEBAR_COLLAPSED_KEY, collapsed ? '1' : '0');
  }, [collapsed]);

  const isAdmin = user?.email === ADMIN_EMAIL;
  const mainRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const el = mainRef.current;
    if (!el) return;
    const onTouchMove = (e: TouchEvent) => {
      if (el.scrollHeight <= el.clientHeight) {
        e.preventDefault();
      }
    };
    el.addEventListener('touchmove', onTouchMove, { passive: false });
    return () => el.removeEventListener('touchmove', onTouchMove);
  }, []);

  useEffect(() => {
    if (!user || isAdmin) return;
    supabase
      .from('referral_codes')
      .select('id')
      .eq('owner_user_id', user.id)
      .maybeSingle()
      .then(({ data }) => setIsPartner(!!data));
  }, [user?.id]);

  // Partners sits directly above Upgrade, and only for admins/partners.
  const navItems = baseNavItems
    .flatMap(item => (item.id === 'upgrade' && (isAdmin || isPartner) ? [partnersItem, item] : [item]))
    .filter(item => !HIDDEN_TABS.includes(item.id));

  const BOTTOM_TAB_IDS: NavTab[] = ['partners', 'usage', 'upgrade', 'settings'];
  const topNavItems = navItems.filter(item => !BOTTOM_TAB_IDS.includes(item.id));
  const bottomNavItems = navItems.filter(item => BOTTOM_TAB_IDS.includes(item.id));

  const renderNavButton = (item: NavItem) => (
    <button
      key={item.id}
      onClick={() => { onTabChange(item.id); setMobileOpen(false); }}
      title={item.label}
      className={`relative w-full flex items-center gap-3 px-3 py-2 rounded-md text-[13px] font-medium transition-colors ${
        activeTab === item.id
          ? 'text-white'
          : 'text-white/45 hover:text-white/80'
      }`}
      style={activeTab === item.id ? { background: 'var(--bg-raised)' } : undefined}
    >
            {item.icon}
      <span className={`flex-1 text-left whitespace-nowrap ${collapsed ? 'lg:hidden' : ''}`}>{item.label}</span>
      {item.badge && (
        <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full flex-shrink-0 ${collapsed ? 'lg:hidden' : ''}`} style={{ background: 'rgba(var(--accent-rgb),0.12)', color: 'var(--accent)' }}>
          {item.badge}
        </span>
      )}
    </button>
  );

  return (
    <div className="flex overflow-hidden relative" style={{ background: 'var(--bg-app)', maxWidth: '100vw', height: '100dvh' }}>
      <div className="absolute inset-0 pointer-events-none grid-surface" style={{ zIndex: 0 }} />

      {/* Collapsing narrows the sidebar to an icon rail rather than hiding it, so
          every tab stays one click away. On phones this is always the full-width
          drawer — `collapsed` is a desktop-only idea. */}
      {/* overflow-hidden matters for the collapse animation: labels are clipped
          by the narrowing panel instead of re-wrapping inside it. */}
      <aside className={`
        fixed inset-y-0 left-0 z-50 flex flex-col w-56 border-r overflow-hidden transition-all duration-200 ease-in-out
        ${mobileOpen ? 'translate-x-0' : '-translate-x-full'} lg:translate-x-0
        ${collapsed ? 'lg:w-16' : 'lg:w-56'}
      `} style={{ background: 'var(--bg-app)', borderColor: 'var(--line)' }}>
        {/* Brand row: single full-width button to Home, never signs the user out.
            The collapse toggle lives outside the sidebar (see below), Higgsfield-style. */}
        <div className="px-3 py-3.5 flex-shrink-0" style={{ borderBottom: '1px solid var(--line)' }}>
          <button
            onClick={() => { onTabChange('home'); setMobileOpen(false); }}
            title="Hershy"
            className="w-full flex items-center gap-3 px-3 py-1 rounded-lg font-semibold tracking-tight text-[15px] transition-colors group"
          >
            <HubIcon
              className={`w-4 h-4 flex-shrink-0 transition-colors ${activeTab === 'home' ? 'text-[var(--accent)]' : 'text-white group-hover:text-[var(--accent)]'}`}
            />
            {/* Icon and wordmark are one button, so hovering either turns both
                the same blue. The uppercase wordmark sits on a taller line box
                than the icon, which is what made the two look a pixel out of
                line; leading-none drops that extra space. */}
            <span className={`leading-none whitespace-nowrap transition-colors ${activeTab === 'home' ? 'text-[var(--accent)]' : 'text-white group-hover:text-[var(--accent)]'} ${collapsed ? 'lg:hidden' : ''}`}>
              Hershy
            </span>
          </button>
        </div>

        <nav className="flex-1 flex flex-col px-3 py-4 overflow-y-auto">
          <div className="space-y-0.5">
            {topNavItems.map(item => renderNavButton(item))}
          </div>
          {/* Upgrade/Partners/Settings sit apart from the main tools, pinned
              toward the bottom of the sidebar (just above Sign Out) instead
              of inline in the tool list. */}
          <div className="mt-auto pt-4 space-y-0.5" style={{ borderTop: '1px solid rgba(255,255,255,0.08)' }}>
            {bottomNavItems.map(item => renderNavButton(item))}
          </div>
        </nav>

        <div className="px-3 py-4 flex-shrink-0 space-y-1" style={{ borderTop: '1px solid rgba(255,255,255,0.08)' }}>
          <div className={`px-3 py-2 ${collapsed ? 'lg:hidden' : ''}`}>
            <p className="text-xs text-gray-600 truncate">{user?.email}</p>
          </div>
          <button
            onClick={() => signOut()}
            title={collapsed ? `Sign out (${user?.email ?? ''})` : 'Sign Out'}
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-gray-400 hover:text-white hover:bg-white/5 transition-all"
          >
            <LogOut className="w-4 h-4 flex-shrink-0" />
            <span className={`whitespace-nowrap ${collapsed ? 'lg:hidden' : ''}`}>Sign Out</span>
          </button>
        </div>
      </aside>

      {mobileOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/60 lg:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* Collapse toggle: lives outside the sidebar, like Higgsfield's — hangs
          just past the sidebar's edge when open, and at the far left when closed. */}
      <button
        onClick={() => setCollapsed(c => !c)}
        title={collapsed ? 'Show sidebar' : 'Collapse sidebar'}
        aria-label={collapsed ? 'Show sidebar' : 'Collapse sidebar'}
        className={`hidden lg:flex fixed top-4 z-40 p-2 rounded-lg text-gray-500 hover:text-white transition-all duration-200 ${collapsed ? 'left-[4.5rem]' : 'left-[15rem]'}`}
        style={{ background: 'rgba(var(--surface-rgb),0.8)', border: '1px solid rgba(255,255,255,0.08)', backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)' }}
      >
        {collapsed ? <PanelLeftOpen className="w-4 h-4" /> : <PanelLeftClose className="w-4 h-4" />}
      </button>

      <div className={`flex-1 flex flex-col min-w-0 relative overflow-x-hidden transition-[margin] duration-200 ease-in-out ${collapsed ? 'lg:ml-16' : 'lg:ml-56'}`} style={{ zIndex: 1 }}>
        <header className="lg:hidden sticky top-0 z-30 flex items-center gap-3 px-4 py-3 flex-shrink-0" style={{ borderBottom: '1px solid rgba(255,255,255,0.08)', background: 'rgba(var(--surface-rgb),0.95)', backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)' }}>
          <button
            onClick={() => setMobileOpen(!mobileOpen)}
            className="p-2 text-gray-400 hover:text-white transition-colors flex-shrink-0"
          >
            {mobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
          <span className="flex-1 text-white font-semibold text-sm">
            {navItems.find(i => i.id === activeTab)?.label ?? TAB_LABELS[activeTab] ?? 'Hershy'}
          </span>
          {rightAction}
        </header>

        <main ref={mainRef} key={activeTab} className="flex-1 overflow-auto animate-tab-in" style={{ background: 'transparent', overscrollBehavior: 'none' }}>
          <MobileHeaderContext.Provider value={{ setRightAction }}>
            {children}
          </MobileHeaderContext.Provider>
        </main>
      </div>
    </div>
  );
}
