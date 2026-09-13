// Turning the creator's own work into something searchable by meaning.
//
// The lookup tools matched with ILIKE. That finds "ideas about minecraft" and
// misses "what did I have about sandbox games" - the same question with no word
// in common. This is the fix for that whole class of miss.
//
// Google's embedding endpoint regardless of ANALYSIS_PROVIDER, on purpose. The
// provider secret selects the model that WRITES; the embedding model is part of
// the storage format, because every vector in the table has to come from the
// same model to be comparable. Flipping ANALYSIS_PROVIDER must not silently
// start writing vectors that no longer sit in the same space as the ones
// already stored - that would not error, it would just return nonsense.
// Changing the model here means re-embedding everything.

const MODEL = 'gemini-embedding-001';

// Forced by pgvector, not chosen: the model returns 3072 by default and
// pgvector cannot index above 2000 with hnsw or ivfflat. Asked for at 768
// rather than sliced afterwards, which is what outputDimensionality is for.
// Must match vector(768) in the migration.
export const EMBEDDING_DIMS = 768;

const ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:embedContent`;

// A document and a query are embedded for different jobs and the model wants to
// know which. Getting this backwards costs recall quietly - nothing errors, the
// results are just worse.
type TaskType = 'RETRIEVAL_DOCUMENT' | 'RETRIEVAL_QUERY';

async function embed(text: string, taskType: TaskType): Promise<number[]> {
  const apiKey = Deno.env.get('GEMINI_API_KEY');
  if (!apiKey) throw new Error('GEMINI_API_KEY not configured');

  const res = await fetch(`${ENDPOINT}?key=${apiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: `models/${MODEL}`,
      content: { parts: [{ text: text.slice(0, 8000) }] },
      taskType,
      outputDimensionality: EMBEDDING_DIMS,
    }),
  });
  if (!res.ok) throw new Error(`embedding failed (${res.status}): ${(await res.text()).slice(0, 200)}`);

  const values = (await res.json())?.embedding?.values;
  if (!Array.isArray(values) || values.length !== EMBEDDING_DIMS) {
    throw new Error(`embedding came back with ${values?.length ?? 'no'} dimensions, expected ${EMBEDDING_DIMS}`);
  }
  return values;
}

export const embedQuery = (text: string) => embed(text, 'RETRIEVAL_QUERY');
export const embedDocument = (text: string) => embed(text, 'RETRIEVAL_DOCUMENT');

// deno-lint-ignore no-explicit-any
type DB = any;

interface Pending {
  kind: 'idea' | 'project' | 'message' | 'analysis';
  ref_id: string;
  content: string;
}

const clean = (s: unknown) => (typeof s === 'string' ? s.trim() : '');

