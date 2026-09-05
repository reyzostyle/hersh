import { supabase, getUserId } from './supabase';

// A project is a grouping, not a container. Nothing has to live in one, and
// deleting one never takes the work with it - project_id is ON DELETE SET NULL
// everywhere. It replaces the old idea_folders, which grouped competitor ideas
// and nothing else, so a saved idea and the conversation it started could not
// be filed together.
export interface Project {
  id: string;
  name: string;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface ProjectThread {
  id: string;
  title: string | null;
  created_at: string;
  updated_at: string;
}

export async function listProjects(): Promise<Project[]> {
  const userId = await getUserId();
  if (!userId) return [];
  const { data } = await supabase
    .from('projects').select('id, name, notes, created_at, updated_at')
    .eq('user_id', userId).order('updated_at', { ascending: false });
  return data ?? [];
}

export async function createProject(name: string): Promise<Project | null> {
  const userId = await getUserId();
  if (!userId) return null;
  const { data, error } = await supabase
    .from('projects').insert({ user_id: userId, name })
    .select('id, name, notes, created_at, updated_at').single();
  if (error) { console.error('[projects] create', error); return null; }
  return data;
}

// updated_at is bumped on every write so the list stays in the order work
// actually happened, not the order things were created.
export async function touchProject(id: string): Promise<void> {
  await supabase.from('projects').update({ updated_at: new Date().toISOString() }).eq('id', id);
}

export async function saveNotes(id: string, notes: string): Promise<void> {
  await supabase.from('projects')
    .update({ notes, updated_at: new Date().toISOString() }).eq('id', id);
}

export async function renameProject(id: string, name: string): Promise<void> {
  await supabase.from('projects')
    .update({ name, updated_at: new Date().toISOString() }).eq('id', id);
}

// Taking something out of a project ungroups it and nothing more: the chat and
// the idea both still exist, they just stop being filed here. Same reasoning as
// ON DELETE SET NULL on the column itself.
export async function unfileIdea(ideaId: string): Promise<void> {
  await supabase.from('competitor_ideas').update({ project_id: null }).eq('id', ideaId);
}

export async function deleteProject(id: string): Promise<void> {
  await supabase.from('projects').delete().eq('id', id);
}

// Everything filed under a project, from both tabs.
export async function loadProjectContents(projectId: string) {
  const [{ data: threads }, { data: ideas }] = await Promise.all([
    supabase.from('chat_threads').select('id, title, created_at, updated_at')
      .eq('project_id', projectId).order('updated_at', { ascending: false }),
    supabase.from('competitor_ideas').select('*')
      .eq('project_id', projectId).order('created_at', { ascending: false }),
  ]);
  return { threads: (threads ?? []) as ProjectThread[], ideas: ideas ?? [] };
}

export async function fileThread(threadId: string, projectId: string | null): Promise<void> {
  await supabase.from('chat_threads').update({ project_id: projectId }).eq('id', threadId);
  if (projectId) await touchProject(projectId);
}

// ─── Reopening a conversation ────────────────────────────────────────────────

// chat_messages was written by the chat and read by nothing, in any component,
// since the table was created. A thread could be filed into a project, listed
// by title, and never opened again - the product was keeping a record only it
// could see.
export interface ThreadMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  // The scored reply, when the message carries one.
  // deno-lint-ignore no-explicit-any
  analysis: any | null;
  created_at: string;
}

// The last conversations, filed or not.
//
// A thread is created for every analysis, and until now the only way back into
// one was to have filed it into a project first. Everything else stayed in the
// database, reachable by nothing.
export interface RecentThread {
  id: string;
  title: string | null;
  updated_at: string;
  project_id: string | null;
}

export async function listRecentThreads(limit = 8): Promise<RecentThread[]> {
  const userId = await getUserId();
  if (!userId) return [];
  const { data } = await supabase
    .from('chat_threads')
    .select('id, title, updated_at, project_id')
    .eq('user_id', userId)
    .order('updated_at', { ascending: false })
    .limit(limit);
  return (data ?? []) as RecentThread[];
}

// Threads are titled from the video's own name, or from the first 60 characters
// of whatever was pasted, so plenty of them read badly. Renaming is what makes
// the list scannable a week later.
export async function renameThread(id: string, title: string): Promise<void> {
  await supabase.from('chat_threads').update({ title }).eq('id', id);
}

// chat_messages is ON DELETE CASCADE on thread_id, so the messages go with it.
// A thread is written on every analysis including the throwaway ones, so the
// list needs a way to stay worth reading.
export async function deleteThread(id: string): Promise<void> {
  await supabase.from('chat_threads').delete().eq('id', id);
}

export async function loadThreadMessages(threadId: string): Promise<ThreadMessage[]> {
  const { data, error } = await supabase
    .from('chat_messages')
    .select('id, role, content, analysis, created_at')
    .eq('thread_id', threadId)
    .order('created_at', { ascending: true });
  if (error) { console.error('[projects] loadThreadMessages', error); return []; }
  return (data ?? []) as ThreadMessage[];
}

export async function loadThread(threadId: string): Promise<{ title: string | null; project_id: string | null } | null> {
  const { data } = await supabase
    .from('chat_threads').select('title, project_id').eq('id', threadId).maybeSingle();
  return data ?? null;
}

// Handing a thread from Projects to Analyze. Same idiom the landing page uses
// to pass a pasted link through signup: the tab remounts on switch, so a key in
// storage is read once on the other side and cleared.
const OPEN_THREAD_KEY = 'chumoku_open_thread';
const OPEN_VIDEO_KEY = 'chumoku_open_competitor_video';

export function requestOpenThread(threadId: string) {
  localStorage.setItem(OPEN_THREAD_KEY, threadId);
  window.dispatchEvent(new CustomEvent('chumoku:navigate', { detail: 'analyze' }));
}

export function takeRequestedThread(): string | null {
  const id = localStorage.getItem(OPEN_THREAD_KEY);
  if (id) localStorage.removeItem(OPEN_THREAD_KEY);
  return id;
}

export function requestOpenVideo(videoId: string) {
  localStorage.setItem(OPEN_VIDEO_KEY, videoId);
  window.dispatchEvent(new CustomEvent('chumoku:navigate', { detail: 'competitors' }));
}

export function takeRequestedVideo(): string | null {
  const id = localStorage.getItem(OPEN_VIDEO_KEY);
  if (id) localStorage.removeItem(OPEN_VIDEO_KEY);
  return id;
}
