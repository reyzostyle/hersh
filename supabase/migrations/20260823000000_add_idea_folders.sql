-- Saved competitor ideas get user-created folders, replacing the old
-- "Scripts" tab (full-script generation was dropped). An idea is saved when
-- liked = true; folder_id is where it was filed. NULL folder_id means saved
-- but unfiled, which is the default so saving stays one click.

CREATE TABLE IF NOT EXISTS idea_folders (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  created_at timestamptz DEFAULT now(),
  UNIQUE(user_id, name)
);

-- ON DELETE SET NULL, not CASCADE: deleting a folder must not delete the
-- ideas inside it. The idea row also doubles as the record that this video
-- was already analyzed, so dropping it would let the next fetch pull the same
-- video again and bill for it a second time.
ALTER TABLE competitor_ideas
  ADD COLUMN IF NOT EXISTS folder_id uuid REFERENCES idea_folders(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idea_folders_user_idx ON idea_folders(user_id);
CREATE INDEX IF NOT EXISTS competitor_ideas_folder_idx ON competitor_ideas(folder_id);

ALTER TABLE idea_folders ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can select own idea folders" ON idea_folders;
CREATE POLICY "Users can select own idea folders"
  ON idea_folders FOR SELECT TO authenticated
  USING ((SELECT auth.uid()) = user_id);

DROP POLICY IF EXISTS "Users can insert own idea folders" ON idea_folders;
CREATE POLICY "Users can insert own idea folders"
  ON idea_folders FOR INSERT TO authenticated
  WITH CHECK ((SELECT auth.uid()) = user_id);

DROP POLICY IF EXISTS "Users can update own idea folders" ON idea_folders;
CREATE POLICY "Users can update own idea folders"
  ON idea_folders FOR UPDATE TO authenticated
  USING ((SELECT auth.uid()) = user_id)
  WITH CHECK ((SELECT auth.uid()) = user_id);

DROP POLICY IF EXISTS "Users can delete own idea folders" ON idea_folders;
CREATE POLICY "Users can delete own idea folders"
  ON idea_folders FOR DELETE TO authenticated
  USING ((SELECT auth.uid()) = user_id);

-- competitor_ideas has been read and written from the browser since it was
-- created, but no migration ever enabled RLS on it, so every row was
-- reachable by any authenticated user who could guess an id. Enabling it here
-- with the same owner-only policies the older competitor_channels table got.
-- Edge functions use the service role key and bypass RLS, so the fetch and
-- generate flows are unaffected.
ALTER TABLE competitor_ideas ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can select own competitor ideas" ON competitor_ideas;
CREATE POLICY "Users can select own competitor ideas"
  ON competitor_ideas FOR SELECT TO authenticated
  USING ((SELECT auth.uid()) = user_id);

DROP POLICY IF EXISTS "Users can update own competitor ideas" ON competitor_ideas;
CREATE POLICY "Users can update own competitor ideas"
  ON competitor_ideas FOR UPDATE TO authenticated
  USING ((SELECT auth.uid()) = user_id)
  WITH CHECK ((SELECT auth.uid()) = user_id);

DROP POLICY IF EXISTS "Users can delete own competitor ideas" ON competitor_ideas;
CREATE POLICY "Users can delete own competitor ideas"
  ON competitor_ideas FOR DELETE TO authenticated
  USING ((SELECT auth.uid()) = user_id);
