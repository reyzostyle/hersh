const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Client-Info, Apikey',
};

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 200, headers: corsHeaders });

  try {
    const { uploadUrl, chunkBase64, offset, isLast, mimeType } = await req.json();

    if (!uploadUrl || !chunkBase64) {
      return new Response(JSON.stringify({ error: 'Missing uploadUrl or chunkBase64' }), { status: 400, headers: corsHeaders });
    }

    // Decode base64 chunk to bytes
    const binaryStr = atob(chunkBase64);
    const chunkBytes = new Uint8Array(binaryStr.length);
    for (let i = 0; i < binaryStr.length; i++) {
      chunkBytes[i] = binaryStr.charCodeAt(i);
    }

    const command = isLast ? 'upload, finalize' : 'upload';

    console.log(`[upload-video-chunk] offset=${offset}, size=${chunkBytes.length}, isLast=${isLast}`);

    const uploadRes = await fetch(uploadUrl, {
      method: 'POST',
      headers: {
        'Content-Length': String(chunkBytes.length),
        'X-Goog-Upload-Offset': String(offset),
        'X-Goog-Upload-Command': command,
      },
      body: chunkBytes,
    });

    if (!uploadRes.ok) {
      const errText = await uploadRes.text();
      throw new Error(`Gemini chunk upload failed (${uploadRes.status}): ${errText}`);
    }

    if (isLast) {
      const data = await uploadRes.json();
      const geminiFileName = data.file?.name;
      if (!geminiFileName) throw new Error('No Gemini file name in final chunk response');

      console.log(`[upload-video-chunk] Upload complete, geminiFileName=${geminiFileName}`);

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
