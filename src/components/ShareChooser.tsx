import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { VideocameraOutlineIcon as VideoIcon, UsersGroupRoundedOutlineIcon as IdeasIcon, CloseCircleOutlineIcon as X } from '@solar-icons/react';
import { Row } from './Page';

// A Short shared from a phone's share sheet. The sheet only carries the link,
// not what it was shared for, so this asks - the same two actions the Chrome
// extension puts on the video.
export function ShareChooser({
  url,
  onChoose,
  onClose,
}: {
  url: string;
  onChoose: (action: 'analyze' | 'steal') => void;
  onClose: () => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70" onClick={onClose}
           style={{ backdropFilter: 'blur(6px)', WebkitBackdropFilter: 'blur(6px)' }} />
      <div
        className="relative w-full max-w-md p-5 animate-scale-in"
        style={{ background: 'var(--bg-app)', border: '1px solid var(--line)', borderRadius: 'var(--r-lg)' }}
      >
        <button onClick={onClose} aria-label="Close"
                className="absolute top-4 right-4 transition-colors hover:text-[var(--text)]"
                style={{ color: 'var(--text-faint)' }}>
          <X className="w-4 h-4" />
        </button>

        <p className="label-mono mb-2">Shared Short</p>
        <p className="text-[13px] truncate pr-8 mb-4" style={{ color: 'var(--text-muted)' }}>{url}</p>

        <div className="flex flex-col gap-2">
          <Row
            icon={<VideoIcon className="w-4 h-4" />}
            title="Analyze it"
            subtitle="Why it worked or didn't, scored out of 100"
            meta="5 cr"
            onClick={() => onChoose('analyze')}
          />
          <Row
            icon={<IdeasIcon className="w-4 h-4" />}
            title="Steal this format"
            subtitle="The same moves, rebuilt as an outline for your channel"
            meta="5 cr"
            onClick={() => onChoose('steal')}
          />
        </div>
      </div>
    </div>,
    document.body,
  );
}
