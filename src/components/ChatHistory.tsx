import { useState, useEffect, useRef } from 'react';
import { ChatRoundOutlineIcon as Chat, CloseCircleOutlineIcon as Remove, PenOutlineIcon as Pen } from '@solar-icons/react';
import { Section, EditActions, Row, Skeleton } from './Page';
import { listRecentThreads, deleteThread, renameThread, requestOpenThread, peekHistoryRequest, clearHistoryRequest, type RecentThread } from '../lib/projects';
import { formatDate } from '../lib/competitors';

const HISTORY_NOTE = 'Every conversation you have had. Open one to pick it back up.';

// Chat history lives on the hub and in Saved rather than in Chat. Analyze's empty screen is a
// headline and a composer, and putting a list under it would turn the one
// uncluttered surface in the product into a dashboard. The hub, meanwhile, was
// three links that also exist in the sidebar - it had nothing of its own to
// show. Now it shows the work.

// Eight was the whole list, and the note over it said "every analysis you have
// run" - true of the table, not of what was on screen. The ninth conversation
// was unreachable from anywhere in the product.
const PREVIEW_COUNT = 8;
const HISTORY_LIMIT = 200;

export function ChatHistory() {
  const [threads, setThreads] = useState<RecentThread[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const sectionRef = useRef<HTMLDivElement>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [draft, setDraft] = useState('');

  // Chat sends people here by pressing History, which is a request to see
  // this section rather than the tools above it. Arriving that way opens the
  // full list and scrolls to it; arriving normally leaves the hub as it was.
  const [wanted] = useState(peekHistoryRequest);

  useEffect(() => {
    clearHistoryRequest();
    listRecentThreads(HISTORY_LIMIT).then(setThreads).finally(() => setLoaded(true));
    if (wanted) setShowAll(true);
  }, []);

  useEffect(() => {
    if (!wanted || !loaded || !threads.length) return;
    sectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [wanted, loaded, threads.length]);

  const remove = async (id: string) => {
    setThreads(prev => prev.filter(t => t.id !== id));
    await deleteThread(id);
  };

  const commitRename = async (t: RecentThread) => {
    const title = draft.trim();
    setRenamingId(null);
    if (!title || title === t.title) return;
    setThreads(prev => prev.map(x => (x.id === t.id ? { ...x, title } : x)));
    await renameThread(t.id, title);
  };

  // Three states, not two. Rendering nothing until the query came back meant
  // the section appeared out of nowhere a moment after the page settled, which
  // shifted everything under it. Skeleton rows hold the space at the height the
  // real rows will occupy, so the list fills in rather than arrives.
  //
  // Nothing at all is still nothing: an empty account should not be told it has
  // no history on the screen it lands on.
  if (loaded && threads.length === 0) return null;

  if (!loaded) {
    return (
      <div ref={sectionRef}>
      <Section label="Chat history" note={HISTORY_NOTE}>
        <div className="row-list">
          {[0, 1, 2].map(i => (
            <div key={i} className="row">
              <span className="row-icon" />
              <Skeleton className="h-3" style={{ width: `${58 - i * 11}%` }} />
              <Skeleton className="ml-auto h-3 w-10" />
            </div>
          ))}
        </div>
      </Section>
      </div>
    );
  }

  const shown = showAll ? threads : threads.slice(0, PREVIEW_COUNT);

  return (
    // "Recent" named when they happened, not what they are, and the rules
    // under it read as a footnote to the tools above rather than as the record
    // of every conversation in the account. It says what it is now, with a
    // line under the label saying what pressing one does - and the rows are
    // the same plate as everything else on the page.
    <div ref={sectionRef}>
    <Section
      label="Chat history"
      note={HISTORY_NOTE}
      action={threads.length > PREVIEW_COUNT && (
        <button onClick={() => setShowAll(v => !v)} className="chip">
          {showAll ? 'Show less' : `Show all ${threads.length}`}
        </button>
      )}
    >
      <div className="row-list">
        {shown.map(t => (
          renamingId === t.id ? (
            <div key={t.id} className="row">
              <span className="row-icon"><Chat className="w-[18px] h-[18px]" /></span>
              <input
                autoFocus
                value={draft}
                onChange={e => setDraft(e.target.value)}
                onBlur={() => commitRename(t)}
                onKeyDown={e => {
                  if (e.key === 'Enter') commitRename(t);
                  if (e.key === 'Escape') setRenamingId(null);
                }}
                maxLength={120}
                className="flex-1 min-w-0 bg-transparent text-[15px] focus:outline-none"
                style={{ color: 'var(--text)', borderBottom: '1px solid var(--line-strong)' }}
              />
              <EditActions onSave={() => commitRename(t)} onCancel={() => setRenamingId(null)} />
            </div>
          ) : (
            <Row
              key={t.id}
              icon={<Chat className="w-[18px] h-[18px]" />}
              title={t.title || 'Untitled conversation'}
              meta={formatDate(t.updated_at)}
              onClick={() => requestOpenThread(t.id)}
              /* All three stay visible. They were revealed on hover to keep the
                 list quiet, which cost more than it bought: a phone has no
                 hover, so rename and delete were simply unreachable there, and
                 a control nobody can see is a control nobody knows exists. They
                 sit at the faint end of the palette instead, and brighten when
                 the cursor reaches them. */
              actions={<>
                <button
                  onClick={() => { setDraft(t.title || ''); setRenamingId(t.id); }}
                  title="Rename"
                  className="p-1 transition-colors hover:text-[var(--text)]"
                  style={{ color: 'var(--text-faint)' }}
                >
                  <Pen className="w-4 h-4" />
                </button>
                <button
                  onClick={() => remove(t.id)}
                  title="Delete this conversation"
                  className="p-1 transition-colors hover:text-[rgb(var(--danger-rgb))]"
                  style={{ color: 'var(--text-faint)' }}
                >
                  <Remove className="w-4 h-4" />
                </button>
              </>}
            />
          )
        ))}
      </div>

    </Section>
    </div>
  );
}
