import { MessageCircle, ExternalLink } from 'lucide-react';

export function SupportPage() {
  return (
    <div className="px-6 py-8 max-w-2xl">
      <h1 className="text-2xl font-bold text-white mb-1">Support</h1>
      <p className="text-gray-500 mb-8">Get help, share feedback, or connect with other creators.</p>

      <div className="bg-[#1A1A1A] rounded-xl border border-gray-800 p-6 flex items-start gap-4">
        <div className="w-12 h-12 rounded-xl bg-[#5865F2]/15 flex items-center justify-center flex-shrink-0">
          <MessageCircle className="w-6 h-6 text-[#5865F2]" />
        </div>
        <div className="flex-1 min-w-0">
          <h2 className="text-white font-semibold mb-1">Discord Community</h2>
          <p className="text-gray-500 text-sm mb-4">
            Join our Discord to get support, report bugs, suggest features, and connect with other creators using Hersh.
          </p>
          <a
            href="https://discord.gg/placeholder"
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
