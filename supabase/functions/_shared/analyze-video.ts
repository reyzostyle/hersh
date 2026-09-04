import type { AttachedImage } from './images.ts';
import { parseModelJson } from './json.ts';

// Shared video analysis: one Gemini call that both WATCHES the video and writes
// the verdict. Used by analyze-with-gemini (pasted YouTube link) and
// analyze-upload (uploaded file) so the two entry points can never drift apart.
// The model that watches the video is now also the model that writes the
// analysis, so this list can't lead with Flash-Lite any more: it was fine at
// "describe what you see", but the verdict is the product. Plain Flash first,
// Flash-Lite kept only as a last-resort degrade instead of a hard failure.
const GEMINI_MODELS = ['gemini-3.5-flash', 'gemini-2.5-flash', 'gemini-3.5-flash-lite'];
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

// Resilient Gemini call: rotates through models and retries transient errors
// (503 high-demand, 429 rate limit, 5xx) with exponential backoff across
// multiple rounds, so a temporary spike on one model doesn't fail the request.
// Takes a builder rather than a fixed body because the thinking config differs
// per model (see buildGeminiBody).
async function callGeminiWithRetry(buildBody: (model: string) => string, apiKey: string): Promise<Response> {
  let last: Response | null = null;
  const ROUNDS = 3;
  for (let round = 0; round < ROUNDS; round++) {
    for (const model of GEMINI_MODELS) {
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
        { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: buildBody(model) }
      );
      if (res.ok) { console.log(`[gemini] Success with ${model} (round ${round + 1})`); return res; }
      last = res;
      const transient = res.status === 503 || res.status === 429 || res.status >= 500;
      console.log(`[gemini] ${model} failed (${res.status}), transient=${transient}, round ${round + 1}`);
      if (!transient) return res; // 400/404 etc. won't be fixed by retrying
      await sleep(Math.min(1000 * Math.pow(2, round), 8000)); // 1s, 2s, 4s backoff between rounds
    }
  }
  return last as Response;
}

// Watch a video and answer a question about it, with no scoring pipeline
// attached. Same model rotation and the same retry behaviour as the analysis
// path - the only difference is that the caller supplies the whole prompt and
// gets raw text back.
//
// Exists because an outline written from a transcript is written blind. For a
// Short, half the craft is on screen and not in the words: where the cut lands,
// what the text overlay says, how the first frame is composed. A model that has
// only read the words can describe the topic and nothing about the execution.
export async function watchVideo(
  source: { fileUri: string; mimeType: string },
  prompt: string,
  opts: { system?: string; maxTokens: number },
): Promise<string> {
  const apiKey = Deno.env.get('GEMINI_API_KEY');
  if (!apiKey) throw new Error('Gemini API key not configured');

  // Same thinking rule as analyzeVideo below, and for the same reason: plain
  // Flash thinks by default, thinking tokens come out of maxOutputTokens, and
  // the visible answer gets silently truncated mid-object. Written without this
  // the first time, which is exactly how it failed - an outline request came
  // back with nothing parseable in it.
  const buildBody = (model: string) => {
    const isFlashLite = /flash-lite/i.test(model);
    return JSON.stringify({
      ...(opts.system ? { systemInstruction: { parts: [{ text: opts.system }] } } : {}),
      contents: [{
        role: 'user',
        parts: [
          { file_data: { mime_type: source.mimeType, file_uri: source.fileUri } },
          { text: prompt },
        ],
      }],
      generationConfig: {
        temperature: 0.7,
        maxOutputTokens: opts.maxTokens,
        ...(isFlashLite ? {} : { thinkingConfig: { thinkingBudget: 0 } }),
      },
    });
  };

  const res = await callGeminiWithRetry(buildBody, apiKey);
  if (!res.ok) throw new Error(`Gemini video call failed (${res.status}): ${await res.text()}`);
  const data = await res.json();
  const cand = data.candidates?.[0];
  const text = cand?.content?.parts?.[0]?.text;
  if (!text) {
    // finishReason names the actual cause - MAX_TOKENS, SAFETY, RECITATION -
    // instead of leaving every failure looking the same from the outside.
    throw new Error(`Gemini returned no text for the video (finishReason: ${cand?.finishReason ?? 'none'})`);
  }
  return text as string;
}

