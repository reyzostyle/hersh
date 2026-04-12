import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

async function fetchCaptionsJson3(ytVideoId: string): Promise<string> {
  const url = `https://www.youtube.com/api/timedtext?lang=en&v=${ytVideoId}&fmt=json3`;
  const res = await fetch(url);
  if (!res.ok) return "";
  const text = await res.text();
  if (!text || text.trim() === "") return "";
  try {
    const data = JSON.parse(text);
    if (!data.events || !Array.isArray(data.events)) return "";
    const parts: string[] = [];
    for (const event of data.events) {
      if (!event.segs) continue;
      for (const seg of event.segs) {
        if (seg.utf8 && seg.utf8 !== "\n") {
          parts.push(seg.utf8);
        }
      }
    }
    return parts.join(" ").replace(/\s+/g, " ").trim();
  } catch {
    return "";
  }
}

async function fetchCaptionsXml(ytVideoId: string): Promise<string> {
  const url = `https://www.youtube.com/api/timedtext?lang=en&v=${ytVideoId}`;
  const res = await fetch(url);
  if (!res.ok) return "";
  const xml = await res.text();
  if (!xml || xml.trim() === "") return "";
  const matches = xml.match(/<text[^>]*>([\s\S]*?)<\/text>/g);
  if (!matches) return "";
  const parts = matches.map(m => {
    return m.replace(/<[^>]+>/g, "")
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .trim();
  });
  return parts.join(" ").replace(/\s+/g, " ").trim();
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: corsHeaders });
    }
    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: corsHeaders });
    }
    const userId = user.id;

    const { videoId } = await req.json();

    if (!videoId) {
      return new Response(
        JSON.stringify({ error: "videoId is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { data: video, error: videoError } = await supabase
      .from("videos")
      .select("id, video_id")
      .eq("id", videoId)
      .eq("user_id", userId)
      .maybeSingle();

    if (videoError || !video) {
      return new Response(
        JSON.stringify({ error: "Video not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const ytVideoId = video.video_id;

    let transcript = await fetchCaptionsJson3(ytVideoId);

    if (!transcript) {
      transcript = await fetchCaptionsXml(ytVideoId);
    }

    if (!transcript) {
      return new Response(
        JSON.stringify({ error: "No captions available for this video" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    await supabase
      .from("videos")
      .update({ script: transcript })
      .eq("id", videoId)
      .eq("user_id", userId);

    return new Response(
      JSON.stringify({ success: true, transcript }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : "Internal error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
