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

export function TermsOfService() {
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
          <h1 className="text-white font-bold text-2xl sm:text-3xl mb-2 text-balance">Terms of Service</h1>
          <p className="text-gray-500 text-sm mb-8">Last updated: {UPDATED}</p>

          <Section title="1. Acceptance of terms">
            <p>
              By accessing or using Hershy ("the Service"), operated by Hershy Media, you agree to be bound
              by these Terms of Service. If you do not agree, do not use the Service.
            </p>
          </Section>

          <Section title="2. The service">
            <p>
              Hershy is a tool that helps creators analyze YouTube content to improve hooks, scripts, and
              performance. Features, limits, and pricing may change over time. We may add, modify, or
              remove features at our discretion.
            </p>
          </Section>

          <Section title="3. Accounts">
            <p>
              You are responsible for maintaining the confidentiality of your account credentials and for
              all activity under your account. You must provide accurate information and are responsible for
              keeping it up to date. You must be at least 13 years old to use the Service.
            </p>
          </Section>

          <Section title="4. Connecting your YouTube account">
            <p>
              Some features require you to connect your YouTube account via Google OAuth. By connecting, you
              authorize Hershy to access your YouTube data on a read-only basis as described in our{' '}
              <a href="/privacy" className="text-[var(--accent)] hover:underline">Privacy Policy</a>. You can
              disconnect at any time from the app settings or from your Google Account permissions.
            </p>
          </Section>

          <Section title="5. Acceptable use">
            <p>You agree not to:</p>
            <ul className="list-disc pl-5 space-y-1.5">
              <li>Use the Service for any unlawful purpose or in violation of YouTube's or Google's terms.</li>
              <li>Attempt to circumvent usage limits, security, or access controls.</li>
              <li>Reverse engineer, scrape, or resell the Service without permission.</li>
              <li>Use the Service to harass, infringe, or harm others.</li>
            </ul>
          </Section>

          <Section title="6. Payments and subscriptions">
            <p>
              Paid plans are billed through Stripe. Subscriptions renew automatically until cancelled. Fees
              are non-refundable except where required by law. We may change pricing with reasonable notice;
              changes apply to subsequent billing periods.
            </p>
            <p className="mt-3">
              Plans marketed as unlimited are subject to a fair-use allowance of approximately 100 uses per
              category per billing month (video analyses, hook checks, and script checks are each tracked
              separately), which resets at the start of each billing month. The large majority of users never
              approach this allowance. We may change these allowances and factors at any time. If you reach
              the allowance and have a genuine need for more, contact us and we will work with you on a
              custom plan. We may slow, suspend, queue, or decline further processing for usage that exceeds
              the fair-use allowance or that we reasonably determine to be abusive, fraudulent, or automated.
            </p>
          </Section>

          <Section title="7. Intellectual property">
            <p>
              The Service, including its software, design, and content, is owned by Hershy Media and
              protected by applicable laws. You retain ownership of your own content and data. You grant us
              the limited rights necessary to operate the Service and provide the features you use.
            </p>
          </Section>

          <Section title="8. AI-generated output">
            <p>
              Hershy uses AI to generate analysis and recommendations. Output is provided for informational
              purposes and may be inaccurate or incomplete. You are responsible for how you use it, and we
              make no guarantee of any particular result.
            </p>
          </Section>

          <Section title="9. Disclaimers">
            <p>
              The Service is provided "as is" and "as available" without warranties of any kind, whether
              express or implied. We do not warrant that the Service will be uninterrupted, error-free, or
              meet your specific requirements.
            </p>
          </Section>

          <Section title="10. Limitation of liability">
            <p>
              To the maximum extent permitted by law, Hershy Media shall not be liable for any indirect,
              incidental, special, consequential, or punitive damages, or any loss of profits or data,
              arising from your use of the Service.
            </p>
          </Section>

          <Section title="11. Termination">
            <p>
              We may suspend or terminate your access if you violate these Terms or use the Service in a way
              that may cause harm. You may stop using the Service at any time.
            </p>
          </Section>

          <Section title="12. Changes to these terms">
            <p>
              We may update these Terms from time to time. When we do, we will revise the "Last updated"
              date above. Continued use after changes take effect constitutes acceptance.
            </p>
          </Section>

          <Section title="13. Contact">
            <p>
              Questions about these Terms? Contact us at{' '}
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
