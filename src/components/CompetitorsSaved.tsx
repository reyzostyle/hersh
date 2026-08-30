import { useState } from 'react';
import { Folder, FolderPlus, Loader2, X, Bookmark } from 'lucide-react';
import { type CompetitorIdea, type IdeaFolder } from '../lib/competitors';
import { CompetitorVideoCard } from './CompetitorVideoCard';

interface Props {
  ideas: CompetitorIdea[];
  folders: IdeaFolder[];
  onIdeaUpdated: (updated: CompetitorIdea) => void;
  onOpenIdea: (id: string) => void;
  onSaveIdea: (idea: CompetitorIdea) => void;
  onCreateFolder: (name: string) => Promise<IdeaFolder | null>;
  onDeleteFolder: (folder: IdeaFolder) => void;
  deletingFolderId: string | null;
}

// Everything you kept, filed the way you filed it. Replaces the old Scripts
// tab: that list was defined by "has an outline or script", which is a
// generation state rather than a decision you made, so it filled up on its
// own and there was no way to organise it.
export function CompetitorsSaved({
  ideas, folders, onIdeaUpdated, onOpenIdea, onSaveIdea, onCreateFolder, onDeleteFolder, deletingFolderId,
}: Props) {
  // null = All, 'unfiled' = saved but not in a folder, otherwise a folder id.
  const [active, setActive] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [busy, setBusy] = useState(false);

  const saved = ideas.filter(i => i.liked === true);
  const visible = active === null
    ? saved
    : active === 'unfiled'
      ? saved.filter(i => !i.folder_id)
      : saved.filter(i => i.folder_id === active);

  const countIn = (id: string | null) =>
    id === null ? saved.length : id === 'unfiled' ? saved.filter(i => !i.folder_id).length : saved.filter(i => i.folder_id === id).length;

  const submitNew = async (e: React.FormEvent) => {
    e.preventDefault();
    const name = newName.trim();
    if (!name) return;
    setBusy(true);
    const folder = await onCreateFolder(name);
    setBusy(false);
    if (folder) { setNewName(''); setCreating(false); setActive(folder.id); }
  };

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 pt-4 sm:pt-6 pb-8 space-y-4 animate-fade-in-up">
      {/* Folder rail */}
      <div className="flex items-center gap-2 flex-wrap">
        <FolderChip label="All" count={countIn(null)} active={active === null} onClick={() => setActive(null)} />
        <FolderChip label="Unfiled" count={countIn('unfiled')} active={active === 'unfiled'} onClick={() => setActive('unfiled')} />
        {folders.map(f => (
          <FolderChip
            key={f.id}
            label={f.name}
            count={countIn(f.id)}
            active={active === f.id}
            onClick={() => setActive(f.id)}
            onDelete={() => { onDeleteFolder(f); if (active === f.id) setActive(null); }}
            deleting={deletingFolderId === f.id}
          />
        ))}

        {creating ? (
          <form onSubmit={submitNew} className="flex gap-1.5">
            <input
              autoFocus
              value={newName}
              onChange={e => setNewName(e.target.value)}
              onBlur={() => { if (!newName.trim()) setCreating(false); }}
              placeholder="Folder name"
              maxLength={40}
              className="w-36 px-2.5 py-1.5 rounded-full text-white text-xs placeholder-gray-600 focus:outline-none"
              style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)' }}
            />
            <button type="submit" disabled={busy || !newName.trim()} className="px-2.5 py-1.5 rounded-full text-xs font-semibold text-white disabled:opacity-50" style={{ background: 'var(--accent)', color: 'var(--on-accent)' }}>
              {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : 'Add'}
            </button>
          </form>
        ) : (
          <button
            onClick={() => setCreating(true)}
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-full text-xs font-medium transition-all"
            style={{ background: 'rgba(255,255,255,0.04)', color: '#9ca3af', border: '1px dashed rgba(255,255,255,0.14)' }}
          >
            <FolderPlus className="w-3.5 h-3.5" />
            New folder
          </button>
        )}
      </div>

      {visible.length > 0 ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
          {visible.map(idea => (
            <CompetitorVideoCard
              key={idea.id}
              idea={idea}
              onOpen={() => onOpenIdea(idea.id)}
              onLike={value => onIdeaUpdated({ ...idea, liked: value ? true : null })}
              onUpdated={onIdeaUpdated}
              onSave={() => onSaveIdea(idea)}
            />
          ))}
        </div>
      ) : (
        <div
          className="rounded-2xl p-10 flex flex-col items-center justify-center text-center space-y-3"
          style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)', borderStyle: 'dashed' }}
        >
          <Bookmark className="w-8 h-8 text-gray-700" />
          <p className="text-gray-500 text-sm max-w-sm">
            {saved.length === 0
              ? 'Nothing saved yet. Hit Save on an idea in the Feed to keep it here.'
              : 'This folder is empty. Save an idea into it from the Feed.'}
          </p>
        </div>
      )}
    </div>
  );
}

function FolderChip({ label, count, active, onClick, onDelete, deleting }: {
  label: string; count: number; active: boolean; onClick: () => void;
  onDelete?: () => void; deleting?: boolean;
}) {
  return (
    <span
      className="group flex items-center gap-1.5 pl-2.5 pr-2 py-1.5 rounded-full text-xs font-medium transition-all max-w-[190px]"
      style={active
        ? { background: 'rgba(var(--accent-rgb),0.15)', color: 'var(--accent-soft)', border: '1px solid rgba(var(--accent-rgb),0.3)' }
        : { background: 'rgba(255,255,255,0.04)', color: '#9ca3af', border: '1px solid rgba(255,255,255,0.08)' }}
    >
      <button onClick={onClick} className="flex items-center gap-1.5 min-w-0">
        <Folder className="w-3.5 h-3.5 flex-shrink-0" />
        <span className="truncate">{label}</span>
        <span className="tabular-nums opacity-60">{count}</span>
      </button>
      {onDelete && (
        <button
          onClick={onDelete}
          disabled={deleting}
          title="Delete folder (the ideas inside stay saved)"
          className="opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity hover:text-red-400 flex-shrink-0"
        >
          {deleting ? <Loader2 className="w-3 h-3 animate-spin" /> : <X className="w-3 h-3" />}
        </button>
      )}
    </span>
  );
}
