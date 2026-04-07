/*
  # Fix RLS Performance Issues and Optimize Indexes

  ## Changes Made
  
  ### 1. RLS Policy Performance Optimization
  All RLS policies have been updated to use `(select auth.uid())` instead of `auth.uid()`.
  This prevents the function from being re-evaluated for each row, significantly improving
  query performance at scale.
  
  **Affected Policies:**
  - user_tokens: view, insert, update, delete policies
  - videos: view, insert, update, delete policies  
  - analyses: view, insert, delete policies
  
  ### 2. Index Optimization
  Removed unused index `idx_videos_video_id` that is not being utilized by queries.
  
  ## Security Notes
  - All RLS policies maintain the same security guarantees
  - Only performance characteristics are improved
  - Users can still only access their own data
*/

-- Drop all existing policies
DROP POLICY IF EXISTS "Users can view own tokens" ON user_tokens;
DROP POLICY IF EXISTS "Users can insert own tokens" ON user_tokens;
DROP POLICY IF EXISTS "Users can update own tokens" ON user_tokens;
DROP POLICY IF EXISTS "Users can delete own tokens" ON user_tokens;

DROP POLICY IF EXISTS "Users can view own videos" ON videos;
DROP POLICY IF EXISTS "Users can insert own videos" ON videos;
DROP POLICY IF EXISTS "Users can update own videos" ON videos;
DROP POLICY IF EXISTS "Users can delete own videos" ON videos;

DROP POLICY IF EXISTS "Users can view own analyses" ON analyses;
DROP POLICY IF EXISTS "Users can insert own analyses" ON analyses;
DROP POLICY IF EXISTS "Users can delete own analyses" ON analyses;

-- Recreate policies with optimized auth.uid() calls
-- user_tokens policies
CREATE POLICY "Users can view own tokens"
  ON user_tokens FOR SELECT
  TO authenticated
  USING ((select auth.uid()) = user_id);

CREATE POLICY "Users can insert own tokens"
  ON user_tokens FOR INSERT
  TO authenticated
  WITH CHECK ((select auth.uid()) = user_id);

CREATE POLICY "Users can update own tokens"
  ON user_tokens FOR UPDATE
  TO authenticated
  USING ((select auth.uid()) = user_id)
  WITH CHECK ((select auth.uid()) = user_id);

CREATE POLICY "Users can delete own tokens"
  ON user_tokens FOR DELETE
  TO authenticated
  USING ((select auth.uid()) = user_id);

-- videos policies
CREATE POLICY "Users can view own videos"
  ON videos FOR SELECT
  TO authenticated
  USING ((select auth.uid()) = user_id);

CREATE POLICY "Users can insert own videos"
  ON videos FOR INSERT
  TO authenticated
  WITH CHECK ((select auth.uid()) = user_id);

CREATE POLICY "Users can update own videos"
  ON videos FOR UPDATE
  TO authenticated
  USING ((select auth.uid()) = user_id)
  WITH CHECK ((select auth.uid()) = user_id);

CREATE POLICY "Users can delete own videos"
  ON videos FOR DELETE
  TO authenticated
  USING ((select auth.uid()) = user_id);

-- analyses policies
CREATE POLICY "Users can view own analyses"
  ON analyses FOR SELECT
  TO authenticated
  USING ((select auth.uid()) = user_id);

CREATE POLICY "Users can insert own analyses"
  ON analyses FOR INSERT
  TO authenticated
  WITH CHECK ((select auth.uid()) = user_id);

CREATE POLICY "Users can delete own analyses"
  ON analyses FOR DELETE
  TO authenticated
  USING ((select auth.uid()) = user_id);

-- Remove unused index
DROP INDEX IF EXISTS idx_videos_video_id;