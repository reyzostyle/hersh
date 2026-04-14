import { MessageCircle, ExternalLink } from 'lucide-react';

export function SupportPage() {
  return (
    <div className="h-full flex flex-col overflow-auto">
      <div className="px-6 py-5 flex-shrink-0" style={{ borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
        <h1 className="text-2xl font-bold text-white mb-1">Support</h1>
        <p className="text-sm text-gray-500">Get help, share feedback, or connect with other creators.</p>
      </div>
      <div className="px-6 py-6 max-w-2xl">
      <div className="rounded-xl p-6 flex items-start gap-4" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)' }}>
        <div className="w-12 h-12 rounded-xl bg-[#5865F2]/15 flex items-center justify-center flex-shrink-0">
          <MessageCircle className="w-6 h-6 text-[#5865F2]" />
        </div>
        <div className="flex-1 min-w-0">
          <h2 className="text-white font-semibold mb-1">Discord Community</h2>
          <p className="text-gray-500 text-sm mb-4">
            Join our Discord to get support, report bugs, suggest features, and connect with other creators using Hersh.
          </p>
          <a
            href="https://discord.gg/N8S6C95Ry2"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 px-5 py-2.5 bg-[#5865F2] text-white rounded-lg text-sm font-semibold hover:bg-[#5865F2]/90 transition-colors"
          >
            <MessageCircle className="w-4 h-4" />
            Join Discord
            <ExternalLink className="w-3.5 h-3.5 opacity-70" />
          </a>
        </div>
      </div>
      </div>
    </div>
  );
}
