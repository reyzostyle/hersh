CREATE TABLE IF NOT EXISTS knowledge_base (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  category text NOT NULL,
  title text NOT NULL,
  content text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE knowledge_base ENABLE ROW LEVEL SECURITY;

-- Only admins can manage knowledge base (via service role in edge functions)
-- No public access needed
