import { supabase } from './supabase';

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
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];
  const { data } = await supabase
    .from('projects').select('id, name, notes, created_at, updated_at')
    .eq('user_id', user.id).order('updated_at', { ascending: false });
  return data ?? [];
}

export async function createProject(name: string): Promise<Project | null> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data, error } = await supabase
    .from('projects').insert({ user_id: user.id, name })
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
