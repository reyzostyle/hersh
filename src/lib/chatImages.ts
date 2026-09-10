import { supabase, getUserId } from './supabase';

// Screenshots sent into a conversation, kept.
//
// They used to live only in React state: the thread stored "[screenshot]" and
// the answer, so reopening a conversation showed the model's reasoning about a
// picture nobody could see any more. For this product that is the worst half to
// lose - a Studio retention curve IS the question, and the answer without it
// reads as a reply to nothing.
//
// Private bucket, signed on read. Nothing here is public, and a screenshot of
// someone's channel numbers is exactly the kind of thing that must not be
// guessable from a URL.
const BUCKET = 'chat-images';

// Long enough to read a conversation through, short enough that a copied URL
// is not a permanent handle on someone's analytics.
const SIGNED_TTL_S = 60 * 60;

const extOf = (mime: string) =>
  mime === 'image/png' ? 'png' : mime === 'image/webp' ? 'webp' : 'jpg';

// Everything in this file fails soft. The bucket is created by a migration that
// is applied by hand against this project, so on a database that has not had it
// yet every call here is a no-op and the chat behaves exactly as it did before:
// the message goes through, the picture is simply not kept. Losing a screenshot
// must never cost someone the answer they paid for.
export async function uploadChatImages(threadId: string, files: File[]): Promise<string[]> {
  if (!files.length) return [];
  const userId = await getUserId();
  if (!userId) return [];

  const paths: string[] = [];
  for (const f of files) {
    const name = `${Date.now()}-${Math.random().toString(36).slice(2)}.${extOf(f.type)}`;
    const path = `${userId}/${threadId}/${name}`;
    const { error } = await supabase.storage.from(BUCKET).upload(path, f, {
      contentType: f.type,
      upsert: false,
    });
    if (error) {
      console.error('[chatImages] upload', error);
      return paths;
    }
    paths.push(path);
  }
  return paths;
}

// Keyed by path rather than returned as a list, so one signing call can cover
// every message in a thread and each still knows which URLs are its own. A path
// that failed to sign is simply absent: one missing screenshot should put
// nothing in the conversation rather than a torn-page icon.
export async function signChatImages(paths: string[]): Promise<Record<string, string>> {
  if (!paths.length) return {};
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrls(paths, SIGNED_TTL_S);
  if (error) { console.error('[chatImages] sign', error); return {}; }
  const byPath: Record<string, string> = {};
  (data ?? []).forEach((d, i) => {
    // The API echoes the path back, but falls back to input order rather than
    // trusting that on a partial response.
    const path = d.path ?? paths[i];
    if (d.signedUrl && path) byPath[path] = d.signedUrl;
  });
  return byPath;
}
