// What the chat is allowed to go and look up about the creator it is talking to.
//
// The point of this file is that Chumoku stops being four screens that happen
// to share a login. The ideas saved in Ideas, the notes on a project, the
// conversations already had, the scores of the last videos - they are all in
// the same database and the chat could see none of them. It knew the channel
// (the brain) and the review in front of it, and nothing else, so anything
// slightly off script got an answer written by a model with amnesia.
//
// Two rules hold this together.
//
// FIRST: the user id comes from the verified JWT and NEVER from the model.
// Every function here takes userId as its own argument and filters on it, and
// no tool takes an owner as a parameter. A model that hallucinated somebody
// else's id would be asking for a row the query cannot return. This is the one
// invariant in this file that must not be relaxed - a tool surface over a
// multi-tenant database is exactly where a prompt injection would try to walk
// sideways, and the answer is that there is nowhere to walk.
//
// SECOND: everything here is READ-ONLY. The model can look; it cannot write,
// delete, spend or file anything. Giving a language model the ability to change
// a creator's saved work on the strength of a sentence it read is not a feature
// anybody asked for.

import { type ToolSpec, type ToolCall } from './llm.ts';

// Deliberately small. Every row here is tokens the answer is paying for, and a
// question about "my ideas" is answered as well by the eight most relevant as
// by eighty.
const LIMIT = 8;
const TEXT_CAP = 400;

const clip = (s: string | null | undefined, n = TEXT_CAP) =>
  !s ? null : s.length > n ? `${s.slice(0, n)}...` : s;

export const CREATOR_TOOLS: ToolSpec[] = [
  {
    name: 'search_ideas',
    description:
      "Search the creator's own saved video ideas, the ones they kept from the Ideas tab. Use whenever they mention their ideas, what they were planning to make, or ask what to film next. Leave the query empty to get the most recent.",
    parameters: {
      type: 'OBJECT',
      properties: {
        query: { type: 'STRING', description: 'Words to match against the idea and the source video title. Empty for the most recent.' },
      },
    },
  },
  {
    name: 'list_projects',
    description:
      "List the creator's projects with their notes. Use when they mention a project by name, ask what they are working on, or refer to something they wrote down.",
    parameters: { type: 'OBJECT', properties: {} },
  },
  {
    name: 'open_project',
    description:
      'Everything filed under one project: its notes, the conversations in it and the ideas saved to it. Use after list_projects when they mean a specific one.',
    parameters: {
      type: 'OBJECT',
      properties: { name: { type: 'STRING', description: 'The project name, as it came back from list_projects.' } },
      required: ['name'],
    },
  },
  {
    name: 'recent_analyses',
    description:
      "The creator's recent video reviews: the score, the verdict, and whether the video was their own or someone else's. Use when they ask how their videos have been doing, what has been working, or refer to a video they ran through here before.",
    parameters: { type: 'OBJECT', properties: {} },
  },
  {
    name: 'my_videos',
    description:
      "The creator's own uploaded videos with real numbers - views, retention percentage, average view duration. Use when the question is about how their channel is actually performing, or needs a real number rather than an impression.",
    parameters: { type: 'OBJECT', properties: {} },
  },
  {
    name: 'search_conversations',
    description:
      'Search earlier conversations the creator has had here, by what was said in them. Use when they refer back to something discussed before - "like we said last week", "that hook you wrote me".',
    parameters: {
      type: 'OBJECT',
      properties: { query: { type: 'STRING', description: 'Words to look for in past messages.' } },
      required: ['query'],
    },
  },
];

// deno-lint-ignore no-explicit-any
type DB = any;

