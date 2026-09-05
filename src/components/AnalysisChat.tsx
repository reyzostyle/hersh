import { useState, useRef, useEffect, useMemo } from 'react';
import { AddOutlineIcon as Plus, ArrowUpOutlineIcon as ArrowUp, RefreshOutlineIcon as Loader2, CloseCircleOutlineIcon as X, ClapperboardOpenOutlineIcon as Film, GalleryOutlineIcon as ImageIcon, FolderOutlineIcon as FolderIcon } from '@solar-icons/react';
import { supabase, getSessionToken, getUserId, fetchWithRetry } from '../lib/supabase';
import { ErrorNotice } from './ErrorNotice';
import { useUsage, CREDIT_COSTS } from '../lib/useUsage';
import { listProjects, createProject, fileThread, loadThread, loadThreadMessages, takeRequestedThread, type Project } from '../lib/projects';
import { SaveToProjectModal } from './SaveToProjectModal';

const FN = 'https://ezlousklksipvwuinpzq.supabase.co/functions/v1';

interface Analysis {
  overall_score?: number;
  overall_assessment?: string;
  strong_spots?: string[];
  weak_spots?: string[];
}

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  analysis?: Analysis | null;
  // Set on messages that arrived while watching, cleared on messages loaded
  // out of the database. Only the first kind animates in or reveals itself:
  // replaying twenty of them when a saved conversation opens is not a
  // conversation arriving, it is a page flickering.
  fresh?: boolean;
  // On a hook or script result: which of the two it decided this was, and the
  // text it decided it about. Enough to run the other one from a click.
  textKind?: 'hook' | 'script';
  source?: string;
  // Screenshots sent with this message, as data URLs, for the bubble to show.
  // Not persisted: the thread keeps "[screenshot]" and the answer, so a
  // reopened conversation has the reasoning without the pictures.
  images?: string[];
}

const extractVideoId = (input: string): string | null => {
  const s = input.trim();
  if (/^[\w-]{11}$/.test(s)) return s;
  return s.match(/(?:shorts\/|v=|youtu\.be\/|embed\/)([\w-]{11})/)?.[1] ?? null;
};

const uid = () => Math.random().toString(36).slice(2);

// An upload is watched by the same model as a link, so what it accepts is what
// Gemini accepts, and the ceiling is the one the edge proxy was built against.
// Checked on the way in rather than after the file has been sent: a 2GB pick
// that fails on arrival costs the wait twice.
const ACCEPTED_TYPES = ['video/mp4', 'video/quicktime', 'video/webm', 'video/x-msvideo'];
const MAX_SIZE_MB = 300;

// A screenshot is the other thing people arrive with. Someone asking why a
// video got 0 views has the answer on their Studio screen, not in a link, and
// no API hands that number over: YouTube shows the Shorts swipe-away rate in
// Studio and exposes nothing like it. So the picture IS the data.
const IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/webp'];
const MAX_IMAGE_MB = 5;
// Matches the ceiling in _shared/images.ts. A question about a channel is
// rarely one screen - the retention curve and the traffic sources are two -
// but past a handful it stops being evidence and starts being a folder.
const MAX_IMAGES = 4;

const isImage = (f: File) => IMAGE_TYPES.includes(f.type);

const validateFile = (f: File): string => {
  if (isImage(f)) {
    return f.size > MAX_IMAGE_MB * 1024 * 1024
      ? `Screenshot too large. Maximum size is ${MAX_IMAGE_MB}MB.`
      : '';
  }
  if (ACCEPTED_TYPES.includes(f.type) || f.name.match(/\.(mp4|mov|webm|avi)$/i)) {
    return f.size > MAX_SIZE_MB * 1024 * 1024
      ? `File too large. Maximum size is ${MAX_SIZE_MB}MB.`
      : '';
  }
  return 'Send a video (MP4, MOV, WebM, AVI) or a screenshot (PNG, JPG, WebP).';
};

// Read once, use twice: the base64 half goes to the model, the whole data URL
// is what the message bubble shows. An object URL would need revoking and
// would give the bubble nothing the data URL does not already have.
const readDataUrl = (f: File) => new Promise<string>((resolve, reject) => {
  const r = new FileReader();
  r.onload = () => resolve(String(r.result));
  r.onerror = () => reject(new Error('Could not read that file'));
  r.readAsDataURL(f);
});

const toImageParts = async (shots: File[]) =>
  Promise.all(shots.map(async f => {
    const dataUrl = await readDataUrl(f);
    return { mimeType: f.type, base64: dataUrl.slice(dataUrl.indexOf(',') + 1) };
  }));

