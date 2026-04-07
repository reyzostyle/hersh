/*
  # Fix RLS Auth Performance and Drop Unused Indexes

  ## Summary
  Addresses security advisor warnings by optimizing RLS policies on competitor_channels
  and competitor_videos tables, and removing unused indexes.

  ## Changes

  ### 1. RLS Policy Optimization (competitor_channels)
  - Drops and recreates all 3 policies (select, insert, delete) to wrap auth.uid()
    in a subselect: `(select auth.uid())`. This prevents re-evaluation per row,
    improving query performance at scale.

  ### 2. RLS Policy Optimization (competitor_videos)
  - Drops and recreates all 3 policies (select, insert, delete) with the same
    subselect pattern for auth.uid().

  ### 3. Remove Unused Indexes
  - Drops `competitor_videos_user_id_idx` (unused)
  - Drops `competitor_videos_channel_id_idx` (unused)

  ## Notes
  - Policies are functionally identical; only the auth.uid() call is wrapped in SELECT
  - Dropping unused indexes reduces write overhead and storage
*/

-- Fix competitor_channels policies
DROP POLICY IF EXISTS "Users can select own competitor channels" ON public.competitor_channels;
DROP POLICY IF EXISTS "Users can insert own competitor channels" ON public.competitor_channels;
DROP POLICY IF EXISTS "Users can delete own competitor channels" ON public.competitor_channels;

CREATE POLICY "Users can select own competitor channels"
  ON public.competitor_channels FOR SELECT
  TO authenticated
  USING (user_id = (SELECT auth.uid()));

CREATE POLICY "Users can insert own competitor channels"
  ON public.competitor_channels FOR INSERT
  TO authenticated
  WITH CHECK (user_id = (SELECT auth.uid()));

CREATE POLICY "Users can delete own competitor channels"
  ON public.competitor_channels FOR DELETE
  TO authenticated
  USING (user_id = (SELECT auth.uid()));

-- Fix competitor_videos policies
DROP POLICY IF EXISTS "Users can select own competitor videos" ON public.competitor_videos;
DROP POLICY IF EXISTS "Users can insert own competitor videos" ON public.competitor_videos;
DROP POLICY IF EXISTS "Users can delete own competitor videos" ON public.competitor_videos;

CREATE POLICY "Users can select own competitor videos"
  ON public.competitor_videos FOR SELECT
  TO authenticated
  USING (user_id = (SELECT auth.uid()));

CREATE POLICY "Users can insert own competitor videos"
  ON public.competitor_videos FOR INSERT
  TO authenticated
  WITH CHECK (user_id = (SELECT auth.uid()));

CREATE POLICY "Users can delete own competitor videos"
  ON public.competitor_videos FOR DELETE
  TO authenticated
  USING (user_id = (SELECT auth.uid()));

-- Drop unused indexes
DROP INDEX IF EXISTS public.competitor_videos_user_id_idx;
DROP INDEX IF EXISTS public.competitor_videos_channel_id_idx;
