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
// Kept short on purpose: questions of about the same length, answers of one or
// two sentences, the first of which is the whole answer.
export const FAQS: { q: string; a: string }[] = [
  {
    q: 'What does Chumoku do?',
    a: 'It runs your Shorts workflow. It finds ideas that already worked, writes the script and tells you what to fix, using your channel\'s real numbers.',
  },
  {
    q: 'Is it free to try?',
    a: 'Yes, 20 credits when you sign up, no card. A message costs 1 credit and a video review costs 5.',
  },
  {
    q: 'Do I need to connect YouTube?',
    a: 'No, but it gets sharper. Connected, it reads your real retention and names the second people left.',
  },
  {
    q: 'Does it work for TikTok or Reels?',
    a: 'No, YouTube Shorts only. That focus is what keeps the advice specific.',
  },
  {
    q: 'What does the extension do?',
    a: 'It puts Analyze and Steal on every Short on YouTube. Steal turns any Short into an outline for your channel.',
  },
  {
    q: 'How does it find ideas?',
    a: 'It shows only Shorts that beat their own channel\'s usual views. Finding them is free; reading one costs a credit.',
  },
  {
    q: 'What is Chumoku brain?',
    a: 'A profile of your channel it writes from your uploads, in one click. Every idea and script after that is written for you.',
  },
  {
    q: 'Can I cancel anytime?',
    a: 'Yes, from the billing portal. You keep access until the period you paid for ends.',
  },
];
