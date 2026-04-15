const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Client-Info, Apikey, X-Upload-Url, X-Upload-Offset, X-Is-Last',
};

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 200, headers: corsHeaders });

  try {
    const uploadUrl = req.headers.get('X-Upload-Url');
    const offset = req.headers.get('X-Upload-Offset') || '0';
    const isLast = req.headers.get('X-Is-Last') === 'true';
    const contentLength = req.headers.get('Content-Length') || '0';

    if (!uploadUrl) {
      return new Response(JSON.stringify({ error: 'Missing X-Upload-Url header' }), { status: 400, headers: corsHeaders });
    }

    const command = isLast ? 'upload, finalize' : 'upload';
    console.log(`[upload-video-chunk] offset=${offset}, isLast=${isLast}, size=${contentLength}`);

    // Stream request body directly to Gemini — no buffering, no size limit
    const uploadRes = await fetch(uploadUrl, {
      method: 'POST',
      headers: {
        'Content-Length': contentLength,
        'X-Goog-Upload-Offset': offset,
        'X-Goog-Upload-Command': command,
      },
      body: req.body,
    });

    if (!uploadRes.ok) {
      const errText = await uploadRes.text();
      throw new Error(`Gemini upload failed (${uploadRes.status}): ${errText}`);
    }

    if (isLast) {
      const data = await uploadRes.json();
      const geminiFileName = data.file?.name;
      if (!geminiFileName) throw new Error('No Gemini file name in response');
      console.log(`[upload-video-chunk] Done, geminiFileName=${geminiFileName}`);
      return new Response(
        JSON.stringify({ success: true, geminiFileName }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify({ success: true }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('[upload-video-chunk] Error:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
