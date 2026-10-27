import { StarsMinimalisticOutlineIcon as Sparkle } from '@solar-icons/react';
import type { CompetitorIdea } from '../lib/competitors';

// The cover of an idea Chumoku suggested from the creator's own channel
// (2026-10-27). There is no video behind it and nothing has tested it, so it
// must not look like the Shorts around it: no frame, no multiple in the corner.
// What it shows instead is where it came from: their own Short, blurred into
// the background and set small in the middle, inside a dashed edge that reads
// as a sketch rather than a result. Fills whatever media box it is put in.
export function AiIdeaCover({ idea, eager }: { idea: CompetitorIdea; eager?: boolean }) {
  const basis = idea.basis;
  const thumb = basis?.video_id ? `https://i.ytimg.com/vi/${basis.video_id}/hqdefault.jpg` : null;

  return (
    <div className="ai-cover">
      {thumb && <img className="ai-cover__wash" src={thumb} alt="" loading={eager ? 'eager' : 'lazy'} decoding="async" />}
      <span className="ai-cover__tag"><Sparkle className="w-3.5 h-3.5" />AI idea</span>
      {thumb && (
        <span className="ai-cover__src">
          <img src={thumb} alt="" loading={eager ? 'eager' : 'lazy'} decoding="async" />
        </span>
      )}
      {basis && (
        <p className="ai-cover__from">
          <span>From your Short</span>
          {basis.multiple >= 1.2 ? ` · ${basis.multiple}× your usual` : ''}
        </p>
      )}
    </div>
  );
}
