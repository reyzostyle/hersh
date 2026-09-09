import { useState, useEffect, useRef, useCallback } from 'react';
import { markInitialTab, pushTab, tabFromState } from '../lib/navigation';
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
  const [activeTab, setActiveTab] = useState<NavTab>(
    () => (localStorage.getItem('chumoku_pending_video_url') ? 'analyze' : 'home')
  );

  // Every tab change is a history entry, so the phone's edge swipe, the
  // trackpad's two-finger swipe, the mouse's back button and the browser's own
  // arrow all step back through the product instead of leaving it. See
  // lib/navigation.ts.
  //
  // The ref is read rather than the state because AppShell both calls
  // onTabChange and announces the same move on the navigate channel: without a
  // value that updates synchronously, one click would push two entries and Back
  // would need pressing twice.
  const tabRef = useRef(activeTab);
  const navigate = useCallback((tab: NavTab) => {
    if (tab === tabRef.current) return;
    tabRef.current = tab;
    pushTab(tab);
    setActiveTab(tab);
  }, []);

  useEffect(() => { markInitialTab(tabRef.current); }, []);

  useEffect(() => {
    const onPop = (e: PopStateEvent) => {
      const tab = tabFromState(e);
      // An entry with no tab on it is a view that was open on top of one - it
      // belongs to whichever screen pushed it, and that screen closes itself.
      if (!tab || !isTabReachable(tab)) return;
      tabRef.current = tab as NavTab;
      setActiveTab(tab as NavTab);
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  useEffect(() => {
    const handler = (e: Event) => {
      const tab = (e as CustomEvent).detail as NavTab;
      if (tab && isTabReachable(tab)) navigate(tab);
    };
    window.addEventListener('chumoku:navigate', handler);
    return () => window.removeEventListener('chumoku:navigate', handler);
  }, [navigate]);

  // Handle return from Notion OAuth (callback redirects to /?notion=connected|error)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const notion = params.get('notion');
    if (!notion) return;
    import('../lib/toast').then(({ showToast }) => {
      if (notion === 'connected') { showToast('Notion connected ✓'); navigate('settings'); }
      else showToast('Notion connection failed', 'error');
    });
    window.history.replaceState({}, '', window.location.pathname);
  }, [navigate]);

  return (
    <AppShell activeTab={activeTab} onTabChange={navigate}>
      {activeTab === 'home' && <HomePage onNavigate={navigate} />}
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
    </AppShell>
  );
}
