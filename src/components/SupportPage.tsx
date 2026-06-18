import { MessageCircle, ExternalLink, HeadphonesIcon } from 'lucide-react';

export function SupportPage() {
  return (
    <div className="max-w-2xl mx-auto px-4 sm:px-6 pt-4 sm:pt-6 pb-12 animate-fade-in-up">
        <div className="hidden sm:block mb-6">
          <h1 className="text-2xl font-bold text-white mb-1">Support</h1>
          <p className="text-sm text-gray-500">Get help, share feedback, or connect with other creators</p>
        </div>
      <div className="rounded-xl p-6 flex items-start gap-4" style={{ background: 'rgba(22,27,38,0.6)', border: '1px solid rgba(255,255,255,0.1)', backdropFilter: 'blur(16px) saturate(160%)', WebkitBackdropFilter: 'blur(16px) saturate(160%)', boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.06)', backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)' }}>
        <div className="w-12 h-12 rounded-xl bg-[#5865F2]/15 flex items-center justify-center flex-shrink-0">
          <MessageCircle className="w-6 h-6 text-[#5865F2]" />
        </div>
        <div className="flex-1 min-w-0">
          <h2 className="text-white font-semibold mb-1">Discord Community</h2>
          <p className="text-gray-500 text-sm mb-4">
            Join our Discord to get support, report bugs, suggest features, and connect with other creators using Hershy.
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
  );
}
