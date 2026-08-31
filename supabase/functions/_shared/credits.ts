// Product-wide credit pool. One balance covers Analyze's Video/Hook/Script
// modes and all three Competitors LLM steps. Free plan's allowance is a
// ONE-TIME grant, never resetting (see loadCreditStatus below) — that's the
// entire free tier: no monthly refill, no separate lifetime-video counter,
// just this pool exhausting once and staying exhausted until upgrade.
//
// Limits are set from a WORST-CASE dollar budget, not an average: a user can
// legally spend the whole allowance on the single most-underpriced action
// (video), so that's what the ceiling has to survive. At these numbers the
// worst case is ~$0.13 (free), ~$0.78 (Plus), ~$2.60 (Pro) of model spend
// per period. Realistic mixed usage lands at roughly a third of that.
export const CREDIT_LIMITS: Record<string, number> = { free: 20, pro: 300, agency: 1000 };

// Ordered by real DOLLAR cost (not raw token count — output tokens bill
// ~8x input, so a big-input/small-output action like video is cheaper than
// its token count suggests, and a small-input/big-output one like a hook
// check is dearer). Real per-call costs at the 2026-08 default model:
// video ~$0.0130 (two model calls: watch + score), outline ~$0.0120 (watches
// the competitor's video), script check ~$0.0033, hook check ~$0.0021,
// idea ~$0.0010 (reads a free transcript, pays only for the model reading
// it), comp script ~$0.0006. The spread is then COMPRESSED so
// video doesn't read as prohibitively expensive next to everything else;
// the resulting margin varies with usage mix, which is exactly why the
// limits above are sized against the worst case rather than the average.
export const CREDIT_COSTS = {
  video_analysis: 5,
  hook_check: 2,
  script_check: 3,
  competitor_idea: 1,
  // Was 1, when the outline was written from the competitor's transcript. It
  // now WATCHES the video (see generate-outline), which is the same class of
  // work as a full video analysis and about eight times the cost of the text
  // pass it replaced. Priced just under video_analysis because the output is
  // shorter.
  competitor_outline: 4,
  competitor_script: 1,
  // A follow-up answers from the analysis already in the thread, so it is a
  // short text call rather than another look at the video.
  chat_followup: 1,
} as const;

export type CreditAction = keyof typeof CREDIT_COSTS;

export interface CreditStatus {
  plan: string;
  used: number;
  limit: number;
  bonus: number;
  resetAt: string | null;
}

// Loads the credit balance. Paid plans reset monthly, performed in-place if
// the window has passed (or starting one on first-ever paid action). Free
// plan never resets — its allowance is a one-time grant that just runs out,
// which IS the free tier (no separate trial mechanism needed).
export async function loadCreditStatus(
  // deno-lint-ignore no-explicit-any
  supabase: any,
  userId: string
): Promise<CreditStatus> {
  const { data: row } = await supabase
    .from('user_tokens')
    .select('plan, credits_used, credits_reset_at, bonus_credits')
    .eq('user_id', userId)
    .maybeSingle();

  const plan = row?.plan || 'free';
  let used = row?.credits_used || 0;
  const bonus = row?.bonus_credits || 0;
  let resetAt: string | null = row?.credits_reset_at || null;

  if (plan !== 'free') {
    const newResetAt = new Date();
    newResetAt.setDate(newResetAt.getDate() + 30);

    if (resetAt) {
      if (new Date() > new Date(resetAt)) {
        // bonus_credits is deliberately NOT cleared here: it's real money
        // (a top-up purchase) or a voucher grant, neither of which should
        // evaporate just because the calendar rolled over. Only the
        // recurring plan allowance (credits_used) resets.
        await supabase
          .from('user_tokens')
          .update({ credits_used: 0, credits_reset_at: newResetAt.toISOString() })
          .eq('user_id', userId);
        used = 0;
        resetAt = newResetAt.toISOString();
      }
    } else {
      await supabase.from('user_tokens').update({ credits_reset_at: newResetAt.toISOString() }).eq('user_id', userId);
      resetAt = newResetAt.toISOString();
    }
  }

  const limit = (CREDIT_LIMITS[plan] ?? CREDIT_LIMITS.free) + bonus;
  return { plan, used, limit, bonus, resetAt };
}

export function canAfford(status: CreditStatus, cost: number, isAdmin: boolean): boolean {
  return isAdmin || status.used + cost <= status.limit;
}

// Deduct AFTER the LLM call succeeds - a failed generation shouldn't cost
// the user anything. Callers processing multiple actions in one request
// (fetch-competitor-ideas) should bump `status.used += cost` themselves
// afterward so the next canAfford() check in the same loop sees it without
// a re-fetch.
// deno-lint-ignore no-explicit-any
export async function spendCredits(supabase: any, userId: string, status: CreditStatus, cost: number): Promise<void> {
  await supabase.from('user_tokens').update({ credits_used: status.used + cost }).eq('user_id', userId);
}
