import { BarChart2, Loader2, RefreshCw, Infinity as InfinityIcon } from 'lucide-react';
import { ErrorNotice } from './ErrorNotice';
import { useUsage, PLAN_DISPLAY } from '../lib/useUsage';

export function UsagePage() {
  const { usage, loading, error, reload } = useUsage();

  const currentPlan = usage?.plan || 'free';
  const currentPlanDisplay = PLAN_DISPLAY[currentPlan] ?? currentPlan;
  // Pro is marketed as unlimited — the real 100/month fair-use cap (see Terms
  // §6) stays server-side and out of this dashboard so it doesn't undercut
  // the "unlimited" promise for the people paying for it.
  const isUnlimitedPlan = currentPlan === 'agency';
  const usageRows = usage
    ? [
        { label: 'Video analyses', used: usage.analysesUsed, limit: usage.analysesLimit },
        { label: 'Hook checks', used: usage.hooksUsed, limit: usage.hooksLimit },
        { label: 'Script checks', used: usage.scriptAnalysesUsed, limit: usage.scriptAnalysesLimit },
      ]
    : [];

  return (
    <div className="max-w-2xl mx-auto px-4 sm:px-6 pt-4 sm:pt-6 pb-12 animate-fade-in-up">
      <div className="hidden lg:block mb-6">
        <h1 className="text-2xl font-bold text-white mb-1">Usage</h1>
        <p className="text-sm text-gray-500">Your monthly limits across Analyze.</p>
      </div>

      {error && <ErrorNotice message={error} className="mb-6" />}

      <div className="p-4 sm:p-5 rounded-xl motion-card animate-fade-in-up delay-100 glass-panel">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2 min-w-0">
            <BarChart2 className="w-4 h-4 text-gray-400 flex-shrink-0" />
            <span className="text-sm font-medium text-white flex-shrink-0">Usage this period</span>
            {!loading && usage && (
              <span className="ml-1.5 flex items-center gap-1.5 text-sm text-gray-500 min-w-0">
                <span className="text-gray-600">·</span>
                <span className="truncate">{currentPlanDisplay} Plan</span>
                {currentPlan !== 'free' && (
                  <span className="text-[11px] px-2 py-0.5 bg-[#0EA4E9]/15 text-[#0EA4E9] rounded-full flex-shrink-0">Active</span>
                )}
              </span>
            )}
          </div>
          <button
            onClick={reload}
            disabled={loading}
            className="p-1.5 text-gray-500 hover:text-white transition-colors rounded-lg hover:bg-gray-800 flex-shrink-0"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>

        {loading ? (
          <div className="flex items-center gap-2 text-gray-500 text-sm">
            <Loader2 className="w-4 h-4 animate-spin" />
            Loading usage...
          </div>
        ) : usage ? (
          <>
            {usageRows.map((row, i) => {
              const percent = Math.min((row.used / row.limit) * 100, 100);
              return (
                <div key={row.label} className={i > 0 ? 'mt-5 pt-5' : undefined} style={i > 0 ? { borderTop: '1px solid rgba(255,255,255,0.06)' } : undefined}>
                  <div className="mb-2 flex items-center justify-between">
                    <span className="text-xs text-gray-500 mb-0.5 block">{row.label}</span>
                    {isUnlimitedPlan && (
                      <span className="flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full" style={{ background: 'rgba(14,164,233,0.12)', color: '#0EA4E9' }}>
                        <InfinityIcon className="w-3 h-3" /> Unlimited
                      </span>
                    )}
                  </div>
                  {isUnlimitedPlan ? (
                    <p className="text-xs text-gray-600">No monthly cap on the Pro plan.</p>
                  ) : (
                    <>
                      <span className="text-3xl font-bold text-white leading-none">
                        {row.used}
                        <span className="text-lg text-gray-500 font-normal">/{row.limit}</span>
                      </span>
                      <div className="mt-2 w-full h-1.5 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.08)' }}>
                        <div
                          className={`h-full rounded-full transition-all duration-500 ${
                            percent >= 90 ? 'bg-red-500' : percent >= 70 ? 'bg-amber-500' : 'bg-[#0EA4E9]'
                          }`}
                          style={{ width: `${percent}%` }}
                        />
                      </div>
                      <p className="mt-2 text-xs text-gray-600">
                        {row.limit - row.used} remaining{currentPlan !== 'free' && ' this month'}
                      </p>
                    </>
                  )}
                </div>
              );
            })}
          </>
        ) : null}
      </div>
    </div>
  );
}
