import { useState, useEffect } from 'react';
import { AppShell, NavTab, HIDDEN_TABS } from './AppShell';
import { HomePage } from './HomePage';
import { HookAnalysis } from './HookAnalysis';
import { HookLab } from './HookLab';
import { ClipEnginePage } from './ClipEnginePage';
import { UpgradePage } from './UpgradePage';
import { SettingsPage } from './SettingsPage';
import { PartnersPage } from './PartnersPage';
import { CompetitorsPage } from './CompetitorsPage';
import { RankPage } from './RankPage';
import { AdminPage } from './AdminPage';

const TAB_STORAGE_KEY = 'hershy_active_tab';
// 'admin' is intentionally reachable but has no sidebar entry (see AppShell) —
// only reached by entering the admin code in Settings. AdminPage itself
// re-checks the caller's email before rendering anything or fetching data.
// 'home' also has no nav entry: it's reached from the brand row in the sidebar.
const VALID_TABS: NavTab[] = ['home', 'hooks', 'hooklab', 'rank', 'clips', 'competitors', 'upgrade', 'partners', 'settings', 'admin'];

// A tab is reachable only if it's known and not feature-flagged off.
const isTabReachable = (t: string): t is NavTab =>
  (VALID_TABS as string[]).includes(t) && !HIDDEN_TABS.includes(t as NavTab);

export function Dashboard() {
  const [activeTab, setActiveTab] = useState<NavTab>(() => {
    const saved = localStorage.getItem(TAB_STORAGE_KEY);
    return saved && isTabReachable(saved) ? (saved as NavTab) : 'home';
  });

  // Remember the current tab across reloads.
  useEffect(() => {
    localStorage.setItem(TAB_STORAGE_KEY, activeTab);
  }, [activeTab]);

  useEffect(() => {
    const handler = (e: Event) => {
      const tab = (e as CustomEvent).detail as NavTab;
      if (tab && isTabReachable(tab)) setActiveTab(tab);
    };
    window.addEventListener('hershy:navigate', handler);
    return () => window.removeEventListener('hershy:navigate', handler);
  }, []);

  // Handle return from Notion OAuth (callback redirects to /?notion=connected|error)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const notion = params.get('notion');
    if (!notion) return;
    import('../lib/toast').then(({ showToast }) => {
      if (notion === 'connected') { showToast('Notion connected ✓'); setActiveTab('settings'); }
      else showToast('Notion connection failed', 'error');
    });
    window.history.replaceState({}, '', window.location.pathname);
  }, []);

  return (
    <AppShell activeTab={activeTab} onTabChange={setActiveTab}>
      {activeTab === 'home' && <HomePage onNavigate={setActiveTab} />}
      {activeTab === 'hooks' && <HookAnalysis />}
      {activeTab === 'hooklab' && <HookLab />}
      {activeTab === 'clips' && <ClipEnginePage />}
      {activeTab === 'rank' && <RankPage />}
      {activeTab === 'competitors' && <CompetitorsPage />}
      {activeTab === 'upgrade' && <UpgradePage />}
      {activeTab === 'partners' && <PartnersPage />}
      {activeTab === 'settings' && <SettingsPage />}
      {activeTab === 'admin' && <AdminPage />}
    </AppShell>
  );
}