const formatSize = (bytes: number) => {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / 1024).toFixed(0)} KB`;
};

// The scored reply. It is a message in the thread rather than a panel over it,
// so the conversation that follows has something to point at.
// `fresh` means this review just landed rather than being loaded out of a saved
// thread. The card then writes itself in the order a person would read it:
// the score, the verdict revealing a few words at a time, then the two lists
// dropping in under it.
//
// The plain-text answers already did this and the review did not, which is why
// "still no animations" was a fair report even after the last pass: a 30 second
// wait ending in a finished card fading up over 260ms is, from the chair, a
// card that appeared.
function AnalysisCard({ a, fresh, onAdvance }: { a: Analysis; fresh?: boolean; onAdvance?: () => void }) {
  const score = a.overall_score;
  // The lists wait for the verdict to finish writing. Landing under a sentence
  // that is still being written reads as two things racing.
  const listsAt = fresh && a.overall_assessment ? REVEAL_MS : 0;
  const step = (i: number) => (fresh ? { animationDelay: `${listsAt + i * 70}ms` } : undefined);
  const cls = fresh ? 'animate-msg-in' : '';

  return (
    <div className="rounded-2xl p-5 sm:p-6" style={{ background: 'var(--bg-raised)', border: '1px solid var(--line)' }}>
      {score != null && (
        <div className="flex items-baseline gap-2 mb-4">
          <span className="text-4xl font-semibold tracking-tight" style={{ color: 'var(--text)' }}>{score}</span>
          <span className="font-mono text-[11px]" style={{ color: 'var(--text-faint)' }}>/ 100</span>
        </div>
      )}

      {a.overall_assessment && (
        /* --text, not --text-muted. Same call as the chat answers: this is the
           verdict, not a caption on it. */
        <div className="text-[14px] leading-relaxed whitespace-pre-line mb-5" style={{ color: 'var(--text)' }}>
          {fresh
            ? <RevealText text={a.overall_assessment} onAdvance={onAdvance ?? (() => {})} />
            : a.overall_assessment}
        </div>
      )}

      {!!a.strong_spots?.length && (
        <div className="mb-4">
          <p className={`label-mono mb-2 ${cls}`} style={step(0)}>Working</p>
          <ul className="space-y-1.5">
            {a.strong_spots.map((s, i) => (
              <li key={i} className={`text-[13px] leading-relaxed ${cls}`} style={{ color: 'var(--text-muted)', ...step(i + 1) }}>{s}</li>
            ))}
          </ul>
        </div>
      )}

      {!!a.weak_spots?.length && (
        <div>
          <p className={`label-mono mb-2 ${cls}`} style={step((a.strong_spots?.length ?? 0) + 1)}>Fix</p>
          <ul className="space-y-1.5">
            {a.weak_spots.map((s, i) => (
              <li key={i} className={`text-[13px] leading-relaxed ${cls}`} style={{ color: 'var(--text)', ...step((a.strong_spots?.length ?? 0) + 2 + i) }}>{s}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

// What the run is actually doing, in the order it does it. analyze-with-gemini
// fetches the video, has the model watch it, then has it score what it saw; the
// text checks read, compare, then write. So the sequence is real - what is
// estimated is the timing, because a single opaque request cannot report its
// own progress. Stages therefore advance on elapsed time and the last one holds
// until the answer lands, rather than pretending to finish.
const STAGES: Record<string, string[]> = {
  video: ['Fetching the video', 'Watching it through', 'Marking the hook and the drop', 'Writing what to fix'],
  // An upload is the one run with a step that reports itself: the bytes are
  // either still going or they are not. So it does not guess at that half -
  // one line holds until the file is over - and only then falls back to the
  // timed stages, which are the link run's minus the fetch it does not do.
  uploading: ['Sending the file over'],
  screenshot: ['Reading the screenshot', 'Working out what happened'],
  upload: ['Waiting on the file to process', 'Watching it through', 'Marking the hook and the drop', 'Writing what to fix'],
  hook: ['Reading the hook', 'Weighing it against what works', 'Writing the fix'],
  script: ['Reading the script', 'Finding where attention drops', 'Writing the fix'],
  followup: ['Rereading the review', 'Answering'],
  // Shown while the message is still being worked out. It has to be honest
  // about not knowing yet: "Fetching the video" under a typed question was
  // the line telling everyone the product had misread them before the
  // scored-out-of-100 reply confirmed it. If this turns out to be a hook or
  // a script, the stage switches when the real run starts.
  question: ['Reading what you sent', 'Thinking'],
};

const STAGE_MS = 3800;

function Working({ kind }: { kind: keyof typeof STAGES }) {
  const stages = STAGES[kind] ?? STAGES.video;
  const [at, setAt] = useState(0);
  const [shown, setShown] = useState(true);

  // Fade the line out, swap the words while nothing is visible, fade back in.
  // Swapping the text in place made each stage change read as a glitch rather
  // than as progress, and the shimmer running over it did not soften that -
  // the words simply became different words between two frames.
  useEffect(() => {
    setAt(0);
    setShown(true);
    let swap: ReturnType<typeof setTimeout>;
    const t = setInterval(() => {
      setAt(i => {
        if (i >= stages.length - 1) return i;
        setShown(false);
        swap = setTimeout(() => setShown(true), 220);
        return i + 1;
      });
    }, STAGE_MS);
    return () => { clearInterval(t); clearTimeout(swap); };
  }, [kind]);

  return (
    <p className="animate-msg-in text-[14px] font-medium" aria-live="polite">
      <span
        className="text-working inline-block transition-opacity duration-200"
        style={{ opacity: shown ? 1 : 0 }}
      >
        {stages[at]}
      </span>
    </p>
  );
}

// How long the whole reveal takes, however long the answer is. A per-word rate
// reads fine on two sentences and becomes a wait on twenty.
const REVEAL_MS = 900;
// Scrolling on every frame of the reveal is what made the first version of this
// take twice its own duration, so the follow is throttled well below 60fps. The
// eye cannot tell; setInterval could.
const FOLLOW_MS = 120;

// Reveals an answer that has ALREADY fully arrived, a few words at a time.
//
// This is not streaming and does not pretend to be: the request is finished
// before the first word shows, so it saves nobody any waiting. What it fixes is
// that a finished block of text appearing between two frames is both a jolt and
// genuinely ambiguous - there is no moment in it that reads as "it stopped".
// The caret supplies that moment by going out.
//
// Real streaming would be the better answer and is a different job: callLLM is
// a single-shot helper over three providers, so it means an SSE path through
// each of them plus a reader on this end.
function RevealText({ text, onAdvance }: { text: string; onAdvance: () => void }) {
  // Split on whitespace but KEEP it, so the reveal never reflows the paragraph
  // - dropping the separators would re-wrap every line as words land.
  const parts = useMemo(() => text.split(/(\s+)/), [text]);
  const [shown, setShown] = useState(0);

  // Driven by elapsed time on rAF, not by a word count on a timer. A timer
  // assumes every tick costs nothing, and these ticks re-render the thread and
  // move the scroll, so the interval slipped to two or three times its nominal
  // rate and a 900ms reveal took a little over two seconds. Reading the clock
  // means the reveal lasts REVEAL_MS whatever the frames cost.
  useEffect(() => {
    const reduced = typeof window !== 'undefined'
      && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if (reduced) { setShown(parts.length); return; }

    setShown(0);
    let raf = 0;
    let lastFollow = 0;
    const started = performance.now();

    const frame = (now: number) => {
      const progress = Math.min(1, (now - started) / REVEAL_MS);
      setShown(Math.max(1, Math.ceil(progress * parts.length)));
      if (now - lastFollow > FOLLOW_MS) { lastFollow = now; onAdvance(); }
      if (progress < 1) raf = requestAnimationFrame(frame);
      else onAdvance();
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [parts]);

  const done = shown >= parts.length;
  return (
    <>
      {parts.slice(0, shown).join('')}
      {!done && <span className="reveal-caret" aria-hidden="true" />}
    </>
  );
}

export function AnalysisChat() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [threadId, setThreadId] = useState<string | null>(null);
  const [composer, setComposer] = useState('');
  const [busy, setBusy] = useState(false);
  // Which pipeline is running, so the working line can name its actual stages.
  const [busyKind, setBusyKind] = useState<keyof typeof STAGES>('video');
  const [error, setError] = useState('');
  // A list, not one. A video and the screenshot of its retention curve are one
  // message, and so are two screenshots of the same channel.
  const [files, setFiles] = useState<File[]>([]);
  // Reloaded after every send, so the count under the composer is the balance
  // as of the last thing that was actually charged.
  const { usage, reload: reloadUsage } = useUsage();
  // A conversation is worth keeping next to the video that prompted it, so a
  // thread can be filed into a project the same way a competitor idea is.
  // Projects load only when the picker is opened - most threads are never filed.
  const [projects, setProjects] = useState<Project[]>([]);
  const [filingOpen, setFilingOpen] = useState(false);
  const [threadProject, setThreadProject] = useState<Project | null>(null);

  const fileRef = useRef<HTMLInputElement>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const taRef = useRef<HTMLTextAreaElement>(null);

  // Instant, not smooth, when called from the reveal: a smooth scroll retriggered
  // every 28ms never settles, and the page ends up crawling behind the text.
  const scrollToEnd = () => endRef.current?.scrollIntoView({ behavior: 'auto', block: 'end' });

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages, busy]);

  // What this screen opens with, decided once on mount.
  //
  // Two things can be waiting, both one-shot handoffs cleared as they are read:
  // a conversation filed in a project that was just clicked, and a link pasted
  // on the landing page before signing up. An explicit click wins if somehow
  // both are set.
  //
  // The pending link was HookAnalysis's job, and when Analyze became a
  // conversation nothing took it over. So the one path the entire hero exists
  // to drive - paste a link, sign up, see the review - ended on an empty
  // composer with the link dropped on the floor. It survives onboarding too:
  // whether the profile questions are skipped or answered, this screen mounts
  // afterwards and the link is still there to be run.
  useEffect(() => {
    const requested = takeRequestedThread();
    const pending = localStorage.getItem('chumoku_pending_video_url');
    // Cleared before anything awaits, so a double mount cannot spend the
    // credits twice.
    if (pending) localStorage.removeItem('chumoku_pending_video_url');

    if (requested) {
      (async () => {
        setBusy(true);
        const [rows, thread] = await Promise.all([
          loadThreadMessages(requested),
          loadThread(requested),
        ]);
        setThreadId(requested);
        setMessages(rows.map(r => ({
          id: r.id,
          role: r.role,
          content: r.content,
          analysis: r.analysis ?? null,
        })));
        if (thread?.project_id) {
          const all = await listProjects();
          setThreadProject(all.find(p => p.id === thread.project_id) ?? null);
          setProjects(all);
        }
        setBusy(false);
      })();
      return;
    }

    if (!pending) return;
    const videoId = extractVideoId(pending);
    // A link that does not resolve goes into the composer rather than being
    // thrown away. They typed it; they should still see it.
    if (videoId) runAnalysis(videoId, [], '', pending);
    else setComposer(pending);
  }, []);

  // Grows with the text the way a chat input should, up to a ceiling.
  useEffect(() => {
    const ta = taRef.current;
    if (!ta) return;
    ta.style.height = 'auto';
    ta.style.height = Math.min(ta.scrollHeight, 200) + 'px';
  }, [composer]);

  const push = (m: Omit<Message, 'id'>) => setMessages(prev => [...prev, { ...m, id: uid(), fresh: true }]);

  const persist = async (tid: string, role: 'user' | 'assistant', content: string, analysis?: Analysis) => {
    const userId = await getUserId();
    if (!userId) return;
    await supabase.from('chat_messages').insert({
      thread_id: tid, user_id: userId, role, content, analysis: analysis ?? null,
    });
  };

  const startThread = async (title: string) => {
    const userId = await getUserId();
    if (!userId) return null;
    const { data } = await supabase
      .from('chat_threads').insert({ user_id: userId, title }).select('id').single();
    return data?.id ?? null;
  };

  const runAnalysis = async (videoId: string, shots: File[], context: string, shownText: string) => {
    setBusyKind('video');
    setBusy(true);
    setError('');
    push({ role: 'user', content: shownText });

    let title = '';
    try {
      const r = await fetch(`https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoId}&format=json`);
      if (r.ok) title = (await r.json()).title ?? '';
    } catch { /* title is a nicety, not a requirement */ }

    // Reuse the thread if the conversation already started - a question can
    // come before the first link now, and starting a second thread here would
    // orphan everything said up to this point.
    const tid = threadId ?? await startThread(title || shownText.slice(0, 60));
    setThreadId(tid);
    if (tid) await persist(tid, 'user', shownText);

    try {
      const token = await getSessionToken();
      if (!token) throw new Error('Not authenticated');
      const res = await fetchWithRetry(`${FN}/analyze-with-gemini`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ videoId, videoContext: context, images: await toImageParts(shots) }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Analysis failed');

      const a: Analysis = {
        overall_score: data.analysis?.hook_analysis?.overall_score,
        overall_assessment: data.analysis?.hook_analysis?.overall_assessment,
        strong_spots: data.analysis?.strong_spots ?? [],
        weak_spots: data.analysis?.weak_spots ?? [],
      };
      push({ role: 'assistant', content: '', analysis: a });
      if (tid) {
        await persist(tid, 'assistant', '', a);
        await supabase.from('chat_threads').update({ analysis_id: data.analysis?.id }).eq('id', tid);
      }
      reloadUsage();
      // App defers onboarding for anyone who arrived by pasting a link on the
      // landing page, and puts the offer up when their first result lands. That
      // event was dispatched by HookAnalysis and by nothing since.
      window.dispatchEvent(new CustomEvent('chumoku:analysis-done'));

      // A link almost never arrives alone. "is this good to replicate for my
      // niche?" went in as videoContext, which is the field for facts ABOUT the
      // video, so the question was read as a description of it and answered
      // with a polish score for someone else's upload - a real answer to a
      // question nobody asked. The review still runs, because watching is the
      // expensive part and it is what makes the answer worth anything, and the
      // question is then answered against it.
      // Whatever came with the link goes to the model too, always. It decides
      // whether that was a question worth answering, an instruction already
      // carried out, or a hook to score - which is the same judgement it makes
      // on every other message, and a better one than a question mark.
      if (tid && context.trim()) await routeMessage(context.trim(), { silent: true, tid });

    } catch (e) {
      setError(e instanceof Error ? e.message : 'Analysis failed');
    } finally {
      setBusy(false);
    }
  };

  // The creator's own footage, before it is anyone else's video. Same review as
  // a link and the same price; three requests instead of one, because the file
  // has to exist somewhere the model can watch it first: open a resumable
  // session, stream the bytes to it through the edge proxy, then analyze what
  // landed.
  //
  // All of that already worked - it is what the Analyze panel did before this
  // screen was a conversation, and nothing carried it over. The paperclip has
  // been attaching files to a submit() that only ever read the textarea, so the
  // plate showed the name, the send button stayed disabled, and the file went
  // nowhere. This is the wire that was missing, not new machinery.
  const runUpload = async (f: File, shots: File[], context: string, shownText: string) => {
    setBusyKind('uploading');
    setBusy(true);
    setError('');
    push({ role: 'user', content: shownText });

    const title = f.name.replace(/\.[^.]+$/, '');
    const tid = threadId ?? await startThread(title || f.name);
    setThreadId(tid);
    if (tid) await persist(tid, 'user', shownText);

    try {
      const token = await getSessionToken();
      if (!token) throw new Error('Not authenticated');
      const mimeType = f.type || 'video/mp4';

      const sessionRes = await fetchWithRetry(`${FN}/get-upload-url`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ fileName: f.name, fileSize: f.size, mimeType }),
      });
      const session = await sessionRes.json();
      if (!sessionRes.ok || !session.uploadUrl) throw new Error(session.error || 'Could not start the upload');

      // Plain fetch, not fetchWithRetry: the body is the file. Retrying a
      // failed send means pushing every byte again, twice over a bad
      // connection, which is slower than telling them it did not go.
      const uploadRes = await fetch(`${FN}/upload-video-chunk`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': mimeType,
          'X-Upload-Url': session.uploadUrl,
          'X-Upload-Offset': '0',
          'X-Is-Last': 'true',
        },
        body: f,
      });
      const uploaded = await uploadRes.json();
      if (!uploadRes.ok || !uploaded.geminiFileName) throw new Error(uploaded.error || 'Upload failed');

      // The bytes are over. What is left is the wait a link gets, so the stage
      // line switches to the stages that are now actually running.
      setBusyKind('upload');

      const res = await fetchWithRetry(`${FN}/analyze-upload`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          geminiFileName: uploaded.geminiFileName,
          videoContext: context,
          fileName: f.name,
          mimeType,
          images: await toImageParts(shots),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Analysis failed');

      const a: Analysis = {
        overall_score: data.analysis?.hook_analysis?.overall_score,
        overall_assessment: data.analysis?.hook_analysis?.overall_assessment,
        strong_spots: data.analysis?.strong_spots ?? [],
        weak_spots: data.analysis?.weak_spots ?? [],
      };
      push({ role: 'assistant', content: '', analysis: a });
      if (tid) {
        await persist(tid, 'assistant', '', a);
        await supabase.from('chat_threads').update({ analysis_id: data.analysis?.id }).eq('id', tid);
      }
      reloadUsage();
      window.dispatchEvent(new CustomEvent('chumoku:analysis-done'));

      // Whatever was typed alongside the file goes to the model after the
      // review, exactly as it does alongside a link: videoContext is the field
      // for facts about the footage, and a question dropped in there comes back
      // answered as a description of it.
      if (tid && context.trim()) await routeMessage(context.trim(), { silent: true, tid });

    } catch (e) {
      setError(e instanceof Error ? e.message : 'Analysis failed');
    } finally {
      setBusy(false);
    }
  };

  // Hook Lab and Script Lab used to be their own tabs. Same functions, same
  // credits, now answered in the thread so the follow-ups work on them too.
  // `pushed` is set when the router already put the message on screen: it
  // decided this was a hook rather than a question, and the bubble went up
  // before that was known.
  // `pushed`  - the message is already on screen (the router put it there).
  // `stored`  - it is already in the database too, so do not write it twice.
  // They are separate because the router leaves the bubble on screen without
  // persisting it, while a re-read has both already done.
  const runTextAnalysis = async (
    kind: 'hook' | 'script',
    text: string,
    { pushed = false, stored = false }: { pushed?: boolean; stored?: boolean } = {},
  ) => {
    setBusyKind(kind);
    setBusy(true);
    setError('');
    if (!pushed) push({ role: 'user', content: text });

    const tid = threadId ?? await startThread(text.slice(0, 60));
    setThreadId(tid);
    if (tid && !stored) await persist(tid, 'user', text);

    try {
      const token = await getSessionToken();
      if (!token) throw new Error('Not authenticated');
      const res = await fetchWithRetry(`${FN}/analyze-${kind}-text`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(kind === 'hook' ? { hook: text, context: '' } : { script: text, context: '' }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Analysis failed');

      const a: Analysis = {
        overall_score: data.overall_score,
        overall_assessment: data.overall_assessment,
        strong_spots: data.strong_spots ?? [],
        weak_spots: data.weak_spots ?? [],
      };
      push({ role: 'assistant', content: `Read that as a ${kind}`, analysis: a, textKind: kind, source: text });
      if (tid) await persist(tid, 'assistant', `Read that as a ${kind}`, a);
      reloadUsage();
      // App defers onboarding for anyone who arrived by pasting a link on the
      // landing page, and puts the offer up when their first result lands. That
      // event was dispatched by HookAnalysis and by nothing since.
      window.dispatchEvent(new CustomEvent('chumoku:analysis-done'));

    } catch (e) {
      setError(e instanceof Error ? e.message : 'Analysis failed');
    } finally {
      setBusy(false);
    }
  };

  // Works out what an unprompted message actually is, and answers it if it is
  // a question.
  //
  // There was no router before this: anything without a link went straight to
  // a hook or script check on the strength of "is it longer than 200
  // characters". Typing "why did my last short flop?" came back as a score out
  // of 100 against the question itself. The judgement now happens server-side,
  // in the same call that writes the answer, so a question costs one round
  // trip and a hook costs one cheap call before the real run.
  //
  // `silent` is for the text that came attached to a link: it is already on
  // screen inside the message that carried the link, and pushing it again would
  // show the creator saying it twice. `tid` is passed by that caller because
  // the thread was created moments earlier and setThreadId has not landed in
  // this closure yet.
  const routeMessage = async (
    text: string,
    { silent = false, tid, images, previews }: {
      silent?: boolean; tid?: string | null;
      images?: { mimeType: string; base64: string }[]; previews?: string[];
    } = {},
  ) => {
    const thread = tid ?? threadId;
    // Vague until the server says otherwise - see STAGES.question. With a
    // review already on screen the call still classifies, but it is reading
    // that review to do it, so the line can say so.
    setBusyKind(images?.length ? 'screenshot' : hasResult ? 'followup' : 'question');
    setBusy(true);
    setError('');
    if (!silent) push({ role: 'user', content: text, images: previews });

    try {
      const token = await getSessionToken();
      if (!token) throw new Error('Not authenticated');
      const res = await fetchWithRetry(`${FN}/chat-followup`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ threadId: thread, question: text, images }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Could not read that');

      if (data.intent === 'hook' || data.intent === 'script') {
        // Hands off with the bubble already on screen. runTextAnalysis takes
        // over the busy state and the stage line from here.
        await runTextAnalysis(data.intent, text, { pushed: !silent });
        return;
      }

      push({ role: 'assistant', content: data.answer });

      // The server only persists into a thread that already exists, because
      // until now there was nothing worth keeping. A question can open a
      // conversation, so this is where that thread gets made.
      if (!thread) {
        const opened = await startThread(text.slice(0, 60) || 'Screenshot');
        setThreadId(opened);
        if (opened) {
          const tag = (images?.length ?? 0) > 1 ? `[${images!.length} screenshots]` : '[screenshot]';
          await persist(opened, 'user', images?.length ? `${tag} ${text}`.trim() : text);
          await persist(opened, 'assistant', data.answer);
        }
      }
      reloadUsage();
    } catch (e) {
      // No falling back to the old length heuristic. Guessing "hook" on a
      // failed route is the exact behaviour being fixed, and it would spend
      // their credits to do the wrong thing. fetchWithRetry has already
      // ridden out anything transient by the time this runs.
      setError(e instanceof Error ? e.message : 'Could not read that');
    } finally {
      setBusy(false);
    }
  };

  // A screenshot goes to the chat, not to the video pipeline. It is an ordinary
  // message with a picture attached, so it routes and is charged like one.
  const askWithImages = async (shots: File[], text: string) => {
    let previews: string[];
    try {
      previews = await Promise.all(shots.map(readDataUrl));
    } catch {
      setError(shots.length > 1 ? 'Could not read those screenshots.' : 'Could not read that screenshot.');
      return;
    }
    const images = shots.map((f, i) => ({
      mimeType: f.type,
      base64: previews[i].slice(previews[i].indexOf(',') + 1),
    }));
    await routeMessage(text, { images, previews });
  };

  // Reading the same text the other way.
  //
  // Hook versus script is the one call the router can reasonably get wrong -
  // a paragraph that opens AND pays off sits exactly on the line - and until
  // now there was no way to say so: once a result exists, everything typed
  // after it is a follow-up question about that result, so "no, that was a
  // script" got a polite reply rather than a re-read.
  //
  // It replaces the result rather than adding a second one. Two scored cards
  // for one piece of text is a worse answer than one right card, and nobody
  // clicking this wants a record of the wrong reading kept.
  const reread = async (messageId: string, source: string, from: 'hook' | 'script') => {
    if (busy) return;
    const to = from === 'hook' ? 'script' : 'hook';

    setMessages(prev => prev.filter(m => m.id !== messageId));

    // The stored copy goes too. The client makes its own ids and never sees the
    // row's, so the row is found the only way it can be: the newest assistant
    // message in this thread, which is the one just taken off the screen.
    if (threadId) {
      const { data } = await supabase
        .from('chat_messages')
        .select('id')
        .eq('thread_id', threadId)
        .eq('role', 'assistant')
        .order('created_at', { ascending: false })
        .limit(1);
      if (data?.[0]) await supabase.from('chat_messages').delete().eq('id', data[0].id);
    }

    await runTextAnalysis(to, source, { pushed: true, stored: true });
  };

  // Whether the thread already has something to ask about. It decides both
  // what a send does and what it costs, so it is one value, read in both
  // places, rather than the same test written twice.
  const hasResult = messages.some(m => m.analysis);

  const submit = () => {
    const text = composer.trim();
    if (busy) return;

    // The attachments split into at most one video and the screenshots around
    // it. A video is the thing being reviewed; screenshots are evidence about
    // whatever is being reviewed, and on their own they are the whole message.
    const video = files.find(f => !isImage(f));
    const shots = files.filter(isImage);

    const url = text.match(/https?:\/\/\S+/)?.[0] ?? text;
    const videoId = text ? extractVideoId(url) : null;

    // Nothing typed and nothing attached.
    if (!video && !shots.length && !text) return;

    setFiles([]);
    setComposer('');

    // Two rules, no exceptions to either. A link means watch that video. Every
    // other message is put to the model to be identified.
    //
    // What used to be here instead: a link was skipped if the thread already
    // had a review, then skipped again if that video had been seen before, and
    // the text beside it was only treated as a question when it contained a
    // question mark. Three guesses, each cheap, each wrong often enough that
    // the product stopped feeling dependable - which costs more than the credit
    // any of them saved.
    // An uploaded file beats a link in the same message: they attached the cut
    // they want looked at, and the link is something they were talking about.
    if (video) {
      const shown = [video.name, ...shots.map(s => s.name)].join('\n');
      runUpload(video, shots, text, text ? `${shown}\n\n${text}` : shown);
      return;
    }
    if (videoId) {
      runAnalysis(videoId, shots, text.replace(url, '').trim(), text);
      return;
    }
    // Screenshots with no video anywhere: the pictures are the question.
    if (shots.length) {
      askWithImages(shots, text);
      return;
    }
    routeMessage(text);
  };

  const openFiling = async () => {
    setProjects(await listProjects());
    setFilingOpen(true);
  };

  const fileInto = async (projectId: string | null) => {
    if (!threadId) return;
    await fileThread(threadId, projectId);
    // Re-read rather than looking the project up in local state: filing into a
    // project that was created inside the picker would otherwise miss, because
    // this closure still holds the list from before it existed.
    if (projectId) {
      const all = await listProjects();
      setProjects(all);
      setThreadProject(all.find(p => p.id === projectId) ?? null);
    } else {
      setThreadProject(null);
    }
    setFilingOpen(false);
  };

  const empty = messages.length === 0;

  // What the next send will cost. Analyze took over Hook Lab and Script Lab and
  // then grew an open-ended conversation on top, so "one analysis, one charge"
  // stopped being true: a thread can run all afternoon. Every message is
  // billed, and the price of the next one is on screen before it is sent
  // rather than discovered afterwards on the Usage tab.
  const left = usage ? Math.max(0, usage.creditsLimit - usage.creditsUsed) : null;

  const priceLine = hasResult
    ? `${CREDIT_COSTS.chat_followup} credit a message`
    : `${CREDIT_COSTS.video_analysis} credits a video, ${CREDIT_COSTS.script_check} a script, ${CREDIT_COSTS.hook_check} a hook, ${CREDIT_COSTS.chat_followup} a question`;

  const Price = () => (
    <p className="label-mono mt-2.5 text-center">
      {priceLine}
      {left != null && ` · ${left} left`}
    </p>
  );

  // No sheet here. Analyze is the one tab AppShell rules with the grid, and a
  // solid panel laid over it just hid the thing that makes this screen look
  // like anything. The conversation sits on the grid directly.
  return (
    <div className="h-full flex flex-col">
      {empty ? (
        <div className="flex-1 flex flex-col items-center justify-center px-5">
          <p className="label-mono mb-4">Analyze</p>
          <h1 className="display mb-8 text-center" style={{ color: 'var(--text)' }}>What are we looking at?</h1>
          <div className="w-full max-w-2xl">
            <Composer
              value={composer} onChange={setComposer} onSubmit={submit} busy={busy}
              files={files} setFiles={setFiles} onFileError={setError} fileRef={fileRef} taRef={taRef}
              placeholder="Paste a link, a hook or a script, or just ask"
            />
            <Price />
            {/* The hero had nowhere to say no. Nothing could fail here before -
                a send left this screen immediately - but a file can be turned
                down before it is ever sent. */}
            {error && <div className="mt-4"><ErrorNotice message={error} /></div>}
          </div>
        </div>
      ) : (
        <>
          <div className="flex-1 overflow-y-auto">
            <div className="max-w-2xl mx-auto px-5 py-8 space-y-6">
              {messages.map(m => (
                m.role === 'user' ? (
                  <div key={m.id} className={`flex justify-end ${m.fresh ? 'animate-msg-in' : ''}`}>
                    <div className="max-w-[85%] rounded-2xl px-4 py-2.5 text-[14px] leading-relaxed whitespace-pre-line break-words"
                         style={{ background: 'var(--bg-raised)', color: 'var(--text)' }}>
                      {!!m.images?.length && (
                        <div className={`flex flex-wrap gap-1.5 ${m.content ? 'mb-2' : ''}`}>
                          {m.images.map((src, i) => (
                            <img key={i} src={src} alt=""
                                 className="rounded-xl max-w-full w-auto"
                                 style={{ maxHeight: m.images!.length > 1 ? '9rem' : '18rem' }} />
                          ))}
                        </div>
                      )}
                      {m.content}
                    </div>
                  </div>
                ) : m.analysis ? (
                  <div key={m.id} className={`space-y-2 ${m.fresh ? 'animate-msg-in' : ''}`}>
                    {/* The line that states the assumption is also where it is
                        corrected. Anywhere else and the control is a feature to
                        be found; here it is the sentence answering itself.
                        Only on the newest result: offering it on an older card
                        would rewrite the middle of the conversation. */}
                    {(m.content || m.textKind) && (
                      <div className="flex items-center gap-3 flex-wrap">
                        {m.content && <p className="label-mono">{m.content}</p>}
                        {m.textKind && m.source && m.id === messages[messages.length - 1]?.id && (
                          <button
                            className="chip"
                            disabled={busy}
                            onClick={() => reread(m.id, m.source!, m.textKind!)}
                          >
                            Read as a {m.textKind === 'hook' ? 'script' : 'hook'}
                            <span className="font-mono" style={{ color: 'var(--text-faint)' }}>
                              {m.textKind === 'hook' ? CREDIT_COSTS.script_check : CREDIT_COSTS.hook_check}
                            </span>
                          </button>
                        )}
                      </div>
                    )}
                    <AnalysisCard a={m.analysis} fresh={m.fresh} onAdvance={scrollToEnd} />
                  </div>
                ) : (
                  /* On a plate, like the creator's own messages and like the
                     review card. Bare text floating between two bubbles read as
                     a system notice rather than as the other side of a
                     conversation. Alignment carries who is speaking; the plate
                     is the same either way.

                     --text, not --text-muted: this is the answer, the thing on
                     the screen worth reading, and muted is the weight for the
                     labels and captions around it. */
                  <div key={m.id} className={`flex justify-start ${m.fresh ? 'animate-msg-in' : ''}`}>
                    <div
                      className="max-w-[85%] rounded-2xl px-4 py-2.5 text-[14px] leading-relaxed whitespace-pre-line break-words"
                      style={{ background: 'var(--bg-raised)', color: 'var(--text)' }}
                    >
                      {m.fresh
                        ? <RevealText text={m.content} onAdvance={scrollToEnd} />
                        : m.content}
                    </div>
                  </div>
                )
              ))}

              {busy && <Working kind={busyKind} />}

              {error && <ErrorNotice message={error} />}
              <div ref={endRef} />
            </div>
          </div>

          <div className="flex-shrink-0 px-5 pb-5">
            <div className="max-w-2xl mx-auto">
              {threadId && (
                <button
                  onClick={openFiling}
                  className="flex items-center gap-1.5 mb-2 text-[12px] transition-colors hover:text-[var(--text)]"
                  style={{ color: threadProject ? 'var(--text)' : 'var(--text-faint)' }}
                >
                  <FolderIcon className="w-3.5 h-3.5" />
                  {threadProject ? threadProject.name : 'Save to project'}
                </button>
              )}
              <Composer
                value={composer} onChange={setComposer} onSubmit={submit} busy={busy}
                files={files} setFiles={setFiles} onFileError={setError} fileRef={fileRef} taRef={taRef}
                placeholder={hasResult ? 'Ask about the fixes, or send another link' : 'Ask anything, or send a link'}
              />
              <Price />
            </div>
          </div>
        </>
      )}

      {filingOpen && (
        <SaveToProjectModal
          projects={projects}
          currentProjectId={threadProject?.id ?? null}
          isSaved={!!threadProject}
          onPick={fileInto}
          onUnsave={() => fileInto(null)}
          onCreateProject={async name => {
            const project = await createProject(name);
            if (project) setProjects(prev => [project, ...prev]);
            return project;
          }}
          onClose={() => setFilingOpen(false)}
        />
      )}
    </div>
  );
}

function Composer({
  value, onChange, onSubmit, busy, files, setFiles, onFileError, fileRef, taRef, placeholder,
}: {
  value: string; onChange: (v: string) => void; onSubmit: () => void; busy: boolean;
  files: File[]; setFiles: React.Dispatch<React.SetStateAction<File[]>>;
  onFileError: (msg: string) => void;
  fileRef: React.RefObject<HTMLInputElement>; taRef: React.RefObject<HTMLTextAreaElement>;
  placeholder: string;
}) {
  // Three ways in, one gate. The file picker was the only one, which is the
  // wrong single way for this product: a screenshot lives in the clipboard
  // straight after Cmd+Shift+4, and going through Finder to fetch it back off
  // the desktop is the long way round the thing they are trying to ask.
  const [dragging, setDragging] = useState(false);

  const accept = (incoming: File | null | undefined | FileList): boolean => {
    if (!incoming) return false;
    const list = incoming instanceof File ? [incoming] : Array.from(incoming);
    if (!list.length) return false;

    for (const f of list) {
      const bad = validateFile(f);
      if (bad) { onFileError(bad); return false; }
    }

    // One video at a time. Two cuts in one message is two reviews, two prices
    // and one answer that has to talk about both, which is worse than sending
    // them one after the other.
    const videos = [...files, ...list].filter(f => !isImage(f));
    if (videos.length > 1) {
      onFileError('One video at a time. Screenshots can come with it.');
      return false;
    }
    const shots = [...files, ...list].filter(isImage);
    if (shots.length > MAX_IMAGES) {
      onFileError(`That is too many images. Send up to ${MAX_IMAGES} at a time.`);
      return false;
    }

    onFileError('');
    setFiles(prev => [...prev, ...list]);
    return true;
  };

  return (
    <div
      className="overflow-hidden transition-colors"
      style={{
        background: 'var(--bg-raised)',
        border: `1px solid ${dragging ? 'var(--accent)' : 'var(--line)'}`,
        borderRadius: 'var(--r-lg)',
      }}
      onDragOver={e => { e.preventDefault(); setDragging(true); }}
      onDragLeave={e => {
        // Children fire dragleave as the cursor crosses them. Only the pointer
        // actually leaving the composer counts.
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDragging(false);
      }}
      onDrop={e => { e.preventDefault(); setDragging(false); accept(e.dataTransfer.files); }}
    >
      <input ref={fileRef} type="file" className="hidden"
             accept="video/mp4,video/quicktime,video/webm,video/x-msvideo,.mp4,.mov,.webm,.avi,image/png,image/jpeg,image/webp"
             multiple
             onChange={e => {
               const picked = e.target.files;
               const list = picked ? Array.from(picked) : [];
               e.currentTarget.value = '';
               if (list.length) accept(picked);
             }} />

      {files.length > 0 && (
        <div className="mx-2 mt-2 space-y-1.5">
          {files.map((f, i) => (
            <div key={`${f.name}-${f.size}-${i}`}
                 className="rounded-2xl px-3 py-2.5 flex items-center gap-3"
                 style={{ background: 'rgba(255,255,255,0.05)' }}>
              {isImage(f)
                ? <ImageIcon className="w-4 h-4 flex-shrink-0" style={{ color: 'var(--text-faint)' }} />
                : <Film className="w-4 h-4 flex-shrink-0" style={{ color: 'var(--text-faint)' }} />}
              <p className="flex-1 min-w-0 text-[13px] truncate" style={{ color: 'var(--text)' }}>{f.name}</p>
              <span className="font-mono text-[11px] flex-shrink-0" style={{ color: 'var(--text-faint)' }}>{formatSize(f.size)}</span>
              <button onClick={() => setFiles(prev => prev.filter((_, j) => j !== i))}
                      className="p-1 transition-colors" style={{ color: 'var(--text-faint)' }} aria-label={`Remove ${f.name}`}>
                <X className="w-4 h-4" />
              </button>
            </div>
          ))}
        </div>
      )}

      <textarea
        ref={taRef}
        value={value}
        onChange={e => onChange(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); onSubmit(); } }}
        onPaste={e => {
          // Only intercept a pasted image. Text, and a screenshot pasted as a
          // file path, go through untouched.
          const item = Array.from(e.clipboardData.items)
            .find(i => i.kind === 'file' && i.type.startsWith('image/'));
          if (!item) return;
          if (accept(item.getAsFile())) e.preventDefault();
        }}
        rows={1}
        placeholder={files.length
          ? (files.every(isImage) ? 'Ask about it, or just send' : 'Add context, or just send')
          : placeholder}
        autoComplete="off"
        spellCheck={false}
        className="w-full bg-transparent resize-none px-5 pt-4 pb-1 text-[15px] leading-relaxed focus:outline-none"
        style={{ color: 'var(--text)' }}
      />

      <div className="flex items-center justify-between gap-3 px-3 pb-3 pt-1">
        <button type="button" onClick={() => fileRef.current?.click()} title="Attach a video or a screenshot"
                className="w-8 h-8 rounded-full flex items-center justify-center" style={{ color: 'var(--text-muted)' }}>
          <Plus className="w-[18px] h-[18px]" />
        </button>
        <button onClick={onSubmit} disabled={busy || (!value.trim() && !files.length)} title="Send"
                className="w-8 h-8 rounded-full flex items-center justify-center transition-opacity disabled:opacity-25"
                style={{ background: 'var(--accent)', color: 'var(--on-accent)' }}>
          {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <ArrowUp className="w-[18px] h-[18px]" />}
        </button>
      </div>
    </div>
  );
}
