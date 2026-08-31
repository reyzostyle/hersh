import { useState } from 'react';
import { createPortal } from 'react-dom';
import { CloseCircleOutlineIcon as X, FolderOutlineIcon as Folder, AddOutlineIcon as Plus, RefreshOutlineIcon as Loader2 } from '@solar-icons/react';
import { Check } from './BrandIcons';
import { type Project } from '../lib/projects';

// Picking where a saved idea goes. Unfiled is a real, first-class choice rather
// than a fallback - saving has to stay one decision, so nobody is forced to
// invent a project name before they can keep something.
//
// Was SaveToFolderModal, over idea_folders. Same interaction, but the thing you
// file into is now the same project a conversation can be filed into.
export function SaveToProjectModal({ projects, currentProjectId, isSaved, onPick, onUnsave, onCreateProject, onClose }: {
  projects: Project[];
  currentProjectId: string | null;
  isSaved: boolean;
  onPick: (projectId: string | null) => void;
  onUnsave: () => void;
  onCreateProject: (name: string) => Promise<Project | null>;
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
    const project = await onCreateProject(name);
    setBusy(false);
    if (project) {
      setNewName('');
      setCreating(false);
      onPick(project.id);
    }
  };

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4" onClick={onClose}>
      <div className="absolute inset-0 animate-fade-in" style={{ background: 'rgba(0,0,0,0.6)' }} />
      <div
        className="relative w-full max-w-sm rounded-[var(--r-lg)] p-4 animate-scale-in"
        style={{ background: 'var(--bg-raised)', border: '1px solid var(--line-strong)' }}
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-3">
          <p className="text-[14px] font-medium" style={{ color: 'var(--text)' }}>Save to project</p>
          <button onClick={onClose} className="p-1 transition-colors hover:text-[var(--text)]" style={{ color: 'var(--text-faint)' }} aria-label="Close">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="space-y-1 max-h-64 overflow-y-auto" style={{ overscrollBehavior: 'contain' }}>
          <Row label="Unfiled" active={isSaved && currentProjectId === null} onClick={() => onPick(null)} />
          {projects.map(p => (
            <Row key={p.id} label={p.name} active={currentProjectId === p.id} onClick={() => onPick(p.id)} />
          ))}
        </div>

        {creating ? (
          <form onSubmit={submitNew} className="flex gap-1.5 mt-2">
            <input
              autoFocus
              value={newName}
              onChange={e => setNewName(e.target.value)}
              onBlur={() => { if (!newName.trim()) setCreating(false); }}
              placeholder="Project name"
              maxLength={40}
              className="flex-1 px-3 py-2 rounded-[var(--r-sm)] text-[13px] focus:outline-none"
              style={{ background: 'var(--bg-app)', border: '1px solid var(--line)', color: 'var(--text)' }}
            />
            <button type="submit" disabled={busy || !newName.trim()}
                    className="btn-primary px-3 py-2 rounded-[var(--r-sm)] text-[13px] font-medium disabled:opacity-40">
              {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : 'Add'}
            </button>
          </form>
        ) : (
          <button
            onClick={() => setCreating(true)}
            className="w-full flex items-center gap-2 mt-2 px-3 py-2 rounded-[var(--r-sm)] text-[13px] transition-colors"
            style={{ border: '1px dashed var(--line-strong)', color: 'var(--text-muted)' }}
          >
            <Plus className="w-3.5 h-3.5" /> New project
          </button>
        )}

        {isSaved && (
          <button
            onClick={onUnsave}
            className="w-full mt-2 px-3 py-2 rounded-[var(--r-sm)] text-[13px] transition-colors"
            style={{ color: 'rgb(var(--danger-rgb))' }}
          >
            Remove from saved
          </button>
        )}
      </div>
    </div>,
    document.body,
  );
}

function Row({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="w-full flex items-center gap-2.5 px-3 py-2 rounded-[var(--r-sm)] text-left transition-colors"
      style={{
        background: active ? 'var(--bg-raised-hover)' : 'transparent',
        color: active ? 'var(--text)' : 'var(--text-muted)',
      }}
    >
      <Folder className="w-4 h-4 flex-shrink-0" />
      <span className="flex-1 truncate text-[13px]">{label}</span>
      {active && <Check className="w-3.5 h-3.5 flex-shrink-0" style={{ color: 'var(--text)' }} />}
    </button>
  );
}
