import { useState, useEffect } from 'react';
import { AppShell, NavTab, HIDDEN_TABS } from './AppShell';
import { HomePage } from './HomePage';
import { AnalysisChat } from './AnalysisChat';
import { ProjectsPage } from './ProjectsPage';
import { AnalyticsPage } from './AnalyticsPage';
import { UpgradePage } from './UpgradePage';
import { UsagePage } from './UsagePage';
import { SettingsPage } from './SettingsPage';
import { PartnersPage } from './PartnersPage';
import { PartnersAdminPage } from './PartnersAdminPage';
import { CompetitorsPage } from './CompetitorsPage';
import { AdminPage } from './AdminPage';
import { ShareChooser } from './ShareChooser';
import { peek, take, PENDING_ANALYZE_KEY, PENDING_STEAL_KEY, PENDING_SHARE_KEY } from '../lib/intents';

// 'admin' is intentionally reachable but has no sidebar entry (see AppShell) —
// only reached by entering the admin code in Settings. AdminPage itself
// re-checks the caller's email before rendering anything or fetching data.
// 'home' also has no nav entry: it's reached from the brand row in the sidebar.
const VALID_TABS: NavTab[] = ['home', 'analyze', 'projects', 'analytics', 'competitors', 'usage', 'upgrade', 'partners', 'settings', 'admin', 'affiliate-admin'];

// A tab is reachable only if it's known and not feature-flagged off.
const isTabReachable = (t: string): t is NavTab =>
  (VALID_TABS as string[]).includes(t) && !HIDDEN_TABS.includes(t as NavTab);

export function Dashboard() {
  // Always opens on the hub rather than restoring the last tab: it's where
  // new tools and announcements surface, so it's what should greet you on
  // every entry. (Deliberately not persisted — a reload lands here too.)
  // Exception: a URL pasted into the landing page's hero before signing up
  // is waiting in localStorage for AnalysisChat to pick it up — go straight
  // there instead of stranding it on the hub. This also carries the link
  // across onboarding: Dashboard mounts after it, and the key is still set.
  // A Steal from the extension or the share sheet goes to Ideas the same way,
  // where CompetitorsPage picks it up.
  const [activeTab, setActiveTab] = useState<NavTab>(
    () => (peek(PENDING_ANALYZE_KEY) ? 'analyze' : peek(PENDING_STEAL_KEY) ? 'competitors' : 'home')
  );

  // A link shared from a phone arrives without saying what it is for.
  const [shared, setShared] = useState<string | null>(() => take(PENDING_SHARE_KEY));
  const chooseShared = (action: 'analyze' | 'steal') => {
    if (!shared) return;
    localStorage.setItem(action === 'analyze' ? PENDING_ANALYZE_KEY : PENDING_STEAL_KEY, shared);
    setShared(null);
    // Both screens read their key on mount, so leave and re-enter even if the
    // tab is already the right one.
    const tab: NavTab = action === 'analyze' ? 'analyze' : 'competitors';
    setActiveTab('home');
    setTimeout(() => setActiveTab(tab), 0);
  };

  useEffect(() => {
    const handler = (e: Event) => {
      const tab = (e as CustomEvent).detail as NavTab;
      if (tab && isTabReachable(tab)) setActiveTab(tab);
    };
    window.addEventListener('chumoku:navigate', handler);
    return () => window.removeEventListener('chumoku:navigate', handler);
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
      {activeTab === 'analyze' && <AnalysisChat />}
      {activeTab === 'projects' && <ProjectsPage />}
      {activeTab === 'analytics' && <AnalyticsPage />}
      {activeTab === 'competitors' && <CompetitorsPage />}
      {activeTab === 'usage' && <UsagePage />}
      {activeTab === 'upgrade' && <UpgradePage />}
      {activeTab === 'partners' && <PartnersPage />}
      {activeTab === 'affiliate-admin' && <PartnersAdminPage />}
      {activeTab === 'settings' && <SettingsPage />}
      {activeTab === 'admin' && <AdminPage />}
      {shared && <ShareChooser url={shared} onChoose={chooseShared} onClose={() => setShared(null)} />}
    </AppShell>
  );
}
