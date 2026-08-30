import { useState } from 'react';
import { createPortal } from 'react-dom';
import { X, Folder, Plus, Loader2, Check } from 'lucide-react';
import { type IdeaFolder } from '../lib/competitors';

// Picking where a saved idea goes. Unfiled is a real, first-class choice
// rather than a fallback — saving has to stay one decision, so nobody is
// forced to invent a folder name before they can keep something.
export function SaveToFolderModal({ folders, currentFolderId, isSaved, onPick, onUnsave, onCreateFolder, onClose }: {
  folders: IdeaFolder[];
  currentFolderId: string | null;
  isSaved: boolean;
  onPick: (folderId: string | null) => void;
  onUnsave: () => void;
  onCreateFolder: (name: string) => Promise<IdeaFolder | null>;
  onClose: () => void;
}) {
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [busy, setBusy] = useState(false);

  const submitNew = async (e: React.FormEvent) => {
    e.preventDefault();
    const name = newName.trim();
    if (!name) return;
    setBusy(true);
    const folder = await onCreateFolder(name);
    setBusy(false);
    if (folder) {
      setNewName('');
      setCreating(false);
      onPick(folder.id);
    }
  };

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4" onClick={onClose}>
      <div className="absolute inset-0 animate-fade-in" style={{ background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)' }} />
      <div
        className="relative w-full max-w-sm rounded-2xl p-4 animate-scale-in"
        style={{ background: '#0B121F', border: '1px solid rgba(255,255,255,0.12)' }}
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-3">
          <p className="text-sm font-semibold text-white">Save to folder</p>
          <button onClick={onClose} className="p-1 rounded-lg text-gray-500 hover:text-white transition-colors" aria-label="Close">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="space-y-1 max-h-64 overflow-y-auto" style={{ overscrollBehavior: 'contain' }}>
          <FolderRow
            label="Unfiled"
            active={isSaved && currentFolderId === null}
            onClick={() => onPick(null)}
          />
          {folders.map(f => (
            <FolderRow
              key={f.id}
              label={f.name}
              active={isSaved && currentFolderId === f.id}
              onClick={() => onPick(f.id)}
            />
          ))}
        </div>

        {creating ? (
          <form onSubmit={submitNew} className="flex gap-2 mt-3">
            <input
              autoFocus
              value={newName}
              onChange={e => setNewName(e.target.value)}
              placeholder="Folder name"
              maxLength={40}
              className="flex-1 px-3 py-2 rounded-xl text-white text-sm placeholder-gray-600 focus:outline-none"
              style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.10)' }}
            />
            <button
              type="submit"
              disabled={busy || !newName.trim()}
              className="px-3 py-2 rounded-xl text-white text-sm font-semibold disabled:opacity-50"
              style={{ background: 'var(--accent)' }}
            >
              {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Add'}
            </button>
          </form>
        ) : (
          <button
            onClick={() => setCreating(true)}
            className="flex items-center gap-1.5 mt-3 px-2 py-1.5 rounded-lg text-xs font-medium text-gray-400 hover:text-white transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
            New folder
          </button>
        )}

        {isSaved && (
          <button
            onClick={onUnsave}
            className="w-full mt-3 pt-3 text-xs text-gray-500 hover:text-red-400 transition-colors text-left"
            style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}
          >
            Remove from saved
          </button>
        )}
      </div>
    </div>,
    document.body
  );
}

function FolderRow({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="w-full flex items-center gap-2 px-3 py-2 rounded-xl text-sm transition-colors"
      style={active
        ? { background: 'rgba(var(--accent-rgb),0.12)', color: 'var(--accent-soft)' }
        : { color: '#d1d5db' }}
    >
      <Folder className="w-4 h-4 flex-shrink-0" />
      <span className="truncate flex-1 text-left">{label}</span>
      {active && <Check className="w-4 h-4 flex-shrink-0" />}
    </button>
  );
}
