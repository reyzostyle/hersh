import { useState } from 'react';
import { AppShell, NavTab } from './AppShell';
import { HookAnalysis } from './HookAnalysis';
import { UpgradePage } from './UpgradePage';
import { SettingsPage } from './SettingsPage';
import { SupportPage } from './SupportPage';
import { PartnersPage } from './PartnersPage';

export function Dashboard() {
  const [activeTab, setActiveTab] = useState<NavTab>('hooks');

  return (
    <AppShell activeTab={activeTab} onTabChange={setActiveTab}>
      {activeTab === 'hooks' && <HookAnalysis />}
      {activeTab === 'upgrade' && <UpgradePage />}
      {activeTab === 'partners' && <PartnersPage />}
      {activeTab === 'settings' && <SettingsPage />}
      {activeTab === 'support' && <SupportPage />}
    </AppShell>
  );
}
