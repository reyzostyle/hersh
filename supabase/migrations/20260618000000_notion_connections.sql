-- Notion OAuth connections (one per user). Token is read only by edge functions
-- (service role); the frontend checks status via an edge function, never SELECTs the token.
CREATE TABLE IF NOT EXISTS notion_connections (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  access_token text NOT NULL,
  workspace_id text,
  workspace_name text,
  bot_id text,
  database_id text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE notion_connections ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own notion connection"
  ON notion_connections
  FOR ALL
  TO authenticated
  USING ((select auth.uid()) = user_id)
  WITH CHECK ((select auth.uid()) = user_id);
