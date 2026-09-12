// The CORS headers every function opens with.
//
// It was copy-pasted into all 34 of them, and copies drift: the same object
// existed in nine different variants, differing in the methods they list and,
// in four cases, in the headers they allow. Three of those four differences are
// load-bearing and must survive any consolidation -
//
//   upload-video-chunk   needs X-Upload-Url, X-Upload-Offset and X-Is-Last, or
//                        the browser preflight fails and video upload dies
//   snapshot-views       is called with X-Admin-Secret, not a user token
//   update-knowledge-base allows only what it actually receives
//
// - which is why this takes overrides instead of imposing one policy. The point
// is one definition of the shape, not one shape for everybody.
//
// Only the object moved here. The `if (req.method === 'OPTIONS')` line stays in
// each function: it is one line, it was identical and correct in all 33, and
// rewriting 33 handler bodies to save it is risk spent on nothing. The headers
// object is what had actually drifted.
//
// The Methods list is per-function and deliberately preserved as it was: it
// only ever has to CONTAIN the method the browser asks about, so widening it
// would be safe but would be an unrequested behaviour change, and there is no
// reason to make one while consolidating.

export interface CorsOptions {
  /** Exactly as it was written in each function, e.g. 'POST, OPTIONS'. */
  methods?: string;
  /** Overrides the default list entirely, for the three functions that differ. */
  headers?: string;
}

const DEFAULT_HEADERS = 'Content-Type, Authorization, X-Client-Info, Apikey';

export function corsHeaders(opts: CorsOptions = {}): Record<string, string> {
  const h: Record<string, string> = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': opts.headers ?? DEFAULT_HEADERS,
  };
  // cancel-subscription has never sent a Methods header. POST is a
  // CORS-safelisted method, so its preflight passes without one - preserved
  // rather than "fixed", because changing it is a live behaviour change that
  // nothing asked for.
  if (opts.methods) h['Access-Control-Allow-Methods'] = opts.methods;
  return h;
}
