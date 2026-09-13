-- Semantic search over the creator's own work.
--
-- The chat's lookup tools matched with ILIKE, which finds "ideas about
-- minecraft" and misses "what did I have about sandbox games" - the same
-- question, no shared word. Embeddings fix that class of miss.
--
-- ONE table rather than a vector column on each of the four source tables.
-- The question people ask is "what have I got about X", not "which of my ideas
-- specifically" - one table answers it in one query across ideas, projects,
-- conversations and reviews at once, and a new source is a new value in `kind`
-- rather than another column, another index and another branch in the search.
--
-- 768 dimensions, and that is forced: gemini-embedding-001 returns 3072 by
-- default, and pgvector cannot index anything above 2000 with either hnsw or
-- ivfflat. The model supports outputDimensionality, so the vector is asked for
-- at 768 rather than truncated afterwards. Cosine distance is used throughout,
-- which is invariant to vector magnitude, so the shortened vector needs no
-- renormalising to rank correctly.
--
-- Changing this number later means re-embedding everything. It is not a knob.

CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE IF NOT EXISTS content_embeddings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  -- Which table the row came from. Checked rather than free text so a typo in
  -- an edge function cannot quietly create a fifth kind nothing searches.
  kind text NOT NULL CHECK (kind IN ('idea', 'project', 'message', 'analysis')),
  -- The id of the source row. Not a foreign key: it points at four different
  -- tables, and Postgres cannot express that. Deleted sources are handled by
  -- the search joining back to the source, so an orphan returns nothing rather
  -- than returning a ghost.
  ref_id uuid NOT NULL,
  -- Exactly the text that was embedded, kept so a hit can be shown without a
  -- second read of the source row.
  content text NOT NULL,
  embedding vector(768) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  -- One embedding per source row. The sync is written to be re-runnable, and
  -- this is what makes running it twice a no-op instead of a duplicate.
  UNIQUE (kind, ref_id)
);

-- The vector index. hnsw rather than ivfflat: it needs no training pass over
-- existing rows, which matters when the table starts empty and fills up as
-- people use the product.
CREATE INDEX IF NOT EXISTS idx_content_embeddings_vector
  ON content_embeddings USING hnsw (embedding vector_cosine_ops);

-- Every search is scoped to one account, so this is the filter that runs first.
CREATE INDEX IF NOT EXISTS idx_content_embeddings_owner
  ON content_embeddings (user_id, kind);

ALTER TABLE content_embeddings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Own embeddings" ON content_embeddings;
CREATE POLICY "Own embeddings" ON content_embeddings FOR ALL
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "Service role embeddings" ON content_embeddings;
CREATE POLICY "Service role embeddings" ON content_embeddings FOR ALL
  USING (auth.role() = 'service_role');

-- The search itself. It has to be a function: pgvector's distance operators
-- cannot be expressed through PostgREST filters.
--
-- p_user_id is passed by the caller and the caller is an edge function that
-- took it from a verified JWT. It is never taken from the model that asked for
-- the search - see _shared/creator-tools.ts for why that rule is absolute.
CREATE OR REPLACE FUNCTION match_creator_content(
  p_user_id uuid,
  p_embedding vector(768),
  p_kinds text[] DEFAULT NULL,
  p_limit int DEFAULT 8
)
RETURNS TABLE (kind text, ref_id uuid, content text, similarity double precision)
LANGUAGE sql
STABLE
AS $$
  SELECT
    e.kind,
    e.ref_id,
    e.content,
    1 - (e.embedding <=> p_embedding) AS similarity
  FROM content_embeddings e
  WHERE e.user_id = p_user_id
    AND (p_kinds IS NULL OR e.kind = ANY(p_kinds))
  ORDER BY e.embedding <=> p_embedding
  LIMIT LEAST(GREATEST(p_limit, 1), 50);
$$;
