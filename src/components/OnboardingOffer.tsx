import { Sparkles, X } from 'lucide-react';

// Shown once, after the first analysis lands, to someone who came in through
// the landing page's hero and therefore skipped onboarding.
//
// Asking for a niche before the first result is a form standing between a
// visitor and the thing they came for. Asking after it is a different question:
// they have seen what the analysis looks like, so "it would be sharper if it
// knew your channel" is an offer rather than a toll.
export function OnboardingOffer({ onAccept, onDismiss }: { onAccept: () => void; onDismiss: () => void }) {
  return (
    <div className="fixed bottom-4 right-4 left-4 sm:left-auto sm:w-[380px] z-50 animate-fade-in-up">
      <div
        className="rounded-xl p-4 shadow-2xl"
        style={{
          background: 'linear-gradient(rgba(255,255,255,0.05), rgba(255,255,255,0.05)), #16181D',
          border: '1px solid rgba(14,164,233,0.25)',
        }}
      >
        <div className="flex items-start gap-3">
          <div
            className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0"
            style={{ background: 'rgba(14,164,233,0.15)' }}
          >
            <Sparkles className="w-3.5 h-3.5 text-[#0EA4E9]" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-white mb-1">That was a cold read</p>
            <p className="text-xs text-gray-400 text-balance">
              It judged the video on its own, knowing nothing about your channel. Tell us your niche
              and level and the next one is written for you.
            </p>
            <div className="flex items-center gap-3 mt-3">
              <button
                onClick={onAccept}
                className="px-3.5 py-2 text-xs font-medium text-white rounded-lg hover:opacity-90 transition-opacity"
                style={{ background: '#0EA4E9' }}
              >
                Takes a minute
              </button>
              <button
                onClick={onDismiss}
                className="text-xs text-gray-500 hover:text-gray-300 transition-colors"
              >
                Not now
              </button>
            </div>
          </div>
          <button
            onClick={onDismiss}
            className="text-gray-600 hover:text-gray-400 transition-colors flex-shrink-0"
            aria-label="Dismiss"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
}
