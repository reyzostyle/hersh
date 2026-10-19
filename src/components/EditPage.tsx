import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  PlayBoldIcon as Play, PauseBoldIcon as Pause, UploadMinimalisticOutlineIcon as Upload,
  TrashBinMinimalisticOutlineIcon as Trash, DownloadMinimalisticOutlineIcon as Download,
} from '@solar-icons/react';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import { Page, PageHead, Section, Seg, Button } from './Page';
import type { Clip, EditSettings, Plan, WordKey, CaptionStyleId } from '../lib/edit/types';
import { DEFAULT_SETTINGS, wkey } from '../lib/edit/types';
import { readClip, envelope, to16k, dropPcm } from '../lib/edit/media';
import { transcribe, onModelDownload } from '../lib/edit/transcribe';
import { buildTimeline } from '../lib/edit/timeline';
import { groupCaptions, loadCaptionFonts, CAPTION_STYLES, YELLOW } from '../lib/edit/compose';
import { EditPlayer } from '../lib/edit/player';
import { keepAll, requestPlan, resolvePlan, type RawPlan } from '../lib/edit/plan';
import type { Outline } from '../lib/competitors';

// Vibe editing (2026-10-20). Raw takes and a script in, a cut, captioned
// 9:16 Short out, with every step in the browser except choosing the takes.
// Owner only while it is being proven; see Dashboard/AppShell for the gate.

const SETTINGS_KEY = 'chumoku_edit_settings';
const SCRIPT_KEY = 'chumoku_edit_script';
const NOTES_KEY = 'chumoku_edit_notes';

