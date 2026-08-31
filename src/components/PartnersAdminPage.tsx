import { Page, PageHead } from './Page';
import { PartnersAdmin } from './PartnersAdmin';

// The partner-management list, on its own hidden tab.
//
// It used to be what the admin account saw when it opened Affiliate, which
// meant the one person who has to review that page could never see the page
// everyone else gets. Now Affiliate is identical for every account and this
// lives behind a code in Settings, the same door the admin dashboard uses.
export function PartnersAdminPage() {
  return (
    <Page className="animate-tab-in">
      <PageHead
        eyebrow="Admin"
        title="Affiliate partners"
        subtitle="Every partner, what they have brought in, and what is owed."
      />
      <PartnersAdmin />
    </Page>
  );
}