async function searchIdeas(supabase: DB, userId: string, query: string) {
  let q = supabase
    .from('competitor_ideas')
    .select('video_title, channel_name, concept, adapted_idea, video_views, created_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(LIMIT);
  if (query?.trim()) {
    const safe = query.replace(/[%,()]/g, ' ').trim();
    q = q.or(`adapted_idea.ilike.%${safe}%,concept.ilike.%${safe}%,video_title.ilike.%${safe}%`);
  }
  const { data } = await q;
  // deno-lint-ignore no-explicit-any
  return (data ?? []).map((r: any) => ({
    idea: clip(r.adapted_idea) ?? clip(r.concept),
    from_video: r.video_title,
    from_channel: r.channel_name,
    saved: r.created_at?.slice(0, 10),
  }));
}

async function listProjects(supabase: DB, userId: string) {
  const { data } = await supabase
    .from('projects').select('name, notes, updated_at')
    .eq('user_id', userId).order('updated_at', { ascending: false }).limit(20);
  // deno-lint-ignore no-explicit-any
  return (data ?? []).map((p: any) => ({
    name: p.name,
    notes: clip(p.notes),
    last_touched: p.updated_at?.slice(0, 10),
  }));
}

async function openProject(supabase: DB, userId: string, name: string) {
  const { data: rows } = await supabase
    .from('projects').select('id, name, notes')
    .eq('user_id', userId).ilike('name', name).limit(1);
  const project = rows?.[0];
  if (!project) return { error: `No project called "${name}".` };

  const [{ data: threads }, { data: ideas }] = await Promise.all([
    supabase.from('chat_threads').select('title, updated_at')
      .eq('project_id', project.id).order('updated_at', { ascending: false }).limit(LIMIT),
    supabase.from('competitor_ideas').select('adapted_idea, concept, video_title')
      .eq('project_id', project.id).order('created_at', { ascending: false }).limit(LIMIT),
  ]);

  return {
    name: project.name,
    notes: clip(project.notes, 1200),
    // deno-lint-ignore no-explicit-any
    conversations: (threads ?? []).map((t: any) => ({ title: t.title, when: t.updated_at?.slice(0, 10) })),
    // deno-lint-ignore no-explicit-any
    ideas: (ideas ?? []).map((i: any) => ({ idea: clip(i.adapted_idea) ?? clip(i.concept), from_video: i.video_title })),
  };
}

async function recentAnalyses(supabase: DB, userId: string) {
  const { data } = await supabase
    .from('analyses').select('hook_analysis, weak_spots, is_my_video, created_at')
    .eq('user_id', userId).order('created_at', { ascending: false }).limit(LIMIT);
  // deno-lint-ignore no-explicit-any
  return (data ?? []).map((a: any) => ({
    title: a.hook_analysis?.title ?? null,
    score: a.hook_analysis?.overall_score ?? null,
    verdict: clip(a.hook_analysis?.overall_assessment, 220),
    // The three-state value where there is one; older rows only have the
    // boolean, and a boolean cannot tell "not theirs" from "never checked".
    whose: a.hook_analysis?.ownership ?? (a.is_my_video ? 'mine' : 'unknown'),
    main_fix: clip(a.weak_spots?.[0], 160),
    when: a.created_at?.slice(0, 10),
  }));
}

async function myVideos(supabase: DB, userId: string) {
  const { data } = await supabase
    .from('videos')
    .select('title, views, retention_percentage, average_view_duration, duration, published_at')
    .eq('user_id', userId).order('published_at', { ascending: false }).limit(LIMIT);
  // deno-lint-ignore no-explicit-any
  return (data ?? []).map((v: any) => ({
    title: v.title,
    views: v.views,
    retention_percent: v.retention_percentage,
    avg_view_seconds: v.average_view_duration,
    length_seconds: v.duration,
    published: v.published_at?.slice(0, 10),
  }));
}

async function searchConversations(supabase: DB, userId: string, query: string) {
  const safe = (query ?? '').replace(/[%,()]/g, ' ').trim();
  if (!safe) return [];
  const { data } = await supabase
    .from('chat_messages').select('content, role, created_at, thread_id')
    .eq('user_id', userId).ilike('content', `%${safe}%`)
    .order('created_at', { ascending: false }).limit(LIMIT);
  // deno-lint-ignore no-explicit-any
  return (data ?? []).map((m: any) => ({
    said_by: m.role === 'user' ? 'the creator' : 'you',
    text: clip(m.content, 300),
    when: m.created_at?.slice(0, 10),
  }));
}

/**
 * Runs one tool call. `userId` is the caller's verified id and is the only
 * thing that decides whose rows come back - it is never read from `call.args`.
 */
export async function runCreatorTool(supabase: DB, userId: string, call: ToolCall): Promise<unknown> {
  const arg = (k: string) => String(call.args?.[k] ?? '');
  switch (call.name) {
    case 'search_ideas': return await searchIdeas(supabase, userId, arg('query'));
    case 'list_projects': return await listProjects(supabase, userId);
    case 'open_project': return await openProject(supabase, userId, arg('name'));
    case 'recent_analyses': return await recentAnalyses(supabase, userId);
    case 'my_videos': return await myVideos(supabase, userId);
    case 'search_conversations': return await searchConversations(supabase, userId, arg('query'));
    // Not an exception: the model asking for a tool that does not exist is
    // something it can recover from if it is told so.
    default: return { error: `No tool called ${call.name}.` };
  }
}
