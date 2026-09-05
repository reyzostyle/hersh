// The FAQ, in one place.
//
// It is rendered twice: as the section a person opens on the landing page, and
// as FAQPage JSON-LD in the head, which is what an answer engine quotes. Those
// were two hand-maintained copies with a comment asking whoever edits one to
// remember the other. The build generates the second from this now.
//
// Written for extraction, not for reading top to bottom. An engine lifts the
// FIRST sentence, so each answer opens with a complete answer to the question
// and everything after it is support. And written plainly: most of the people
// asking do not have English as a first language.
export const FAQS: { q: string; a: string }[] = [
  {
    q: 'What does Chumoku do?',
    a: 'It watches your Short and tells you what to fix. Paste a link, a hook or a script, and you get a score, the exact seconds to change, and a conversation you can keep asking questions in. YouTube Shorts only.',
  },
  {
    q: 'Is it free?',
    a: 'Yes. You get 20 credits when you sign up, with no card. That is about four video reviews, or a lot more if you are checking hooks and scripts. The free credits are one time and do not refill.',
  },
  {
    q: 'Do I have to connect my YouTube channel?',
    a: 'No, everything works without it. If you do connect it, Chumoku reads your real retention curve and names the seconds people actually left on, instead of guessing at them. It takes two clicks.',
  },
  {
    q: 'Does it work for TikTok or Instagram Reels?',
    a: 'No. YouTube Shorts only, on purpose. That is what lets it point at the second people swiped instead of handing you general advice.',
  },
  {
    q: 'How does it find competitor ideas?',
    a: "It shows you only the videos that beat the channel they came from. You pick the channels; a small channel's breakout gets in, a big channel's routine upload does not. Finding them is free, and a credit is spent only on the one you open.",
  },
  {
    q: 'Can I cancel anytime?',
    a: 'Yes, from the billing portal, and you keep everything until the period you already paid for ends. No contract and no call.',
  },
];
