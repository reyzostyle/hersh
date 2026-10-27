import { ownIdeaHook, type CompetitorIdea } from '../lib/competitors';

// The cover of an idea Chumoku found for the creator rather than took from a
// Short (2026-10-27). There is no video behind it and nothing has tested it,
// so it must not look like the Shorts around it: no frame, no multiple. It is
// the line they would open on, set like a script inside a dashed edge, and at
// the bottom what it came from. Fills whatever media box it is put in.
//
// First version had a green "AI idea" pill and the creator's own Short behind
// it; Ivan cut the green, and the ideas stopped being mostly remixes, so the
// picture went too.
export function AiIdeaCover({ idea }: { idea: CompetitorIdea }) {
  const basis = idea.basis;
  const from = basis?.kind === 'remix' || (basis && 'title' in basis && basis.title)
    ? `Remix of your Short${basis && 'multiple' in basis && basis.multiple >= 1.2 ? ` · ${basis.multiple}× your usual` : ''}`
    : basis && 'source' in basis && basis.source ? basis.source : null;

  return (
    <div className="ai-cover">
      <p className="ai-cover__line">{ownIdeaHook(idea)}</p>
      {from && <p className="ai-cover__from">{from}</p>}
    </div>
  );
}