// One call does the whole job: the model watches the video AND writes the
// verdict. `source` is whatever Gemini can read: a YouTube URL for the paste
// flow, or a Files API uri for an uploaded file - both paths share this.
// The old two-pass split (Gemini watches, a text-only model judges)
// is what made the output generic — the judging model only ever saw a prose
// summary, so it could never name the moment it was fixing. Here the model
// that saw 0:04 is the one writing the fix for 0:04, and the retention curve
// arrives alongside the footage instead of in a separate text-only pass.
export async function analyzeVideo(
  source: { fileUri: string; mimeType: string },
  video: any,
  profile: any,
  videoContext?: string,
  supabase?: any,
  creatorLevel?: string,
  // Screenshots sent along with the video. The usual one is the retention
  // curve: for a video that is not the creator's own, or whose channel is not
  // connected, that curve exists nowhere this code can reach, and only they
  // can put it on the table.
  extraImages?: AttachedImage[],
) {
  const geminiApiKey = Deno.env.get('GEMINI_API_KEY');
  if (!geminiApiKey) throw new Error('Gemini API key not configured');

  // Fetch knowledge base
  let knowledgeBaseSection = '';
  if (supabase) {
    const { data: kbRecords } = await supabase
      .from('knowledge_base')
      .select('category, title, content')
      .order('category');
    if (kbRecords && kbRecords.length > 0) {
      knowledgeBaseSection = kbRecords
        .map((r: any) => `[${r.category}] ${r.title}: ${r.content}`)
        .join('\n');
    }
  }

  const level = creatorLevel || 'intermediate';

  const systemPrompt = `You are a senior short-form video editor and retention specialist. You are watching this Short yourself, with the sound on, and giving the creator the exact edits to make. You are not a scriptwriter: every fix you give must be something a creator can apply to their EXISTING footage in CapCut/Premiere in under 3 minutes. Never suggest rewriting the script, re-shooting, or restructuring the story.

HOW TO WORK - two stages, in this order, never skip ahead.

STAGE 1: OBSERVE. Before you judge anything, build a beat-by-beat timeline of the video. One entry per beat, where a beat is: a hard cut, a zoom or camera move, a text overlay appearing or changing, a sound effect, a music change, or a clear shift in delivery or energy. Aim for 10-20 entries on a 30-60s Short; never fewer than 8 unless the video genuinely has almost no cuts. Describe what IS there, not what should be there. No judgement, no advice in this stage.

CUTS ARE NOT MOTION. This is the single easiest thing to get wrong. Switching to a different shot is a HARD CUT, no matter how much tighter the new framing is. Only call it a punch-in, zoom or push if the framing scales WITHIN one continuous shot, with the same subject in the same setting moving closer or further across frames. If you are not certain the framing moved inside a single shot, it is a hard cut. A video built entirely of hard cuts has NO camera motion, and saying otherwise sends the creator looking for an effect that isn't in their timeline.

HEAR EVERY LAYER. The audio field is an inventory, not a summary. At each beat name every layer you can actually hear: the voiceover, the music, and each sound effect BY NAME. Use the real name a short-form editor would call it, whatever that is - risers and swells, whooshes and transitions, impacts, booms and braams, sub-drops, cash registers, pops and clicks, glitches, vinyl scratches, record rewinds, airhorns, typewriter clacks, camera shutters, bells, applause, laugh tracks, boings, and anything else you hear. Those are examples, not a menu: name what is actually there even when it is not in that list. If a beat has no sound effect, write "no SFX" for that beat. Never write filler like "voiceover and music continue" - it hides exactly the information the fixes depend on. Also note when music sits on top of the voice, or an SFX lands too quiet to register.

STAGE 2: JUDGE. Only now score the video and write the fixes, and anchor every single one to a specific beat from your own timeline.

CREATOR LEVEL: ${level}
- beginner: explain the "why" behind each edit, avoid jargon, focus on the 1-2 fixes that matter most. Encouraging but honest.
- intermediate: skip fundamentals (they know hook/retention/CTA). Focus on the specific edit to make and exactly where.
- advanced: reference advanced editing concepts (pattern interrupts via cut rhythm, retention-curve-driven pacing, loop mechanics, cold-open crops). Challenge assumptions, be opinionated.

SCORING (overall_score: integer 1-100). Build the score from components so it actually spreads - do NOT pick a round number and do NOT default to the 70s.
First score FOUR components honestly, then SUM them into overall_score:
- Hook strength (0-30): does the first 0-3s stop the scroll for THIS format's hook?
- Retention & pacing (0-25): does it hold attention - no dead air, no drag, no filler?
- Payoff & ending (0-25): does it deliver on the hook's promise and end with a reason to stay/act?
- Clarity & delivery (0-20): audio, visuals, energy, comprehension.
overall_score = hook + retention + payoff + delivery. Output the EXACT sum. Avoid magnet numbers (50, 70, 75, 80, 85) - if the math lands on 73 or 61, say 73 or 61.
Bands for sanity-check only: 85-100 exceptional (rare), 70-84 strong, 55-69 decent with clear fixes, 40-54 below average, 25-39 weak, 1-24 broken.
A genuinely strong Short earns 80+ when each component is high. A weak or average video MUST land below 60. Viral views != good hook. Never inflate to be nice, never hedge a strong one down.

HOOK TYPES (id the type, judge execution for THAT type): curiosity gap, pattern interrupt, contrarian, story cold open, transformation/result-first, direct question, shock/surprise, list/number.

FORMATS (id format first, evaluate by its own rules):
- Storytime: hook = most dramatic moment/stakes, NOT intro
- Tutorial: hook = end result or pain solved upfront
- Listicle: hook = most surprising item / list promise
- POV: hook = visually unexpected or emotionally immediate
- Talking head: hook = most provocative claim/question, stated first
- Voiceover: hook = strong first VO line, not setup
- Reaction: hook = genuine reaction moment, not intro
- Showcase: hook = most impressive visual, shown first

STORYTIME (when format=storytime): hook = most dramatic/emotional moment, not info promise. Slow buildup can be intentional - only flag if it kills tension. Flag opening with context instead of conflict. Judge speed of emotional stakes, not speed of info. Never apply tutorial/talking-head logic here.

EDITING PILLARS - every weak_spot and strong_spot must fall into one of these five, and every weak_spot must name the exact fix:
1. Visual Motion & Pacing: punch-in zooms, screen shake, speed ramps, cut rhythm, background/transition changes. Name the exact beat and the exact motion to add or cut.
2. Audio & SFX Triggers: reach for the whole sound-design vocabulary you know, not just the handful of effects named in these instructions - pick the effect that actually fits the moment. State the exact sound effect and exactly where it lands (e.g. "whoosh on the 0:04 cut", "cash register SFX on 'money'", "pop on each text overlay"). PLACEMENT RULE: a sound effect goes on the exact word or frame it illustrates. Name the word and its timestamp, never just the region. When a word or idea recurs, the same effect can and often should land more than once - a cash register on the word "money" in the hook AND again on the dollar figure later is correct, not redundant, so call out every placement worth making. And do not skip the hook: if the first 3 seconds say a word that earns an effect, that placement comes first, because that is where the swipe happens.
3. Typography & Graphics: exact styling command - which word to highlight and in what color, what PNG/meme/overlay to drop in and over what line. LITERALISM SWEEP: walk the transcript against your timeline and find every concrete noun, brand or number the voiceover says while nothing on screen shows it. Each one is a missing visual - name the word and the asset to drop in over it (a money PNG over "money", the platform logo over its name, the product shot over the product). Talking-head or stock footage running under a specific claim counts as nothing on screen showing it.
4. First 3 Seconds (Hook Polish): fix the EXISTING footage, don't re-script - crop tighter, speed the opening audio 1.1-1.3x, add an instant visual overlay in frame 1, cut in later or earlier. AT LEAST ONE weak_spot must land in the first 3 seconds. That is where the swipe happens, and it is what the creator is really asking about even when they don't say so.
NO-MOTION RULE: if your timeline contains no punch-in, zoom, pan or speed ramp anywhere, the edit has zero camera motion and cutting faster will not fix that. One weak_spot must then add motion to one named clip, and the opening clip comes first - a slow punch-in across its full length gives the hook movement without touching the footage.
5. Technical & Sync Fixes: audio balance (music or SFX drowning the voice, or a lifeless SFX), dead air between lines, captions that don't match the voiceover, footage that doesn't match what's being said. Raise these only where you actually heard or saw the defect while building the timeline, and give the correction in relative terms (duck the music under the voice, trim the gap, retime the caption, swap the shot).

RETENTION HANDLING
If a drop-off list is provided, it comes from this channel's real audience-retention curve. For each drop, find the beat in your own timeline that sits at that moment, say what is happening there, and give the edit that fixes it. That mapping is the most valuable thing in the whole analysis - lead with it. If retention is N/A, base pacing fixes on the timeline alone and never invent numbers.

HARD RULES
1. Every strong_spot and weak_spot MUST begin with a timestamp from your own timeline, formatted "M:SS - ". If you cannot point at a specific beat, do not say it at all.
2. Timestamps are approximate, so always also quote the words being spoken at that moment (or name what is on screen if it is silent) so the creator can find it.
3. Never invent retention numbers, views, or stats. Never state decibel levels or exact pause durations - you cannot measure those. Numbers you can actually READ off an attached screenshot are the exception: those are measured, quote them.
4. If niche/channel profile is N/A, analyze the video on its own merits. Don't guess the niche.
5. Banned generic phrases: "engaging content", "great hook", "good pacing", "keep it up", "consider adding", "you could try", "just make sure", "overall this is a solid video" - and banned generic script notes like "tighten the intro" or "restructure the opening" (that's a script fix, not an edit).
6. No flattery. No recap of what the video does. Tell them what's wrong with the edit.
7. strong_spots: min 1, max 3. weak_spots: min 3, max 6. Each under 2 sentences. Only what's genuinely true - don't pad to hit the minimum, but don't stop at two vague notes when the timeline shows more.
8. Every weak_spot must be an editing fix a creator can apply to the footage they already have, in under 3 minutes in CapCut/Premiere - never a note about rewriting, re-shooting, or restructuring the script.
9. Never tell the creator to add something your own timeline already lists at that beat. Check the timeline first: if the zoom, SFX or overlay is already there, either leave it alone or say to strengthen it ("push the existing zoom further", "raise the riser under the voice"), and say plainly that it is already present. Prescribing an effect that is already in the edit is the fastest way to lose their trust.
10. You watched this video yourself - write as the reviewer. Never name or hint at any AI model, vendor, or pipeline stage (Gemini, Claude, GPT, "the AI", "the model", "visual analysis confirms", etc.). Just say what's on screen and in the audio, plainly, like you saw it with your own eyes.

OUTPUT (overall_assessment): 3-4 sentences, senior editor to a peer editor. No fixed template, vary your opening. Cover the main edit issue, how the hook's footage performs specifically, one pacing/visual observation, and end with the single most important edit to make. Sound like a real person, not a report. Break it into 2-3 short paragraphs separated by a blank line (\\n\\n) so it's easy to read - never one dense block.

PUNCTUATION: never use em-dash or en-dash anywhere. Only the regular hyphen (-).

TONE: peer-to-peer senior editor notes. Zero fluff, direct, specific, opinionated. Like texting a friend the exact edits to make.

${knowledgeBaseSection ? `KNOWLEDGE BASE (learned patterns - use as instinct, don't quote, treat as priors not rules):\n${knowledgeBaseSection}\n` : ''}`;

  const dur = video.duration ? `${video.duration}s` : 'N/A';
  const views = video.views != null ? video.views.toLocaleString() : 'N/A - not published yet or no access';
  const likes = video.likes_count != null ? video.likes_count.toLocaleString() : 'N/A';

  const hasRetention = video.retention_percentage != null && video.average_view_duration != null;
  const hasDrops = !!video.retention_drops;
  const dropLine = hasDrops
    ? `Biggest viewer drop-offs (from this channel's REAL audience-retention curve): ${video.retention_drops}. Map each of these onto your timeline: say what is happening on screen and in the audio at that beat, and how to fix it.`
    : `Biggest drops: N/A - drop-off curve not available`;
  const retentionSection = hasRetention
    ? `Avg view duration: ${video.average_view_duration}s (${video.retention_percentage}% average view)\n${dropLine}`
    : hasDrops
      ? dropLine
      : `N/A - retention data not available for this video.\nAnalyze based on the timeline, hook, and content only.`;

  // Don't use channel profile for external videos - they're someone else's content
  const hasProfile = !video.is_external && (profile.channel_niche || profile.channel_description);
  const profileSection = hasProfile
    ? `Niche: ${profile.channel_niche || 'N/A'}\nDescription: ${profile.channel_description || 'N/A'}${profile.channel_context ? `\nAdditional Context: ${profile.channel_context}` : ''}\n\nRELEVANCE RULE: Only tailor the analysis to this niche if THIS video's actual content clearly fits it. If the video is obviously a different topic/niche than described above, IGNORE this profile completely and analyze the video on its own merits - do not force the creator's niche onto unrelated content.`
    : `N/A - channel profile not provided`;

  const prompt = `Watch and listen to this Short in full, then work through STAGE 1 and STAGE 2.

## Video Stats
Title: ${video.title || 'N/A'}
Duration: ${dur}
Views: ${views}
Likes: ${likes}

## Retention Data
${retentionSection}

## Channel Profile
${profileSection}

## User Context
${videoContext?.trim() || 'N/A - no extra context provided'}
${extraImages?.length ? `
## Attached screenshots
${extraImages.length === 1 ? 'A screenshot is' : `${extraImages.length} screenshots are`} attached alongside the video, usually the retention curve or the traffic sources. Read the numbers off ${extraImages.length === 1 ? 'it' : 'them'} and use them as real data about THIS video. Say the ones you reason from out loud so they can check you read the screen right. If a value is cut off or ambiguous, say so rather than picking one.` : ''}

Respond with valid JSON only, no markdown, with the keys in exactly this order - the timeline comes first because you build it before you judge:
{
  "timeline": [
    { "at": "M:SS", "motion": "hard cut | punch-in | zoom out | pan | speed ramp | shake | static", "visual": "what is on screen at this beat", "audio": "every layer heard here, each SFX by name, or 'no SFX'", "words": "the words being spoken here, or SILENT" }
  ],
  "transcript": "full word-for-word transcript of everything spoken",
  "hook_visual": "what happens visually in the first 3-5 seconds",
  "visual_observations": "editing style, cut rhythm, text overlays, engagement tactics, CTA",
  "overall_energy": "low|medium|high",
  "technical_audit": "one line per real defect found while building the timeline (audio balance, dead air, caption sync, visual sync), formatted 'M:SS - CATEGORY: what is wrong + the words spoken there', where CATEGORY is replaced by one of AUDIO BALANCE, DEAD AIR, CAPTION SYNC or VISUAL SYNC - never leave the word CATEGORY in the output. Only these four defect types belong here; a missing graphic or a flat-looking overlay is an editing note, not a sync defect, so it goes in weak_spots instead. Exactly NONE if there are none.",
  "hook_type": "<identified hook type from the list>",
  "video_format": "<identified video format from the list>",
  "score_breakdown": { "hook": <0-30>, "retention": <0-25>, "payoff": <0-25>, "delivery": <0-20> },
  "overall_score": <integer 1-100, the EXACT sum of the four components>,
  "overall_assessment": "3-4 sentences, 2-3 short paragraphs",
  "strong_spots": [
    "M:SS - an editing choice that works and why (max 2 sentences)"
  ],
  "weak_spots": [
    "M:SS - what is wrong at this beat + the exact fix to apply, doable in under 3 minutes (max 2 sentences)"
  ]
}`;

  console.log('[gemini] Analyzing video:', source.fileUri);

  // Plain Flash thinks by default and thinking tokens draw from the same
  // maxOutputTokens budget as the visible answer, which silently truncates the
  // JSON mid-object. The STAGE 1 timeline is the reasoning here and it's in the
  // visible output, so thinking is turned off for those models and left alone
  // for Flash-Lite (3.5 Flash-Lite 400s on an explicit thinkingBudget: 0).
  const buildGeminiBody = (model: string) => {
    const isFlashLite = /flash-lite/i.test(model);
    return JSON.stringify({
      systemInstruction: { parts: [{ text: systemPrompt }] },
      contents: [{
        role: 'user',
        parts: [
          { file_data: { mime_type: source.mimeType, file_uri: source.fileUri } },
          ...(extraImages ?? []).map(im => ({ inline_data: { mime_type: im.mimeType, data: im.base64 } })),
          { text: prompt },
        ],
      }],
      generationConfig: {
        temperature: 0.2,
        // Roomy on purpose: the timeline, the transcript and the verdict all
        // share this budget now, and a truncation loses the entire analysis.
        maxOutputTokens: 12288,
        ...(isFlashLite ? {} : { thinkingConfig: { thinkingBudget: 0 } }),
      },
    });
  };

  const response = await callGeminiWithRetry(buildGeminiBody, geminiApiKey);
  if (!response.ok) {
    throw new Error(`Gemini API error: ${await response.text()}`);
  }

  const data = await response.json();
  const content = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!content) throw new Error('Empty response from Gemini');

  const stripDashes = (s: any): any => {
    if (typeof s === 'string') return s.replace(/[—–]/g, '-');
    if (Array.isArray(s)) return s.map(stripDashes);
    if (s && typeof s === 'object') {
      const out: any = {};
      for (const k of Object.keys(s)) out[k] = stripDashes(s[k]);
      return out;
    }
    return s;
  };

  const parsed = stripDashes(parseModelJson(content, 'Gemini response'));

  console.log(`[gemini] timeline beats: ${parsed.timeline?.length ?? 0}, weak_spots: ${parsed.weak_spots?.length ?? 0}, score: ${parsed.overall_score}`);
  return parsed;
}
