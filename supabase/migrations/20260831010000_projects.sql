-- Projects.
--
-- A chat, the competitor video that prompted it and the ideas saved off it are
-- all about one piece of work, and until now each lived in its own tab with no
-- way to say they belong together. A project is that grouping, and nothing is
-- required to be in one: project_id is nullable everywhere so the app works
-- exactly as before for anyone who never makes one.

CREATE TABLE IF NOT EXISTS projects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_projects_user ON projects(user_id, updated_at DESC);

ALTER TABLE projects ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Own projects" ON projects;
CREATE POLICY "Own projects" ON projects FOR ALL
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
DROP POLICY IF EXISTS "Service role projects" ON projects;
CREATE POLICY "Service role projects" ON projects FOR ALL USING (auth.role() = 'service_role');

-- ON DELETE SET NULL, not CASCADE: deleting a project should tidy the grouping,
-- never destroy the analyses and ideas that were filed under it.
ALTER TABLE chat_threads ADD COLUMN IF NOT EXISTS project_id uuid REFERENCES projects(id) ON DELETE SET NULL;
ALTER TABLE competitor_ideas ADD COLUMN IF NOT EXISTS project_id uuid REFERENCES projects(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_chat_threads_project ON chat_threads(project_id);
CREATE INDEX IF NOT EXISTS idx_competitor_ideas_project ON competitor_ideas(project_id);
