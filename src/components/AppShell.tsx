import { useState, useEffect, createContext, useContext, useRef } from 'react';
import { Sparkles, Settings, LogOut, Menu, X, Zap, Users, Handshake, Wand2, Trophy, Home, PanelLeftClose, PanelLeftOpen } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';

export const MobileHeaderContext = createContext<{
  setRightAction: (node: React.ReactNode) => void;
}>({ setRightAction: () => {} });

export type NavTab = 'home' | 'hooks' | 'hooklab' | 'rank' | 'clips' | 'upgrade' | 'settings' | 'partners' | 'competitors' | 'admin';

// Feature flags: tabs hidden from ALL users (incl. admin). Kept in code so they
// can be re-enabled instantly by removing them from this list.
export const HIDDEN_TABS: NavTab[] = ['competitors', 'partners'];

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

// Clip Engine intentionally has no sidebar entry — it's reached from the Home
// hub card instead, so the sidebar stays short.
const baseNavItems: NavItem[] = [
  { id: 'hooks', label: 'Analysis', icon: <Sparkles className="w-4 h-4" /> },
  { id: 'hooklab', label: 'Hook Lab', icon: <Wand2 className="w-4 h-4" /> },
  { id: 'rank', label: 'Rank', icon: <Trophy className="w-4 h-4" /> },
  { id: 'competitors', label: 'Competitors', icon: <Users className="w-4 h-4" /> },
  { id: 'upgrade', label: 'Upgrade', icon: <Zap className="w-4 h-4" />, highlight: true },
  { id: 'settings', label: 'Settings', icon: <Settings className="w-4 h-4" /> },
];

const partnersItem: NavItem = { id: 'partners', label: 'Partners', icon: <Handshake className="w-4 h-4" /> };

// Labels for tabs with no sidebar entry, used only for the mobile header title.
const TAB_LABELS: Partial<Record<NavTab, string>> = { home: 'Hershy', clips: 'Clip Engine' };

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

  return (
    <div className="flex overflow-hidden relative" style={{ background: 'linear-gradient(160deg, #0A0F1A 0%, #0D1B2A 100%)', maxWidth: '100vw', height: '100dvh' }}>
      <svg
        className="absolute inset-0 w-full h-full pointer-events-none"
        xmlns="http://www.w3.org/2000/svg"
        style={{ zIndex: 0 }}
      >
        <defs>
          <pattern id="app-dot-grid" x="0" y="0" width="28" height="28" patternUnits="userSpaceOnUse">
            <circle cx="1" cy="1" r="1" fill="#0EA4E9" fillOpacity="0.12" />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#app-dot-grid)" />
      </svg>

      <aside className={`
        fixed inset-y-0 left-0 z-50 flex flex-col w-56 border-r transition-transform duration-200 ease-in-out
        ${mobileOpen ? 'translate-x-0' : '-translate-x-full'}
        ${collapsed ? 'lg:-translate-x-full' : 'lg:translate-x-0'}
      `} style={{ background: 'rgba(10,15,26,0.8)', borderColor: 'rgba(255,255,255,0.08)', backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)' }}>
        {/* Brand row: one button to Home (never signs the user out), plus a
            desktop-only toggle to collapse the sidebar. */}
        <div className="flex items-center gap-1 px-2 py-3.5 flex-shrink-0" style={{ borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
          <button
            onClick={() => { onTabChange('home'); setMobileOpen(false); }}
            className={`flex-1 min-w-0 flex items-center gap-2 text-left px-2 py-1.5 rounded-lg font-bold tracking-tight transition-all ${
              activeTab === 'home'
                ? 'bg-[#0EA4E9]/15 text-[#0EA4E9] ring-1 ring-inset ring-[#0EA4E9]/20'
                : 'text-white hover:bg-white/5'
            }`}
          >
            <Home className="w-4 h-4 flex-shrink-0" />
            Hershy
          </button>
          <button
            onClick={() => setCollapsed(true)}
            title="Collapse sidebar"
            aria-label="Collapse sidebar"
            className="hidden lg:flex p-2 rounded-lg text-gray-500 hover:text-white hover:bg-white/5 transition-all flex-shrink-0"
          >
            <PanelLeftClose className="w-4 h-4" />
          </button>
        </div>

        <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
          {navItems.map(item => (
            <button
              key={item.id}
              onClick={() => { onTabChange(item.id); setMobileOpen(false); }}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all ${
                activeTab === item.id
                  ? 'bg-[#0EA4E9]/15 text-[#0EA4E9] ring-1 ring-inset ring-[#0EA4E9]/20'
                  : item.highlight
                  ? 'text-amber-400 hover:text-amber-300 hover:bg-amber-400/10'
                  : 'text-gray-400 hover:text-white hover:bg-white/5'
              }`}
            >
              {item.icon}
              <span className="flex-1 text-left">{item.label}</span>
              {item.badge && (
                <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full flex-shrink-0" style={{ background: 'rgba(14,164,233,0.12)', color: '#0EA4E9' }}>
                  {item.badge}
                </span>
              )}
            </button>
          ))}
        </nav>

        <div className="px-3 py-4 flex-shrink-0 space-y-1" style={{ borderTop: '1px solid rgba(255,255,255,0.08)' }}>
          <div className="px-3 py-2">
            <p className="text-xs text-gray-600 truncate">{user?.email}</p>
          </div>
          <button
            onClick={() => signOut()}
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-gray-400 hover:text-white hover:bg-white/5 transition-all"
          >
            <LogOut className="w-4 h-4" />
            Sign Out
          </button>
        </div>
      </aside>

      {mobileOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/60 lg:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {collapsed && (
        <button
          onClick={() => setCollapsed(false)}
          title="Show sidebar"
          aria-label="Show sidebar"
          className="hidden lg:flex fixed top-4 left-4 z-40 p-2 rounded-lg text-gray-400 hover:text-white transition-all"
          style={{ background: 'rgba(10,15,26,0.8)', border: '1px solid rgba(255,255,255,0.08)', backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)' }}
        >
          <PanelLeftOpen className="w-4 h-4" />
        </button>
      )}

      <div className={`flex-1 flex flex-col min-w-0 relative overflow-x-hidden transition-[margin] duration-200 ease-in-out ${collapsed ? 'lg:ml-0' : 'lg:ml-56'}`} style={{ zIndex: 1 }}>
        <header className="lg:hidden sticky top-0 z-30 flex items-center gap-3 px-4 py-3 flex-shrink-0" style={{ borderBottom: '1px solid rgba(255,255,255,0.08)', background: 'rgba(10,15,26,0.95)', backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)' }}>
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