// What is worth embedding out of each table, and what the searchable text of a
// row actually is. A project is its name plus its notes, because "the launch
// week one" and "the thing where I wrote about posting daily" are both ways
// people refer to the same project.
async function collectPending(supabase: DB, userId: string, budget: number): Promise<Pending[]> {
  const { data: already } = await supabase
    .from('content_embeddings').select('kind, ref_id').eq('user_id', userId);
  const have = new Set((already ?? []).map((r: { kind: string; ref_id: string }) => `${r.kind}:${r.ref_id}`));
  const missing = (kind: string, id: string) => !have.has(`${kind}:${id}`);

  const out: Pending[] = [];

  const [{ data: ideas }, { data: projects }, { data: messages }, { data: analyses }] = await Promise.all([
    supabase.from('competitor_ideas').select('id, adapted_idea, concept, video_title')
      .eq('user_id', userId).order('created_at', { ascending: false }).limit(300),
    supabase.from('projects').select('id, name, notes')
      .eq('user_id', userId).order('updated_at', { ascending: false }).limit(100),
    // Assistant replies as well as questions: "that hook you wrote me" is
    // looking for something the assistant said.
    supabase.from('chat_messages').select('id, content')
      .eq('user_id', userId).neq('content', '').order('created_at', { ascending: false }).limit(500),
    supabase.from('analyses').select('id, hook_analysis')
      .eq('user_id', userId).order('created_at', { ascending: false }).limit(200),
  ]);

  for (const i of ideas ?? []) {
    const text = [clean(i.adapted_idea) || clean(i.concept), clean(i.video_title)].filter(Boolean).join('\n');
    if (text && missing('idea', i.id)) out.push({ kind: 'idea', ref_id: i.id, content: text });
  }
  for (const p of projects ?? []) {
    const text = [clean(p.name), clean(p.notes)].filter(Boolean).join('\n');
    if (text && missing('project', p.id)) out.push({ kind: 'project', ref_id: p.id, content: text });
  }
  for (const m of messages ?? []) {
    const text = clean(m.content);
    // Below about this length a message is "ok", "thanks", a bare link - noise
    // that would crowd out real hits and cost a call each to store.
    if (text.length >= 25 && missing('message', m.id)) out.push({ kind: 'message', ref_id: m.id, content: text });
  }
  for (const a of analyses ?? []) {
    const text = [clean(a.hook_analysis?.title), clean(a.hook_analysis?.overall_assessment)].filter(Boolean).join('\n');
    if (text && missing('analysis', a.id)) out.push({ kind: 'analysis', ref_id: a.id, content: text });
  }

  return out.slice(0, budget);
}

/**
 * Embeds whatever this account has that is not embedded yet, up to `budget`
 * rows. Safe to run as often as you like: the unique key on (kind, ref_id)
 * makes a second run a no-op, and a partial run just leaves work for the next.
 *
 * Returns how many rows it wrote, so a caller can keep going if it wants to.
 */
export async function syncUserEmbeddings(supabase: DB, userId: string, budget = 40): Promise<number> {
  const pending = await collectPending(supabase, userId, budget);
  if (!pending.length) return 0;

  const rows: Record<string, unknown>[] = [];
  for (const p of pending) {
    try {
      rows.push({
        user_id: userId,
        kind: p.kind,
        ref_id: p.ref_id,
        content: p.content.slice(0, 4000),
        embedding: JSON.stringify(await embedDocument(p.content)),
      });
    } catch (e) {
      // One row failing must not lose the rest of the batch. The row simply
      // stays unembedded and is picked up next time.
      console.error(`[embeddings] ${p.kind}:${p.ref_id}`, e instanceof Error ? e.message : e);
    }
  }
  if (!rows.length) return 0;

  const { error } = await supabase
    .from('content_embeddings').upsert(rows, { onConflict: 'kind,ref_id', ignoreDuplicates: true });
  if (error) throw new Error(`storing embeddings: ${error.message}`);
  return rows.length;
}

export interface Match {
  kind: string;
  ref_id: string;
  content: string;
  similarity: number;
}

/**
 * Semantic search across everything this account has indexed.
 *
 * `userId` is the caller's verified id and is what scopes the query. Returns an
 * empty array rather than throwing when the migration has not been applied yet,
 * so every caller can fall back to matching on words.
 */
export async function searchCreatorContent(
  supabase: DB, userId: string, query: string,
  opts: { kinds?: string[]; limit?: number; minSimilarity?: number } = {},
): Promise<Match[]> {
  if (!query.trim()) return [];
  try {
    const embedding = await embedQuery(query);
    const { data, error } = await supabase.rpc('match_creator_content', {
      p_user_id: userId,
      p_embedding: JSON.stringify(embedding),
      p_kinds: opts.kinds ?? null,
      p_limit: opts.limit ?? 8,
    });
    if (error) throw new Error(error.message);
    // A vector search always returns its nearest neighbours, however far away
    // they are. Without a floor, asking about something the account has never
    // touched returns its least-unrelated rows with total confidence.
    const floor = opts.minSimilarity ?? 0.45;
    return (data ?? []).filter((m: Match) => m.similarity >= floor);
  } catch (e) {
    console.error('[embeddings] search unavailable, falling back:', e instanceof Error ? e.message : e);
    return [];
  }
}