const fmt = (t: number) => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`;

function readJSON<T>(key: string, fallback: T): T {
  try { const v = localStorage.getItem(key); return v ? { ...fallback, ...JSON.parse(v) } : fallback; } catch { return fallback; }
}

function outlineText(o: Outline): string {
  return [o.hook, ...o.sections.map(s => s.content), o.cta].filter(Boolean).join('\n\n');
}

export function EditPage() {
  const { user } = useAuth();
  const [clips, setClips] = useState<Clip[]>([]);
  const [script, setScript] = useState(() => localStorage.getItem(SCRIPT_KEY) ?? '');
  const [notes, setNotes] = useState(() => localStorage.getItem(NOTES_KEY) ?? '');
  const [settings, setSettings] = useState<EditSettings>(() => readJSON(SETTINGS_KEY, DEFAULT_SETTINGS));
  const [plan, setPlan] = useState<Plan | null>(null);
  const [planning, setPlanning] = useState(false);
  const [error, setError] = useState('');
  const [download, setDownload] = useState<{ loaded: number; total: number } | null>(null);
  const [saved, setSaved] = useState<{ id: string; label: string; text: string }[]>([]);
  const [dragging, setDragging] = useState(false);

  useEffect(() => { localStorage.setItem(SCRIPT_KEY, script); }, [script]);
  useEffect(() => { localStorage.setItem(NOTES_KEY, notes); }, [notes]);
  useEffect(() => { localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings)); }, [settings]);
  useEffect(() => { loadCaptionFonts(); }, []);
  useEffect(() => onModelDownload((loaded, total) => setDownload(loaded >= total ? null : { loaded, total })), []);

  // Saved ideas that have an outline, as scripts to cut against.
  useEffect(() => {
    if (!user) return;
    supabase
      .from('competitor_ideas')
      .select('id, video_title, outline')
      .eq('user_id', user.id)
      .eq('liked', true)
      .not('outline', 'is', null)
      .order('created_at', { ascending: false })
      .limit(30)
      .then(({ data }) => setSaved((data ?? []).map(r => ({
        id: r.id as string,
        label: ((r.outline as Outline)?.hook || (r.video_title as string) || 'Untitled').slice(0, 70),
        text: outlineText(r.outline as Outline),
      }))));
  }, [user]);

  // ── Clips: read, measure, transcribe, one at a time ────────────────────────
  const queue = useRef(Promise.resolve());
  const patch = useCallback((id: string, p: Partial<Clip>) => setClips(cs => cs.map(c => (c.id === id ? { ...c, ...p } : c))), []);

  const addFiles = useCallback((files: FileList | File[]) => {
    const fresh: Clip[] = Array.from(files)
      .filter(f => f.type.startsWith('video/') || /\.(mov|mp4|m4v|webm)$/i.test(f.name))
      .map(f => ({
        id: crypto.randomUUID(), file: f, name: f.name, url: URL.createObjectURL(f),
        duration: 0, width: 0, height: 0, thumb: null, env: null, words: null, status: 'reading', progress: 0,
      }));
    if (!fresh.length) return;
    setClips(cs => [...cs, ...fresh]);
    setPlan(null);
    for (const clip of fresh) {
      queue.current = queue.current.then(async () => {
        try {
          const info = await readClip(clip.id, clip.file);
          if (!info.pcm) throw new Error('This clip has no sound');
          const env = envelope(info.pcm);
          patch(clip.id, { duration: info.duration, width: info.width, height: info.height, thumb: info.thumb, env, status: 'transcribing' });
          const audio = await to16k(info.pcm);
          const words = await transcribe(audio, env, p => patch(clip.id, { progress: p }));
          patch(clip.id, { words, status: 'ready', progress: 1 });
        } catch (e) {
          patch(clip.id, { status: 'error', error: e instanceof Error ? e.message : String(e) });
        }
      });
    }
  }, [patch]);

  // Local testing: lets a script hand files to the page without a file picker.
  useEffect(() => {
    if (!import.meta.env.DEV) return;
    const w = window as unknown as { __editAddFiles?: typeof addFiles; __editApplyPlan?: (raw: RawPlan) => void };
    w.__editAddFiles = addFiles;
    w.__editApplyPlan = raw => setPlan(resolvePlan(clips.filter(c => c.status === 'ready'), raw));
  }, [addFiles, clips]);

  const removeClip = (id: string) => {
    setClips(cs => {
      const c = cs.find(x => x.id === id);
      if (c) { URL.revokeObjectURL(c.url); dropPcm(c.id); }
      return cs.filter(x => x.id !== id);
    });
    setPlan(null);
  };

  const ready = clips.filter(c => c.status === 'ready');
  const allReady = clips.length > 0 && clips.every(c => c.status === 'ready' || c.status === 'error') && ready.length > 0;

  // ── The cut ────────────────────────────────────────────────────────────────
  const effectivePlan = useMemo(() => (allReady ? plan ?? keepAll(ready) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [plan, allReady, ready.map(c => c.id).join()]);
  const timeline = useMemo(() => (effectivePlan ? buildTimeline(ready, effectivePlan, settings) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [effectivePlan, settings, ready.map(c => c.id).join()]);
  const groups = useMemo(() => (timeline ? groupCaptions(timeline.caps, settings.captions) : []), [timeline, settings.captions]);

  // Picking takes is one model call that thinks for a minute or more, so the
  // button counts the seconds rather than leaving a shimmer to guess at.
  const [planSecs, setPlanSecs] = useState(0);
  const cut = async () => {
    setPlanning(true);
    setError('');
    setPlanSecs(0);
    const tick = setInterval(() => setPlanSecs(s => s + 1), 1000);
    try {
      setPlan(await requestPlan(ready, script, notes));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      clearInterval(tick);
      setPlanning(false);
    }
  };

  const toggleWord = (key: WordKey, hot: boolean) => {
    const base = effectivePlan!;
    const next: Plan = { ...base, kept: new Set(base.kept), hot: new Set(base.hot) };
    const set = hot ? next.hot : next.kept;
    if (set.has(key)) set.delete(key); else set.add(key);
    if (hot) next.kept.add(key);
    setPlan(next);
  };

  // ── Preview ────────────────────────────────────────────────────────────────
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const playerRef = useRef<EditPlayer | null>(null);
  const [playing, setPlaying] = useState(false);
  const [time, setTime] = useState(0);
  const readyKey = ready.map(c => c.id).join();

  useEffect(() => {
    if (!timeline || !canvasRef.current) return;
    const p = new EditPlayer(canvasRef.current, ready, timeline, settings, timeline.caps, groups);
    p.onTime = setTime;
    p.onEnded = () => setPlaying(false);
    playerRef.current = p;
    p.seek(0);
    loadCaptionFonts().then(() => p.render());
    return () => { p.destroy(); playerRef.current = null; setPlaying(false); };
    // Rebuilt only when the set of clips changes; edits go through update().
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [readyKey, !!timeline]);

  useEffect(() => {
    if (timeline && playerRef.current) playerRef.current.update(timeline, settings, timeline.caps, groups);
  }, [timeline, settings, groups]);

  const togglePlay = useCallback(() => {
    const p = playerRef.current;
    if (!p) return;
    if (p.playing) { p.pause(); setPlaying(false); } else { p.play(); setPlaying(true); }
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      if (e.code !== 'Space' || el.closest('textarea, input, select, button')) return;
      e.preventDefault();
      togglePlay();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [togglePlay]);

  // ── Export ─────────────────────────────────────────────────────────────────
  const [exporting, setExporting] = useState<{ p: number; stage: string } | null>(null);
  const [result, setResult] = useState<{ url: string; file: File } | null>(null);
  const abort = useRef<AbortController | null>(null);

  const runExport = async () => {
    if (!timeline) return;
    playerRef.current?.pause();
    setPlaying(false);
    setError('');
    if (result) URL.revokeObjectURL(result.url);
    setResult(null);
    abort.current = new AbortController();
    setExporting({ p: 0, stage: 'Starting' });
    try {
      const { exportVideo } = await import('../lib/edit/render');
      const blob = await exportVideo(ready, timeline, settings, timeline.caps, groups,
        (p, stage) => setExporting({ p, stage }), abort.current.signal);
      const file = new File([blob], `chumoku-edit-${new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-')}.mp4`, { type: 'video/mp4' });
      const url = URL.createObjectURL(file);
      setResult({ url, file });
      const a = document.createElement('a');
      a.href = url;
      a.download = file.name;
      a.click();
    } catch (e) {
      if (!(e instanceof DOMException && e.name === 'AbortError')) setError(e instanceof Error ? e.message : String(e));
    } finally {
      setExporting(null);
    }
  };

  const canShare = typeof navigator !== 'undefined' && !!navigator.canShare && !!result && navigator.canShare({ files: [result.file] });

  // ── Transcript: which word is under the playhead ───────────────────────────
  const speaking = useMemo(() => timeline?.caps.find(c => time >= c.t0 && time < c.t1)?.key ?? null, [timeline, time]);

  const set = <K extends keyof EditSettings>(k: K, v: EditSettings[K]) => setSettings(s => ({ ...s, [k]: v }));

  return (
    <Page>
      <PageHead title="Edit" />

      <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_340px] lg:gap-12 items-start">
        {/* On a phone the player leads once there is a cut to play; before
            that it would only push the drop zone below the fold. */}
        <div className={`min-w-0 ${timeline ? 'order-2' : 'order-1'} lg:order-1`}>
          {/* ── Clips ── */}
          <section>
            <p className="label-mono mb-4">Clips</p>
            <label
              onDragOver={e => { e.preventDefault(); setDragging(true); }}
              onDragLeave={() => setDragging(false)}
              onDrop={e => { e.preventDefault(); setDragging(false); addFiles(e.dataTransfer.files); }}
              className="flex flex-col items-center justify-center gap-2 rounded-[var(--r-md)] px-6 py-8 cursor-pointer text-center transition-colors"
              style={{
                background: dragging ? 'var(--bg-raised-hover)' : 'var(--bg-raised)',
                border: `1px dashed ${dragging ? 'var(--text-muted)' : 'var(--line-strong)'}`,
              }}
            >
              <Upload className="w-5 h-5" style={{ color: 'var(--text-muted)' }} />
              <span className="text-[14px]" style={{ color: 'var(--text)' }}>Drop raw takes</span>
              <span className="text-[12px]" style={{ color: 'var(--text-faint)' }}>MOV, MP4. Stays on this device.</span>
              <input type="file" accept="video/*,.mov" multiple className="hidden" onChange={e => { if (e.target.files) addFiles(e.target.files); e.target.value = ''; }} />
            </label>

            {download && (
              <p className="text-[12px] mt-3 text-working">
                Speech model {Math.round((download.loaded / download.total) * 100)}% · once per browser
              </p>
            )}

            {clips.length > 0 && (
              <div className="row-list mt-3">
                {clips.map((c, i) => (
                  <div key={c.id} className="flex items-center gap-3 rounded-[var(--r-md)] p-2.5 pr-3" style={{ background: 'var(--bg-raised)', border: '1px solid var(--line)' }}>
                    <div className="w-9 h-14 rounded-md overflow-hidden flex-shrink-0" style={{ background: '#000' }}>
                      {c.thumb && <img src={c.thumb} alt="" className="w-full h-full object-cover" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-[13px] truncate" style={{ color: 'var(--text)' }}>{i + 1}. {c.name}</p>
                      <p className="text-[12px] mt-0.5" style={{ color: c.status === 'error' ? 'rgb(var(--danger-rgb))' : 'var(--text-faint)' }}>
                        {c.status === 'reading' && <span className="text-working">Reading</span>}
                        {c.status === 'transcribing' && <span className="text-working">Transcribing {Math.round(c.progress * 100)}%</span>}
                        {c.status === 'ready' && `${fmt(c.duration)} · ${c.words?.length ?? 0} words`}
                        {c.status === 'error' && c.error}
                      </p>
                      {c.status === 'transcribing' && (
                        <div className="h-[2px] mt-2 rounded-full overflow-hidden" style={{ background: 'var(--line)' }}>
                          <div className="h-full transition-[width] duration-300" style={{ width: `${c.progress * 100}%`, background: 'var(--process)' }} />
                        </div>
                      )}
                    </div>
                    <button onClick={() => removeClip(c.id)} className="p-1.5 rounded-md transition-colors hover:bg-white/5" title="Remove" style={{ color: 'var(--text-faint)' }}>
                      <Trash className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* ── Script ── */}
          <Section
            label="Script"
            action={saved.length > 0 ? (
              <select
                value=""
                onChange={e => { const s = saved.find(x => x.id === e.target.value); if (s) setScript(s.text); }}
                className="text-[12px] rounded-md px-2 py-1 max-w-[200px]"
                style={{ background: 'var(--bg-raised)', border: '1px solid var(--line)', color: 'var(--text-muted)' }}
              >
                <option value="">From saved</option>
                {saved.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
              </select>
            ) : undefined}
          >
            <textarea
              value={script}
              onChange={e => setScript(e.target.value)}
              placeholder="Paste what you were reading. Leave empty to just clean up the takes."
              rows={6}
              className="w-full rounded-[var(--r-md)] px-4 py-3 text-[14px] leading-[22px] resize-y focus:outline-none"
              style={{ background: 'var(--bg-raised)', border: '1px solid var(--line)', color: 'var(--text)' }}
            />
            <input
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder="Notes, e.g. cut the pricing bit"
              className="w-full mt-2 rounded-[var(--r-md)] px-4 h-11 text-[14px] focus:outline-none"
              style={{ background: 'var(--bg-raised)', border: '1px solid var(--line)', color: 'var(--text)' }}
            />
            <div className="flex items-center gap-3 mt-4 flex-wrap">
              <Button variant="primary" onClick={cut} disabled={!allReady || planning}>
                {planning ? <span className="tabular-nums">Picking takes · {planSecs}s</span> : plan ? 'Cut again' : 'Cut'}
              </Button>
              {plan && <Button variant="text" onClick={() => setPlan(null)}>Keep everything</Button>}
            </div>
            {plan?.note && <p className="text-[13px] mt-3" style={{ color: 'var(--text-muted)' }}>{plan.note}</p>}
            {error && <p className="text-[13px] mt-3" style={{ color: 'rgb(var(--danger-rgb))' }}>{error}</p>}
          </Section>

          {/* ── Style ── */}
          <Section label="Captions">
            <div className="grid grid-cols-5 gap-2">
              {(['pop', 'bold', 'word', 'clean', 'none'] as CaptionStyleId[]).map(id => (
                <CaptionTile key={id} id={id} on={settings.captions === id} onClick={() => set('captions', id)} />
              ))}
            </div>
            <div className="flex flex-wrap gap-x-6 gap-y-4 mt-6">
              <Control label="Position">
                <Seg options={[{ id: 'middle', label: 'Middle' }, { id: 'lower', label: 'Lower' }]} value={settings.capPos} onChange={v => set('capPos', v)} />
              </Control>
              <Control label="Pauses">
                <Seg options={[{ id: 'tight', label: 'Tight' }, { id: 'natural', label: 'Natural' }]} value={settings.pace} onChange={v => set('pace', v)} />
              </Control>
              <Control label="Speed">
                <Seg
                  options={[{ id: '1', label: '1×' }, { id: '1.1', label: '1.1×' }, { id: '1.2', label: '1.2×' }]}
                  value={String(settings.speed) as '1' | '1.1' | '1.2'}
                  onChange={v => set('speed', Number(v))}
                />
              </Control>
              <Control label="Zoom">
                <Seg options={[{ id: 'off', label: 'Off' }, { id: 'cuts', label: 'On cuts' }, { id: 'punch', label: 'Punch' }]} value={settings.zoom} onChange={v => set('zoom', v)} />
              </Control>
            </div>
          </Section>

          {/* ── Transcript ── */}
          {allReady && effectivePlan && (
            <Section label="Words" action={<span className="text-[12px]" style={{ color: 'var(--text-faint)' }}>Tap to cut · double-tap to highlight</span>}>
              <div className="flex flex-col gap-5">
                {ready.map(c => {
                  const ci = ready.indexOf(c);
                  return (
                    <div key={c.id}>
                      {ready.length > 1 && <p className="text-[12px] mb-1.5" style={{ color: 'var(--text-faint)' }}>{c.name}</p>}
                      <p className="text-[15px] leading-[28px]" style={{ touchAction: 'manipulation' }}>
                        {c.words!.map((w, i) => {
                          const k = wkey(ci, i);
                          const kept = effectivePlan.kept.has(k);
                          const hot = effectivePlan.hot.has(k);
                          const gap = i > 0 && w.s - c.words![i - 1].e >= 0.7;
                          return (
                            <span key={k}>
                              {gap && <span className="inline-block w-3" />}
                              <span
                                onClick={e => toggleWord(k, e.altKey)}
                                // The two clicks before it toggled the cut twice, back to where it was.
                                onDoubleClick={() => toggleWord(k, true)}
                                className="cursor-pointer select-none rounded px-[2px] transition-colors hover:bg-white/10"
                                style={{
                                  color: kept ? 'var(--text)' : 'var(--text-faint)',
                                  textDecoration: kept ? (hot ? 'underline' : 'none') : 'line-through',
                                  textDecorationColor: hot ? YELLOW : undefined,
                                  textUnderlineOffset: 4,
                                  opacity: kept ? 1 : 0.5,
                                  fontWeight: hot ? 600 : 400,
                                  background: speaking === k ? 'var(--bg-raised-hover)' : undefined,
                                }}
                              >
                                {effectivePlan.fixes[k] ?? w.text}
                              </span>{' '}
                            </span>
                          );
                        })}
                      </p>
                    </div>
                  );
                })}
              </div>
            </Section>
          )}
        </div>

        {/* ── Preview ── */}
        <div className={`${timeline ? 'order-1' : 'order-2'} lg:order-2 lg:sticky lg:top-6`}>
          <div
            className="relative mx-auto rounded-[var(--r-lg)] overflow-hidden cursor-pointer"
            style={{ aspectRatio: '9 / 16', maxHeight: '68dvh', background: '#000', border: '1px solid var(--line)' }}
            onClick={togglePlay}
          >
            <canvas ref={canvasRef} width={540} height={960} className="w-full h-full block" />
            {!timeline && (
              <div className="absolute inset-0 flex items-center justify-center px-8 text-center">
                <p className="text-[13px]" style={{ color: 'var(--text-faint)' }}>
                  {clips.length === 0 ? 'Your cut plays here' : <span className="text-working">Getting the words</span>}
                </p>
              </div>
            )}
            {timeline && !playing && (
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <span className="w-14 h-14 rounded-full flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.45)', backdropFilter: 'blur(8px)' }}>
                  <Play className="w-6 h-6 text-white ml-0.5" />
                </span>
              </div>
            )}
          </div>

          {timeline && (
            <>
              <div className="flex items-center gap-3 mt-3">
                <button onClick={togglePlay} className="p-1.5 rounded-md hover:bg-white/5" style={{ color: 'var(--text)' }} title={playing ? 'Pause' : 'Play'}>
                  {playing ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
                </button>
                <input
                  type="range" min={0} max={timeline.duration} step={0.01} value={Math.min(time, timeline.duration)}
                  onChange={e => playerRef.current?.seek(Number(e.target.value))}
                  className="flex-1 accent-white"
                />
                <span className="text-[12px] tabular-nums" style={{ color: 'var(--text-muted)' }}>{fmt(time)} / {fmt(timeline.duration)}</span>
              </div>

              <div className="mt-5">
                {exporting ? (
                  <div>
                    <div className="flex justify-between text-[12px] mb-2" style={{ color: 'var(--text-muted)' }}>
                      <span className="text-working">{exporting.stage}</span>
                      <span className="tabular-nums">{Math.round(exporting.p * 100)}%</span>
                    </div>
                    <div className="h-[3px] rounded-full overflow-hidden" style={{ background: 'var(--line)' }}>
                      <div className="h-full transition-[width] duration-200" style={{ width: `${exporting.p * 100}%`, background: 'var(--process)' }} />
                    </div>
                    <Button variant="text" className="mt-3" onClick={() => abort.current?.abort()}>Cancel</Button>
                  </div>
                ) : (
                  <div className="flex gap-2 flex-wrap">
                    <Button variant="primary" className="flex-1" onClick={runExport}>Export</Button>
                    {result && (
                      <a className="btn btn--secondary" href={result.url} download={result.file.name} title="Download again">
                        <Download className="w-4 h-4" />
                      </a>
                    )}
                    {canShare && (
                      <Button onClick={() => navigator.share({ files: [result!.file] }).catch(() => {})}>Save to Photos</Button>
                    )}
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </Page>
  );
}

function Control({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-[12px] mb-2" style={{ color: 'var(--text-faint)' }}>{label}</p>
      {children}
    </div>
  );
}

// A thumbnail of each caption style, drawn in its own font and colours.
function CaptionTile({ id, on, onClick }: { id: CaptionStyleId; on: boolean; onClick: () => void }) {
  const s = id === 'none' ? null : CAPTION_STYLES[id];
  return (
    <button
      onClick={onClick}
      className="flex flex-col items-center gap-2 rounded-[var(--r-sm)] pt-4 pb-2.5 px-1 transition-colors"
      style={{
        background: on ? 'var(--bg-raised-hover)' : 'var(--bg-raised)',
        border: `1px solid ${on ? 'var(--text-muted)' : 'var(--line)'}`,
      }}
    >
      <span className="h-7 flex items-center justify-center text-center leading-none whitespace-nowrap" style={s ? {
        fontFamily: `"${s.font}", Inter, sans-serif`,
        fontWeight: s.weight,
        fontSize: id === 'clean' ? 11 : id === 'bold' ? 18 : 14,
        color: s.fill,
        textTransform: s.upper ? 'uppercase' : 'none',
        WebkitTextStroke: s.stroke ? '3px #000' : undefined,
        paintOrder: 'stroke fill',
        textShadow: s.stroke ? undefined : '0 2px 8px rgba(0,0,0,0.8)',
      } : { color: 'var(--text-faint)', fontSize: 13 }}>
        {id === 'pop' && <>so{'\u00a0'}<span style={{ color: YELLOW }}>this</span></>}
        {id === 'bold' && 'so this'}
        {id === 'word' && 'this'}
        {id === 'clean' && 'so this is'}
        {id === 'none' && 'Aa'}
      </span>
      <span className="text-[11px]" style={{ color: on ? 'var(--text)' : 'var(--text-faint)' }}>{s?.label ?? 'None'}</span>
    </button>
  );
}

export default EditPage;
