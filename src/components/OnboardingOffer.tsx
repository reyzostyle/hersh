import { Sparkle as Sparkles, X } from '@phosphor-icons/react';

// Shown once, after the first analysis lands, to someone who came in through
// the landing page's hero and therefore skipped onboarding.
//
// Asking for a niche before the first result is a form standing between a
// visitor and the thing they came for. Asking after it is a different question:
// they have seen what the analysis looks like, so "it would be sharper if it
// knew your channel" is an offer rather than a toll.
//
// Uses .glass-panel-accent, the panel style the app already reserves for
// surfacing one card above its neighbours, rather than inventing a look that
// exists nowhere else in the product.
export function OnboardingOffer({ onAccept, onDismiss }: { onAccept: () => void; onDismiss: () => void }) {
  return (
    <div className="fixed bottom-4 right-4 left-4 sm:left-auto sm:w-[364px] z-50 animate-fade-in-up">
      <div className="relative rounded-xl p-4 glass-panel-accent">
        <button
          onClick={onDismiss}
          className="absolute top-3 right-3 text-gray-600 hover:text-gray-300 transition-colors"
          aria-label="Dismiss"
        >
          <X className="w-3.5 h-3.5" />
        </button>

        <div className="flex items-center gap-2.5 mb-2">
          <span className="text-[var(--accent)] flex-shrink-0">
            <Sparkles className="w-4 h-4" />
          </span>
          <span className="text-white font-semibold text-sm">That was a cold read</span>
        </div>

        <p className="text-xs leading-relaxed text-gray-400 text-balance pr-4">
          It judged the video on its own, knowing nothing about your channel. Tell us your niche and
          level and the next one is written for you.
        </p>

        <div className="flex items-center gap-3 mt-3.5">
          <button
            onClick={onAccept}
            className="px-3.5 py-2 rounded-lg text-xs font-semibold text-white transition-opacity hover:opacity-90"
            style={{ background: 'var(--accent)', color: 'var(--on-accent)' }}
          >
            Takes a minute
          </button>
          <button
            onClick={onDismiss}
            className="text-xs font-medium text-gray-500 hover:text-gray-300 transition-colors"
          >
            Not now
          </button>
        </div>
      </div>
    </div>
  );
}
