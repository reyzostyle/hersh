import { useState } from 'react';
import { AltArrowDownOutlineIcon as ChevronDown, AltArrowUpOutlineIcon as ChevronUp, ChatRoundOutlineIcon as MessageCircle, CopyOutlineIcon as Copy } from '@solar-icons/react';
import { Check } from './BrandIcons';

const DISCORD_URL = 'https://discord.com/invite/N8S6C95Ry2';

// For failures that are ours to fix (API/network/backend errors), not the
// user's to read. The raw message is real information, but it's information
// for us — showing it as the headline reads as "here's what's wrong with the
// product," which isn't the message and leaks implementation detail besides
// (this is what pushed a user to screenshot a raw Anthropic billing error
// into our public Discord). Lead with "send this to us," keep the raw text
// one tap away for whoever's reporting it.
export function ErrorNotice({ message, className = '' }: { message: string; className?: string }) {
  const [expanded, setExpanded] = useState(false);
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(message);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch { /* clipboard unavailable — the text is still selectable */ }
  };

  return (
    <div className={`rounded-xl border border-red-400/20 bg-red-400/10 text-sm overflow-hidden ${className}`}>
      <div className="px-4 py-3 flex items-center justify-between gap-3 flex-wrap">
        <p className="text-red-400">Something went wrong on our end. Send this to our Discord and we'll fix it.</p>
        <a
          href={DISCORD_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-1.5 flex-shrink-0 px-3 py-1.5 rounded-lg text-xs font-semibold transition-opacity hover:opacity-90"
          style={{ background: 'rgba(88,101,242,0.15)', border: '1px solid rgba(88,101,242,0.3)', color: '#8ea1ff' }}
        >
          <MessageCircle className="w-3.5 h-3.5" /> Open Discord
        </a>
      </div>
      <button
        onClick={() => setExpanded(v => !v)}
        className="w-full flex items-center gap-1 px-4 pb-2.5 text-xs text-red-400/70 hover:text-red-400 transition-colors"
      >
        {expanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
        {expanded ? 'Hide error details' : 'Show error details'}
      </button>
      {expanded && (
        <div className="mx-4 mb-3 rounded-lg overflow-hidden" style={{ background: 'rgba(0,0,0,0.2)' }}>
          <div className="flex items-center justify-between px-3 py-1.5 border-b border-white/5">
            <span className="text-[10px] uppercase tracking-widest text-gray-500">For the report</span>
            <button onClick={copy} className="flex items-center gap-1 text-[11px] text-gray-500 hover:text-gray-300 transition-colors">
              {copied ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
              {copied ? 'Copied' : 'Copy'}
            </button>
          </div>
          <pre className="px-3 py-2 text-[11px] text-red-300/80 whitespace-pre-wrap break-words select-text max-h-40 overflow-auto">
            {message}
          </pre>
        </div>
      )}
    </div>
  );
}
