import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://ezlousklksipvwuinpzq.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImV6bG91c2tsa3NpcHZ3dWlucHpxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM2ODk3MTAsImV4cCI6MjA4OTI2NTcxMH0.r_z3gUdUkwBYph5igLxr2O_qD4K9morPVQwm0fuSsrg';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

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
    patterns: string[];
  };
  weak_spots: string[];
  new_hook_ideas: {
    hook: string;
    reasoning: string;
  }[];
  analysis_type: 'basic' | 'advanced';
  created_at: string;
}
