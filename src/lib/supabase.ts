import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://ezlousklksipvwuinpzq.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImV6bG91c2tsa3NpcHZ3dWlucHpxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM2ODk3MTAsImV4cCI6MjA4OTI2NTcxMH0.r_z3gUdUkwBYph5igLxr2O_qD4K9morPVQwm0fuSsrg';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

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

export async function fetchWithRetry(input: RequestInfo | URL, init?: RequestInit, retries = 2): Promise<Response> {
  let lastError: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    if (attempt > 0) await new Promise(r => setTimeout(r, attempt * 800));
    try {
      const res = await fetch(input, init);
      if (res.ok || !RETRYABLE_STATUS.has(res.status) || attempt === retries) return res;
      lastError = new Error(`HTTP ${res.status}`);
    } catch (e) {
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
