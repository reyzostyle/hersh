import { createClient } from '@supabase/supabase-js';

// The project, in one place. It was spelled out in twelve files under four
// different names - FN, FN_BASE, FUNCTIONS_URL, SUPABASE_FUNCTIONS_URL - plus
// eight more copies inline in a fetch call, which is eighteen places to edit
// to point this at anything else, and .env has carried the value the whole
// time without anything reading it.
//
// The literal stays as the fallback rather than being deleted: prerender and
// any build that runs without the env set must not come out pointing at
// nothing, and the anon key is public by design - it ships in the bundle
// either way.
// Trimmed, and that is not defensive decoration. All four VITE_ variables in
// this project's Vercel production environment are stored WITH A TRAILING
// NEWLINE (verified 2026-09-12 via `vercel env pull`). Nothing noticed,
// because the only consumer that ever read one was the OAuth client id, and it
// goes into a URL - and the URL parser silently strips newlines.
//
// An anon key does not get that mercy. It is sent as an HTTP header, and the
// Headers API throws on a value containing a newline, which means reading this
// variable untrimmed takes down every request the app makes. Fix the stored
// values too; this trim is the belt, not the answer.
const env = (v: string | undefined) => v?.trim() || '';

const supabaseUrl = env(import.meta.env.VITE_SUPABASE_URL) || 'https://ezlousklksipvwuinpzq.supabase.co';
const supabaseAnonKey = env(import.meta.env.VITE_SUPABASE_ANON_KEY) || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImV6bG91c2tsa3NpcHZ3dWlucHpxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM2ODk3MTAsImV4cCI6MjA4OTI2NTcxMH0.r_z3gUdUkwBYph5igLxr2O_qD4K9morPVQwm0fuSsrg';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

// Every edge function is called as `${FUNCTIONS_URL}/<name>`. Import this
// rather than writing the host again.
export const FUNCTIONS_URL = `${supabaseUrl}/functions/v1`;

// The signed-in user's id, without a round trip.
//
// supabase.auth.getUser() calls GET /auth/v1/user over the network EVERY time,
// because it re-validates the token against the server. Nine places called it
// on mount, each one before its own data query, so opening a tab meant waiting
// out a full request to Supabase before the request you actually wanted had
// even been sent. getSession() reads the session already in memory or storage.
//
// Use getUser() only where the point IS server-side validation. For "which row
// is mine", the local session is the same id and costs nothing.
export async function getUserId(): Promise<string | null> {
  const { data: { session } } = await supabase.auth.getSession();
  return session?.user?.id ?? null;
}

export async function getSessionToken(): Promise<string | null> {
  const { data: { session } } = await supabase.auth.getSession();
  if (session?.access_token) return session.access_token;
  const { data } = await supabase.auth.refreshSession();
  return data.session?.access_token ?? null;
}

// A flaky mobile connection makes fetch() itself throw ("Load failed" on
// Safari, "Failed to fetch" on Chrome) before any response comes back — that
// class of failure is almost always transient, so it's worth one silent retry
// instead of surfacing an error the user can do nothing useful with. 502/503/504
// (gateway/cold-start blips) get the same treatment. Anything that reaches the
// app and answers - 400/401/403/429, our own quota and rate-limit responses -
// is a real answer, not a blip, and is returned as-is on the first try.
const RETRYABLE_STATUS = new Set([502, 503, 504]);

// An abort is the one failure that must never be retried: the user pressed
// stop, and fetch throwing AbortError is that press arriving, not a blip. Left
// to the retry loop it would wait 800ms and send the whole request again -
// twice - which is the opposite of what stop means.
export const isAbort = (e: unknown) =>
  e instanceof DOMException ? e.name === 'AbortError' : (e as { name?: string })?.name === 'AbortError';

export async function fetchWithRetry(input: RequestInfo | URL, init?: RequestInit, retries = 2): Promise<Response> {
  let lastError: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    if (attempt > 0) await new Promise(r => setTimeout(r, attempt * 800));
    if (init?.signal?.aborted) throw new DOMException('Aborted', 'AbortError');
    try {
      const res = await fetch(input, init);
      if (res.ok || !RETRYABLE_STATUS.has(res.status) || attempt === retries) return res;
      lastError = new Error(`HTTP ${res.status}`);
    } catch (e) {
      if (isAbort(e)) throw e;
      lastError = e;
      if (attempt === retries) throw e;
    }
  }
  throw lastError;
}

export interface Video {
  id: string;
  user_id: string;
  video_id: string;
  title: string;
  views: number;
  likes_count: number;
  comment_count: number;
  retention_percentage: number;
  average_view_duration: number;
  duration: number;
  transcript: string | null;
  script: string | null;
  thumbnail_url: string | null;
  published_at: string | null;
  created_at: string;
}

export interface UserProfile {
  channel_niche: string;
  channel_description: string;
  target_audience: string;
  channel_context: string;
}

export interface Analysis {
  id: string;
  user_id: string;
  video_ids: string[];
  hook_analysis: {
    overall_assessment: string;
    overall_score?: number;
    score_breakdown?: { hook: number; retention: number; payoff: number; delivery: number } | null;
    patterns: string[];
  };
  strong_spots: string[];
  weak_spots: string[];
  new_hook_ideas: {
    hook: string;
    reasoning: string;
  }[];
  analysis_type: 'basic' | 'advanced';
  is_my_video?: boolean;
  video_title?: string;
  created_at: string;
}
