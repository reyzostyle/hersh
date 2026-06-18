import { useState, useEffect } from 'react';
import { AppShell, NavTab } from './AppShell';
import { HookAnalysis } from './HookAnalysis';
import { HookLab } from './HookLab';
import { UpgradePage } from './UpgradePage';
import { SettingsPage } from './SettingsPage';
import { SupportPage } from './SupportPage';
import { PartnersPage } from './PartnersPage';
import { CompetitorsPage } from './CompetitorsPage';
import { AnalyticsPage } from './AnalyticsPage';

export function Dashboard() {
  const [activeTab, setActiveTab] = useState<NavTab>('hooks');

  useEffect(() => {
    const handler = (e: Event) => {
      const tab = (e as CustomEvent).detail as NavTab;
      if (tab) setActiveTab(tab);
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
      {activeTab === 'hooks' && <HookAnalysis />}
      {activeTab === 'hooklab' && <HookLab />}
      {activeTab === 'analytics' && <AnalyticsPage />}
      {activeTab === 'competitors' && <CompetitorsPage />}
      {activeTab === 'upgrade' && <UpgradePage />}
      {activeTab === 'partners' && <PartnersPage />}
      {activeTab === 'settings' && <SettingsPage />}
      {activeTab === 'support' && <SupportPage />}
    </AppShell>
  );
}
