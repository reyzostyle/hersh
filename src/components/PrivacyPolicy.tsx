import { ArrowLeft } from '@phosphor-icons/react';

const UPDATED = 'July 1, 2026';

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-8">
      <h2 className="text-white font-semibold text-lg mb-3">{title}</h2>
      <div className="text-gray-300 text-sm leading-relaxed space-y-3">{children}</div>
    </section>
  );
}

export function PrivacyPolicy() {
  return (
    <div className="min-h-screen" style={{ background: 'linear-gradient(160deg, rgb(var(--surface-rgb)) 0%, rgb(var(--surface-rgb)) 100%)' }}>
      <div className="max-w-3xl mx-auto px-6 py-12">
        <a
          href="/"
          className="inline-flex items-center gap-2 text-sm text-gray-400 hover:text-white transition-colors mb-8"
        >
          <ArrowLeft className="w-4 h-4" /> Back to Hershy
        </a>

        <div
          className="rounded-2xl p-8 sm:p-10"
          style={{
            background: 'rgba(255,255,255,0.04)',
            border: '1px solid rgba(255,255,255,0.08)',
            backdropFilter: 'blur(12px)',
          }}
        >
          <h1 className="text-white font-bold text-2xl sm:text-3xl mb-2 text-balance">Privacy Policy</h1>
          <p className="text-gray-500 text-sm mb-8">Last updated: {UPDATED}</p>

          <Section title="Who we are">
            <p>
              Hershy ("Hershy", "we", "us") is a service operated by Hershy Media that helps creators
              analyze their YouTube content to improve hooks, scripts, and performance. This policy
              explains what data we collect, how we use it, and the choices you have. It applies to the
              website at <span className="text-white">hershymedia.com</span> and the Hershy application.
            </p>
          </Section>

          <Section title="Information we collect">
            <p>We collect the following categories of data:</p>
            <ul className="list-disc pl-5 space-y-1.5">
              <li>
                <span className="text-white">Account data</span> — your email address and authentication
                details, used to create and secure your account.
              </li>
              <li>
                <span className="text-white">Profile / onboarding data</span> — optional information you
                provide such as your niche, experience level, goals, and audience description.
              </li>
              <li>
                <span className="text-white">YouTube data</span> — when you connect your YouTube account,
                we access read-only data through the YouTube Data API (see the section below).
              </li>
              <li>
                <span className="text-white">Usage data</span> — basic logs needed to operate the service,
                prevent abuse, and enforce plan limits.
              </li>
              <li>
                <span className="text-white">Payment data</span> — billing is handled by Stripe. We do not
                store your full card details on our servers.
              </li>
            </ul>
          </Section>

          <Section title="Google / YouTube user data">
            <p>
              When you choose to connect your YouTube account, Hershy requests the
              <span className="text-white"> https://www.googleapis.com/auth/youtube.readonly </span>
              scope. This is a read-only scope. We use it solely to read your own channel and video
              information (such as your videos, titles, descriptions, and public performance metrics) in
              order to generate the analysis, recommendations, and insights that are the core function of
              Hershy.
            </p>
            <p>We do <span className="text-white">not</span> use this access to modify, upload, or delete any content on your channel.</p>
          </Section>

          <Section title="Limited Use disclosure">
            <p>
              Hershy's use and transfer of information received from Google APIs adheres to the{' '}
              <a
                href="https://developers.google.com/terms/api-services-user-data-policy"
                target="_blank"
                rel="noreferrer"
                className="text-[var(--accent)] hover:underline"
              >
                Google API Services User Data Policy
              </a>
              , including the Limited Use requirements. Specifically:
            </p>
            <ul className="list-disc pl-5 space-y-1.5">
              <li>We only use Google user data to provide and improve the user-facing features described above.</li>
              <li>We do not transfer or sell Google user data to third parties, ad networks, data brokers, or any other resellers.</li>
              <li>We do not use Google user data for serving advertisements.</li>
              <li>We do not allow humans to read your Google user data unless you give explicit consent, it is necessary for security or to comply with applicable law, or the data is aggregated and anonymized.</li>
            </ul>
          </Section>

          <Section title="How we use your data">
            <ul className="list-disc pl-5 space-y-1.5">
              <li>To provide the analysis, hook lab, and recommendation features of Hershy.</li>
              <li>To operate your account, apply usage limits, and prevent abuse.</li>
              <li>To process payments and manage subscriptions through Stripe.</li>
              <li>To communicate with you about your account and the service.</li>
            </ul>
            <p>
              To generate insights, relevant content (such as video titles and metrics) may be sent to our
              AI processing providers (e.g. Google Gemini and Anthropic Claude) strictly to produce your
              analysis. These providers process the data on our behalf and are not permitted to use it to
              train their models on your data or for their own purposes.
            </p>
          </Section>

          <Section title="Data sharing">
            <p>
              We do not sell your personal data. We share data only with service providers who help us
              operate Hershy — currently Supabase (database and authentication), Vercel (hosting), Stripe
              (payments), and our AI processing providers — and only to the extent needed to provide the
              service, or where required by law.
            </p>
          </Section>

          <Section title="Data retention and deletion">
            <p>
              We retain your data for as long as your account is active. You can disconnect your YouTube
              account at any time from the app's settings, which revokes our stored access tokens. You may
              also revoke Hershy's access directly from your{' '}
              <a
                href="https://myaccount.google.com/permissions"
                target="_blank"
                rel="noreferrer"
                className="text-[var(--accent)] hover:underline"
              >
                Google Account permissions
              </a>
              . To delete your account and associated data, contact us at the address below and we will
              delete it within a reasonable period, except where retention is required by law.
            </p>
          </Section>

          <Section title="Security">
            <p>
              We use industry-standard measures to protect your data, including encryption in transit and
              access controls. No method of transmission or storage is 100% secure, but we work to protect
              your information and limit access to it.
            </p>
          </Section>

          <Section title="Children">
            <p>Hershy is not directed to children under 13, and we do not knowingly collect their data.</p>
          </Section>

          <Section title="Changes to this policy">
            <p>
              We may update this policy from time to time. When we do, we will revise the "Last updated"
              date above. Continued use of Hershy after changes take effect constitutes acceptance of the
              updated policy.
            </p>
          </Section>

          <Section title="Contact">
            <p>
              If you have any questions about this Privacy Policy or your data, contact us at{' '}
              <a href="mailto:hershymedia@gmail.com" className="text-[var(--accent)] hover:underline">
                hershymedia@gmail.com
              </a>
              .
            </p>
          </Section>
        </div>
      </div>
    </div>
  );
}
