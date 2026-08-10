import { useState } from 'react';
import { getSessionToken, fetchWithRetry } from '../lib/supabase';
import { showToast } from '../lib/toast';
import { Check, Loader2 } from 'lucide-react';

function NotionGlyph({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
      <path d="M4.6 3.2l13.9-1c1.7-.15 2.14-.05 3.2.72l3.06 2.16c.72.53.96.67.96 1.25v15.4c0 1.06-.38 1.69-1.73 1.78l-16.1 1c-1.02.05-1.5-.1-2.03-.77L1.3 18.5c-.58-.77-.82-1.35-.82-2.02V5.06c0-.87.38-1.59 1.55-1.69z" opacity=".2"/>
      <path d="M7.6 7.1v9.5c0 .5.25.68.82.65l1.3-.07v-6.9l4.9 7.07c.43.05.6.02.96 0l1.5-.1V8.0l-1.43.08v6.5l-5-7.5-2.05.1c-.5.02-.85.2-1 .82z"/>
    </svg>
  );
}

interface Props {
  /** Hook | Script | Outline — goes in the first (title) column. */
  type: 'Hook' | 'Script' | 'Outline';
  /** Short preview so you can tell which one it is — second column. */
  name: string;
  /** The full hook / script / outline — third column + page body. */
  content: string;
  /** Only render for paid users. Defaults to true (caller already gated). */
  eligible?: boolean;
  className?: string;
}

export function SaveToNotionButton({ type, name, content, eligible = true, className = '' }: Props) {
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  if (!eligible) return null;

  const save = async () => {
    if (saving || saved) return;
    setSaving(true);
    try {
      const token = await getSessionToken();
      if (!token) { showToast('Please sign in again.', 'error'); return; }
      const res = await fetchWithRetry('https://ezlousklksipvwuinpzq.supabase.co/functions/v1/notion-save', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ type, name, content }),
        signal: AbortSignal.timeout(20000),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (data.error === 'not_connected') showToast('Connect Notion in Settings first', 'error');
        else if (data.error === 'no_page') showToast('Give the Hershy integration access to a Notion page, then retry', 'error');
        else if (data.error === 'upgrade_required') showToast('Saving to Notion is a paid feature', 'error');
        else showToast('Failed to save to Notion', 'error');
        return;
      }
      setSaved(true);
      showToast('Saved to Notion ✓');
      setTimeout(() => setSaved(false), 3000);
    } catch {
      showToast('Failed to save to Notion', 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <button
      onClick={save}
      disabled={saving}
      className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg transition-colors disabled:opacity-50 ${className}`}
      style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', color: '#fff' }}
      title="Save to Notion"
    >
      {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : saved ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <NotionGlyph className="w-3.5 h-3.5" />}
      {saved ? 'Saved' : 'Save to Notion'}
    </button>
  );
}
