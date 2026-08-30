import { useState, useRef, useEffect } from 'react';
import { AddOutlineIcon as Plus, ArrowUpOutlineIcon as ArrowUp, RefreshOutlineIcon as Loader2, CloseCircleOutlineIcon as X, ClapperboardOpenOutlineIcon as Film } from '@solar-icons/react';
import { supabase, getSessionToken, fetchWithRetry } from '../lib/supabase';
import { ErrorNotice } from './ErrorNotice';

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
}

const extractVideoId = (input: string): string | null => {
  const s = input.trim();
  if (/^[\w-]{11}$/.test(s)) return s;
  return s.match(/(?:shorts\/|v=|youtu\.be\/|embed\/)([\w-]{11})/)?.[1] ?? null;
};

const uid = () => Math.random().toString(36).slice(2);

// The scored reply. It is a message in the thread rather than a panel over it,
// so the conversation that follows has something to point at.
function AnalysisCard({ a }: { a: Analysis }) {
  const score = a.overall_score;
  return (
    <div className="rounded-2xl p-5 sm:p-6" style={{ background: 'var(--bg-raised)', border: '1px solid var(--line)' }}>
      {score != null && (
        <div className="flex items-baseline gap-2 mb-4">
          <span className="text-4xl font-semibold tracking-tight" style={{ color: 'var(--text)' }}>{score}</span>
          <span className="font-mono text-[11px]" style={{ color: 'var(--text-faint)' }}>/ 100</span>
        </div>
      )}

      {a.overall_assessment && (
        <div className="text-[14px] leading-relaxed whitespace-pre-line mb-5" style={{ color: 'var(--text-muted)' }}>
          {a.overall_assessment}
        </div>
      )}

      {!!a.strong_spots?.length && (
        <div className="mb-4">
          <p className="label-mono mb-2">Working</p>
          <ul className="space-y-1.5">
            {a.strong_spots.map((s, i) => (
              <li key={i} className="text-[13px] leading-relaxed" style={{ color: 'var(--text-muted)' }}>{s}</li>
            ))}
          </ul>
        </div>
      )}

      {!!a.weak_spots?.length && (
        <div>
          <p className="label-mono mb-2">Fix</p>
          <ul className="space-y-1.5">
            {a.weak_spots.map((s, i) => (
              <li key={i} className="text-[13px] leading-relaxed" style={{ color: 'var(--text)' }}>{s}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

export function AnalysisChat() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [threadId, setThreadId] = useState<string | null>(null);
  const [composer, setComposer] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [file, setFile] = useState<File | null>(null);

  const fileRef = useRef<HTMLInputElement>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const taRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages, busy]);

  // Grows with the text the way a chat input should, up to a ceiling.
  useEffect(() => {
    const ta = taRef.current;
    if (!ta) return;
    ta.style.height = 'auto';
    ta.style.height = Math.min(ta.scrollHeight, 200) + 'px';
  }, [composer]);

  const push = (m: Omit<Message, 'id'>) => setMessages(prev => [...prev, { ...m, id: uid() }]);

  const persist = async (tid: string, role: 'user' | 'assistant', content: string, analysis?: Analysis) => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    await supabase.from('chat_messages').insert({
      thread_id: tid, user_id: user.id, role, content, analysis: analysis ?? null,
    });
  };

  const startThread = async (title: string) => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return null;
    const { data } = await supabase
      .from('chat_threads').insert({ user_id: user.id, title }).select('id').single();
    return data?.id ?? null;
  };

  const runAnalysis = async (videoId: string, context: string, shownText: string) => {
    setBusy(true);
    setError('');
    push({ role: 'user', content: shownText });

    let title = '';
    try {
      const r = await fetch(`https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoId}&format=json`);
      if (r.ok) title = (await r.json()).title ?? '';
    } catch { /* title is a nicety, not a requirement */ }

    const tid = await startThread(title || shownText.slice(0, 60));
    setThreadId(tid);
    if (tid) await persist(tid, 'user', shownText);

    try {
      const token = await getSessionToken();
      if (!token) throw new Error('Not authenticated');
      const res = await fetchWithRetry(`${FN}/analyze-with-gemini`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ videoId, videoContext: context }),
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
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Analysis failed');
    } finally {
      setBusy(false);
    }
  };

  // Hook Lab and Script Lab used to be their own tabs. Same functions, same
  // credits, now answered in the thread so the follow-ups work on them too.
  const runTextAnalysis = async (kind: 'hook' | 'script', text: string) => {
    setBusy(true);
    setError('');
    push({ role: 'user', content: text });

    const tid = await startThread(text.slice(0, 60));
    setThreadId(tid);
    if (tid) await persist(tid, 'user', text);

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
      push({ role: 'assistant', content: `Read that as a ${kind}.`, analysis: a });
      if (tid) await persist(tid, 'assistant', `Read that as a ${kind}.`, a);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Analysis failed');
    } finally {
      setBusy(false);
    }
  };

  const askFollowUp = async (question: string) => {
    if (!threadId) return;
    setBusy(true);
    setError('');
    push({ role: 'user', content: question });
    try {
      const token = await getSessionToken();
      if (!token) throw new Error('Not authenticated');
      const res = await fetchWithRetry(`${FN}/chat-followup`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ threadId, question }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Could not answer that');
      push({ role: 'assistant', content: data.answer });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not answer that');
    } finally {
      setBusy(false);
    }
  };

  const submit = () => {
    const text = composer.trim();
    if (!text || busy) return;
    setComposer('');

    // Once a thread has a result, anything typed is a question about it. Before
    // that, the message has to carry a link, because there is nothing to ask
    // about yet.
    const hasResult = messages.some(m => m.analysis);
    if (hasResult) { askFollowUp(text); return; }

    const url = text.match(/https?:\/\/\S+/)?.[0] ?? text;
    const videoId = extractVideoId(url);
    if (videoId) { runAnalysis(videoId, text.replace(url, '').trim(), text); return; }

    // No link means they pasted the writing itself. A script is long or has
    // line breaks; a hook is the one line that opens a video. The reply says
    // which it assumed, so a wrong guess costs one sentence to correct.
    const isScript = text.includes('\n') || text.length > 200;
    runTextAnalysis(isScript ? 'script' : 'hook', text);
  };

  const empty = messages.length === 0;

  return (
    <div className="h-full flex flex-col">
      {empty ? (
        <div className="flex-1 flex flex-col items-center justify-center px-5">
          <h1 className="display mb-8 text-center" style={{ color: 'var(--text)' }}>What are we looking at?</h1>
          <div className="w-full max-w-2xl">
            <Composer
              value={composer} onChange={setComposer} onSubmit={submit} busy={busy}
              file={file} setFile={setFile} fileRef={fileRef} taRef={taRef}
              placeholder="Paste a link, a hook or a script"
            />
          </div>
        </div>
      ) : (
        <>
          <div className="flex-1 overflow-y-auto">
            <div className="max-w-2xl mx-auto px-5 py-8 space-y-6">
              {messages.map(m => (
                m.role === 'user' ? (
                  <div key={m.id} className="flex justify-end">
                    <div className="max-w-[85%] rounded-2xl px-4 py-2.5 text-[14px] leading-relaxed break-words"
                         style={{ background: 'var(--bg-raised)', color: 'var(--text)' }}>
                      {m.content}
                    </div>
                  </div>
                ) : m.analysis ? (
                  <div key={m.id} className="space-y-2">
                    {m.content && (
                      <p className="label-mono">{m.content}</p>
                    )}
                    <AnalysisCard a={m.analysis} />
                  </div>
                ) : (
                  <div key={m.id} className="text-[14px] leading-relaxed whitespace-pre-line" style={{ color: 'var(--text-muted)' }}>
                    {m.content}
                  </div>
                )
              ))}

              {busy && (
                <div className="flex items-center gap-2 text-[13px]" style={{ color: 'var(--text-faint)' }}>
                  <Loader2 className="w-4 h-4 animate-spin" /> Watching
                </div>
              )}

              {error && <ErrorNotice message={error} />}
              <div ref={endRef} />
            </div>
          </div>

          <div className="flex-shrink-0 px-5 pb-5">
            <div className="max-w-2xl mx-auto">
              <Composer
                value={composer} onChange={setComposer} onSubmit={submit} busy={busy}
                file={file} setFile={setFile} fileRef={fileRef} taRef={taRef}
                placeholder="Ask about the fixes, or send another link"
              />
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function Composer({
  value, onChange, onSubmit, busy, file, setFile, fileRef, taRef, placeholder,
}: {
  value: string; onChange: (v: string) => void; onSubmit: () => void; busy: boolean;
  file: File | null; setFile: (f: File | null) => void;
  fileRef: React.RefObject<HTMLInputElement>; taRef: React.RefObject<HTMLTextAreaElement>;
  placeholder: string;
}) {
  return (
    <div className="rounded-[26px] overflow-hidden" style={{ background: 'var(--bg-raised)', border: '1px solid var(--line)' }}>
      <input ref={fileRef} type="file" accept="video/*" className="hidden"
             onChange={e => { const f = e.target.files?.[0]; if (f) setFile(f); e.currentTarget.value = ''; }} />

      {file && (
        <div className="mx-2 mt-2 rounded-2xl px-3 py-2.5 flex items-center gap-3" style={{ background: 'rgba(255,255,255,0.05)' }}>
          <Film className="w-4 h-4 flex-shrink-0" style={{ color: 'var(--text-faint)' }} />
          <p className="flex-1 min-w-0 text-[13px] truncate" style={{ color: 'var(--text)' }}>{file.name}</p>
          <button onClick={() => setFile(null)} className="p-1 transition-colors" style={{ color: 'var(--text-faint)' }}>
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      <textarea
        ref={taRef}
        value={value}
        onChange={e => onChange(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); onSubmit(); } }}
        rows={1}
        placeholder={placeholder}
        autoComplete="off"
        spellCheck={false}
        className="w-full bg-transparent resize-none px-5 pt-4 pb-1 text-[15px] leading-relaxed focus:outline-none"
        style={{ color: 'var(--text)' }}
      />

      <div className="flex items-center justify-between gap-3 px-3 pb-3 pt-1">
        <button type="button" onClick={() => fileRef.current?.click()} title="Attach a video file"
                className="w-8 h-8 rounded-full flex items-center justify-center" style={{ color: 'var(--text-muted)' }}>
          <Plus className="w-[18px] h-[18px]" />
        </button>
        <button onClick={onSubmit} disabled={busy || !value.trim()} title="Send"
                className="w-8 h-8 rounded-full flex items-center justify-center transition-opacity disabled:opacity-25"
                style={{ background: 'var(--accent)', color: 'var(--on-accent)' }}>
          {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <ArrowUp className="w-[18px] h-[18px]" />}
        </button>
      </div>
    </div>
  );
}
