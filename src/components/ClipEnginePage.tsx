import { Eye, Clock, ShieldCheck, Check, MessageCircle } from 'lucide-react';
import { isClipOfferActive, CLIP_FULL_PRICE, CLIP_OFFER_PRICE } from '../lib/launchOffer';

const DISCORD_URL = 'https://discord.com/invite/N8S6C95Ry2';

const reasons = [
  {
    icon: <Eye className="w-5 h-5" />,
    title: 'Never misses a moment',
    body: 'It watches every hour you stream, including the ones a tired human would skip at 4am.',
  },
  {
    icon: <Clock className="w-5 h-5" />,
    title: 'Always on time',
    body: 'Clips are ready right after your stream, not whenever someone finally gets around to it.',
  },
  {
    icon: <ShieldCheck className="w-5 h-5" />,
    title: 'Nothing to manage',
    body: 'No hiring, no chasing, no starting over when your clipper loses interest and disappears.',
  },
];

const steps = [
  {
    title: 'Claim your pack',
    body: 'Grab your first pack of hours and message us on Discord.',
  },
  {
    title: 'We set it up with you',
    body: 'We build a config around your stream: your game, your language, the kind of moments you want caught. This part we do by hand, once.',
  },
  {
    title: 'Clips land in your Drive',
    body: 'After every stream, new clips show up in your own Google Drive folder, ready for you to pick, title, and post.',
  },
];

export function ClipEnginePage() {
  const offerActive = isClipOfferActive();
  const included = [
    '10 hours of stream coverage',
    offerActive
      ? 'One time setup and custom config, normally $10'
      : 'One time setup and custom config',
    'Your own Google Drive folder',
    'Fresh clips after every stream',
  ];

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 pt-6 sm:pt-10 pb-12 animate-fade-in-up">
      {/* Hero */}
      <div className="mb-9 sm:mb-12">
        <h1 className="text-2xl sm:text-4xl font-bold text-white mb-3 tracking-tight leading-tight text-pretty">
          Your streams, clipped and ready to post.
        </h1>
        <p className="text-sm sm:text-base text-gray-400 leading-relaxed max-w-2xl text-pretty">
          Streaming for eight hours and posting none of it is wasted work. Clip Engine watches every
          hour you stream and cuts the good moments into short clips, so the only thing left on your
          plate is picking the ones you like.
        </p>
      </div>

      {/* Why */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5 mb-10 sm:mb-14">
        {reasons.map((r, i) => (
          <div
            key={r.title}
            className="p-5 rounded-xl glass-panel animate-fade-in-up"
            style={{ animationDelay: `${i * 70}ms` }}
          >
            <span className="text-[#0EA4E9] inline-block mb-3">{r.icon}</span>
            <p className="text-white font-semibold mb-1.5">{r.title}</p>
            <p className="text-sm text-gray-400 leading-relaxed text-pretty">{r.body}</p>
          </div>
        ))}
      </div>

      {/* How it works */}
      <div className="mb-10 sm:mb-14">
        <h2 className="text-lg font-bold text-white mb-5">How it works</h2>
        <div className="space-y-4">
          {steps.map((s, i) => (
            <div key={s.title} className="flex gap-4">
              <span
                className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 mt-0.5"
                style={{ background: 'rgba(14,164,233,0.12)', color: '#0EA4E9' }}
              >
                {i + 1}
              </span>
              <div className="min-w-0">
                <p className="text-white font-semibold mb-1">{s.title}</p>
                <p className="text-sm text-gray-400 leading-relaxed text-pretty">{s.body}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Pricing */}
      <div className="rounded-xl p-6 sm:p-7 glass-panel-accent motion-card">
        <div className="flex items-start justify-between gap-3 mb-5">
          <div className="min-w-0">
            <p className="text-white font-semibold mb-1">Starter pack</p>
            <p className="text-sm text-gray-400">Everything you need to start.</p>
          </div>
          {offerActive && (
            <span className="text-[11px] font-semibold px-2.5 py-1 rounded-full flex-shrink-0 bg-amber-400/15 text-amber-400">
              Launch week
            </span>
          )}
        </div>

        <div className="flex items-baseline gap-2.5 mb-6 select-none">
          <span className="text-4xl font-bold text-white">
            {offerActive ? CLIP_OFFER_PRICE : CLIP_FULL_PRICE}
          </span>
          {offerActive && (
            <span className="text-lg text-gray-600 line-through">{CLIP_FULL_PRICE}</span>
          )}
        </div>

        <ul className="space-y-2.5 mb-7">
          {included.map(item => (
            <li key={item} className="flex items-start gap-2.5 text-sm text-gray-300">
              <Check className="w-4 h-4 text-[#0EA4E9] flex-shrink-0 mt-0.5" />
              {item}
            </li>
          ))}
        </ul>

        <a
          href={DISCORD_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="w-full flex items-center justify-center gap-2 py-3 rounded-lg text-sm font-semibold bg-[#0EA4E9] text-white hover:bg-[#0EA4E9]/90 transition-colors"
        >
          <MessageCircle className="w-4 h-4" />
          {offerActive ? 'Claim launch price on Discord' : 'Get started on Discord'}
        </a>

        <p className="mt-4 text-xs text-gray-500 text-center leading-relaxed">
          Once your pack runs out, extra hours are $2 each.
        </p>
      </div>

      <p className="mt-5 text-sm text-gray-500 leading-relaxed text-pretty">
        A human clipper watching a 50 hour month costs around $100. Clip Engine covers the same month
        for the same money, and it never oversleeps, never goes quiet for a week, and never leaves
        your best moment on the timeline.
      </p>

      <p className="mt-4 text-xs text-gray-600 leading-relaxed text-pretty">
        Clip Engine is billed separately and is not part of your Hershy subscription. Setup happens
        with us on Discord, so nothing is charged before we agree on the config for your stream.
      </p>
    </div>
  );
}
