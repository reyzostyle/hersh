import { createClient } from 'npm:@supabase/supabase-js@2.57.4';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Client-Info, Apikey',
};

const NOTION_VERSION = '2022-06-28';

const TYPE_OPTIONS = ['Hook', 'Script', 'Outline'];

async function notion(token: string, path: string, body?: unknown) {
  const res = await fetch(`https://api.notion.com/v1/${path}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      'Notion-Version': NOTION_VERSION,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json();
  if (!res.ok) throw new Error(`Notion ${path} failed (${res.status}): ${JSON.stringify(data)}`);
  return data;
}

// Split free text into Notion paragraph blocks (<=2000 chars each, blank lines = new block)
function textToBlocks(text: string) {
  const chunks = text.split(/\n{2,}/).flatMap((p) => p.match(/[\s\S]{1,1900}/g) || []);
  return chunks.filter((c) => c.trim()).map((c) => ({
    object: 'block',
    type: 'paragraph',
    paragraph: { rich_text: [{ type: 'text', text: { content: c.trim() } }] },
  }));
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 200, headers: corsHeaders });

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: corsHeaders });
    }
    const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    const { data: { user }, error: authErr } = await supabase.auth.getUser(authHeader.replace('Bearer ', ''));
    if (authErr || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: corsHeaders });
    }
    const userId = user.id;

    // Paid plans only
    const { data: planRow } = await supabase.from('user_tokens').select('plan').eq('user_id', userId).maybeSingle();
    if ((planRow?.plan || 'free') === 'free') {
      return new Response(JSON.stringify({ error: 'upgrade_required' }), { status: 403, headers: corsHeaders });
    }

    // Connection + token
    const { data: conn } = await supabase
      .from('notion_connections')
      .select('access_token, database_id')
      .eq('user_id', userId)
      .maybeSingle();
    if (!conn?.access_token) {
      return new Response(JSON.stringify({ error: 'not_connected' }), { status: 400, headers: corsHeaders });
    }
    const token = conn.access_token;

    const body = await req.json();
    const type = TYPE_OPTIONS.includes(body.type) ? body.type : 'Hook';
    const name = String(body.name || '').trim().slice(0, 200) || type;
    const content = String(body.content || '').trim();

    // ── Resolve the "Content Ideas" database ──────────────────────────────────
    let databaseId = conn.database_id as string | null;

    if (!databaseId) {
      // Try to find an existing "Content Ideas" database the integration can see
      const search = await notion(token, 'search', {
        query: 'Content Ideas',
        filter: { value: 'database', property: 'object' },
      });
      const existing = (search.results || []).find((d: any) => {
        const t = (d.title || []).map((x: any) => x.plain_text).join('');
        return t.trim().toLowerCase() === 'content ideas';
      });

      if (existing) {
        databaseId = existing.id;
      } else {
        // Create it under the first page the user granted during OAuth
        const pageSearch = await notion(token, 'search', { filter: { value: 'page', property: 'object' } });
        const parentPage = (pageSearch.results || [])[0];
        if (!parentPage) {
          return new Response(JSON.stringify({ error: 'no_page', message: 'Grant the integration access to at least one Notion page, then try again.' }), { status: 400, headers: corsHeaders });
        }
        const created = await notion(token, 'databases', {
          parent: { type: 'page_id', page_id: parentPage.id },
          title: [{ type: 'text', text: { content: 'Content Ideas' } }],
          properties: {
            Type: { title: {} },
            Name: { rich_text: {} },
            Content: { rich_text: {} },
            Date: { date: {} },
          },
        });
        databaseId = created.id;
      }
      await supabase.from('notion_connections').update({ database_id: databaseId }).eq('user_id', userId);
    }

    // ── Create the page ───────────────────────────────────────────────────────
    const children: unknown[] = [];
    if (content) {
      children.push({ object: 'block', type: 'heading_2', heading_2: { rich_text: [{ type: 'text', text: { content: `Full ${type}` } }] } });
      children.push(...textToBlocks(content));
    }

    await notion(token, 'pages', {
      parent: { database_id: databaseId },
      properties: {
        Type: { title: [{ type: 'text', text: { content: type } }] },
        Name: { rich_text: [{ type: 'text', text: { content: name } }] },
        ...(content ? { Content: { rich_text: [{ type: 'text', text: { content: content.slice(0, 2000) } }] } } : {}),
        Date: { date: { start: new Date().toISOString() } },
      },
      children,
    });

    return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (error) {
    console.error('[notion-save] Error:', error);
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : 'Internal error' }), { status: 500, headers: corsHeaders });
  }
});
