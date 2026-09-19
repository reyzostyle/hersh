// The blog: the pages written to be cited.
//
// This was /guides. It is /blog now, one section rather than two, because two
// writing sections about the same subject compete with each other in search and
// split the internal links between them. The old URLs 301 to the new ones in
// vercel.json, and the footer link on the landing page moved with them.
//
// An answer engine quotes a page that answers one question completely and
// specifically. It does not quote a product pitch, which is why none of these
// are one: they are about the thing the product is about, and they name it once
// at the end where it is honest to.
//
// Every claim here has to be checkable or clearly an opinion. Nothing on these
// pages invents a statistic - a made-up percentage is exactly what gets a page
// quoted once and distrusted afterwards, and this site has no study behind it
// to cite. Where a number would be the natural thing to write, the page says
// where to go and read the real one instead.
//
// One source for the page, the <head>, the structured data, the RSS feed and
// the llms.txt listing, so the answer an engine quotes and the answer a person
// reads cannot disagree. Same reasoning as FAQS in lib/faq.ts.
//
// To publish: add an entry here, write its social drafts in lib/social.ts, and
// deploy. The index, the sitemap, the feed and llms.txt all follow from this
// array and are never hand-kept.

import type { MotifName } from '../components/BlogCover';

export interface PostSection {
  h: string;
  p: string[];
}

export interface Post {
  slug: string;
  /** The <title>. Written as the question someone types. */
  title: string;
  h1: string;
  description: string;
  /** ISO date. Fixed at publication and never edited - it is what the feed sorts on. */
  published: string;
  /** ISO date. Bumped whenever the text changes materially. */
  updated: string;
  /**
   * What kind of question this answers. Labels, not a taxonomy: they are read
   * by people scanning the index, there are no tag pages and no archives, and
   * the first one is the kicker above the headline. Two or three is plenty.
   */
  tags: string[];
  /**
   * A real cover image, as a path under public/. Left out on purpose while
   * there is no photography: BlogCover draws one from the slug instead, so a
   * new post never ships with a hole where a picture should be.
   */
  cover?: string;
  /**
   * Which drawn cover this post gets, when the one the slug picks is not the
   * one the post is about. Ignored when `cover` is set.
   */
  art?: MotifName;
  /** The one-paragraph answer, up front. An engine that quotes one block quotes this one. */
  summary: string;
  sections: PostSection[];
  faq: { q: string; a: string }[];
}

export const POSTS: Post[] = [
  {
    slug: 'youtube-shorts-view-jail',
    title: 'View jail on YouTube Shorts: what each view ceiling means',
    h1: 'What view jail on Shorts actually tells you',
    description:
      'Shorts that keep stopping at the same view count. What the ceiling narrows the problem down to, and which of the usual explanations for it nobody can actually check.',
    published: '2026-09-20',
    updated: '2026-09-20',
    tags: ['Distribution', 'Retention'],
    art: 'feed',
    summary:
      'View jail is the name creators gave to a real and very common pattern: a channel\'s Shorts keep stopping near the same view count, upload after upload. It is not a penalty, it is not something YouTube has ever named, and nobody outside YouTube knows the mechanism behind it. What makes it worth paying attention to is narrower and more useful than a mechanism: the number you keep stopping at tells you which of three unrelated problems you have. Videos that never leave zero are almost always an account problem rather than a video problem. Videos that die a few thousand in were shown to people who then left. Videos that cap out while holding everyone who watched were shown, worked, and still gave the system no reason to widen the audience. Those are fixed in three different places, and the ceiling is the cheapest way to tell them apart.',
    sections: [
      {
        h: 'It is an observation, not a mechanism',
        p: [
          'The pattern is real, and anyone who has posted Shorts for a few months recognises it. Uploads cluster around a number. Not one video stalling, which is noise, but every video landing in the same neighbourhood no matter what is in it.',
          'What is not known is why. YouTube has never documented tiers, thresholds, or anything called view jail. The name is creator shorthand for something creators can see in their own analytics, which is a perfectly good reason for the name to exist and not a reason to treat it as a described feature.',
          'The distinction matters because of what gets attached to the mechanism version. Pausing uploads for a set number of hours to let the system reset, deleting the videos that did badly, changing the time of day you post: all of these are guesses about internals nobody can see, passed around as procedures. The pattern is worth acting on. The folk explanations for it are not, and following one costs you the weeks you spend waiting instead of changing something.',
          'The useful version is smaller. The ceiling is a symptom that narrows the search, the way a temperature narrows the search without naming the illness.',
        ],
      },
      {
        h: 'Stuck near zero is almost never the video',
        p: [
          'The symptom: a Short gets a handful of impressions or freezes under a couple of dozen views, and it happens to everything you post rather than to one upload.',
          'When it happens to everything, the common factor is the account and the way it uploads, not the edit. The behaviours that sit behind it are the ones that look automated from the outside: several uploads a day appearing suddenly on a channel that posted weekly, re-uploads of clips with nothing done to them, scripts copied word for word off a video that worked, bulk voiceover over stock footage. None of these are judged as quality. They are matched as patterns, and the pattern they match is a bot.',
          'What changes it is stopping the thing that looks automated - fewer uploads, with a human decision visible in each one. Not a wait of a specific length, because there is no published timer to wait out.',
          'There is a way to tell this apart from a video that simply failed, and it takes ten seconds. A failed video gets impressions and loses people. This gets almost no impressions. Open the video in Studio and read the impressions figure before you touch the edit.',
        ],
      },
      {
        h: 'A few thousand and dead means it was watched and left',
        p: [
          'Here the video was shown to people. They saw it and went. This is the one ceiling where you have direct evidence about why, rather than an inference from a view count.',
          'Open the retention curve. A near-vertical drop at the very start is an opening problem. A step partway through is a specific moment, and you can go and watch the two seconds it points at. An even decline with no steps is normal, and the video is simply longer than it had material for. [How to read a Shorts retention curve](/blog/reading-a-shorts-retention-curve) covers the shapes, and [why Shorts get swiped in the first two seconds](/blog/why-shorts-get-swiped) covers the most common one.',
          'One caution that matters more here than anywhere else: a curve built on a few hundred views is noise with a line drawn through it. If the video barely went out, the curve is not evidence of anything yet.',
        ],
      },
      {
        h: 'A ceiling with good retention is a different problem entirely',
        p: [
          'The symptom: retention is fine, people finish it, the numbers inside the video are the ones you wanted, and it still stops.',
          'At this point the video works for people who already watch this kind of thing. What it does not do is give the system any reason to try it on people who do not. It looks like the videos it is sitting next to, so the audience it can be tested on is the audience it already has.',
          'What creators do about it is take a format that works somewhere else entirely - a speedrun breakdown, a true-crime style reconstruction, a review structure - and run their own subject through it. The point is not novelty for its own sake. It is that the video becomes recognisable to someone who has never watched your niche, while still being about the thing you make.',
          'This is the weakest of the three sections, and it is worth saying so. "Be more distinctive" is a description of the goal, not an instruction for reaching it, and the tier where retention is already good is the one where nobody can hand you a checklist.',
        ],
      },
      {
        h: 'What the ceiling cannot tell you',
        p: [
          'The exact number. It moves with the size of the channel, the niche, and how long the channel has been posting. Someone else\'s thirty thousand is not your thirty thousand, and the only comparison that means anything is your own uploads against each other.',
          'Whether you are being penalised. There is no visible penalty to read, and a low ceiling is not evidence of one. Treating it as evidence sends you looking for a punishment to appeal instead of a problem to fix.',
          'Anything at all, on a channel with a handful of uploads. Three videos landing near the same number is three videos, not a pattern.',
        ],
      },
    ],
    faq: [
      {
        q: 'Is view jail something YouTube actually does?',
        a: 'No. It is creator shorthand for a pattern visible in analytics - Shorts from the same channel repeatedly stopping near the same view count. The pattern is real and worth reading. The name is not a YouTube feature, and YouTube has never described tiers or thresholds by it or any other name.',
      },
      {
        q: 'Does pausing uploads for a few days get you out of it?',
        a: 'There is no evidence for it, and no published mechanism it could work through. What changes outcomes is changing the thing that caused the problem - the upload behaviour, the opening, or the format - rather than waiting a particular number of hours before doing the same thing again.',
      },
      {
        q: 'Why do my Shorts always stop at roughly the same number?',
        a: 'Because whatever is limiting them is the same each time. That is the useful part: a consistent ceiling points at something consistent about the channel or the videos, which is far easier to find than a one-off failure.',
      },
      {
        q: 'Should I delete Shorts that did badly?',
        a: 'There is no reason to think it helps, and it costs you the record of what happened. A video that underperformed is the only data you have about what that audience did not want.',
      },
      {
        q: 'How many views does a Short need before the numbers mean anything?',
        a: 'Enough that the retention curve is not being drawn through a handful of people. There is no official figure, but a video with a few hundred views has not been tested, and reading its curve as a verdict on the edit will send you rewriting something that was never measured.',
      },
    ],
  },

  {
    slug: 'why-shorts-get-swiped',
    title: 'Why YouTube Shorts get swiped in the first two seconds',
    h1: 'Why Shorts get swiped in the first two seconds',
    description:
      'A Short is judged in a feed, not after a click. The reasons viewers swipe in the first two seconds, and what to change in the edit.',
    published: '2026-09-12',
    updated: '2026-09-12',
    tags: ['Hooks', 'Retention', 'Editing'],
    art: 'timeline',
    summary:
      'A Short loses viewers in the first two seconds because the feed gives it no click to trade on. On long-form, the viewer chose the video from a thumbnail and a title before it started playing, so the opening gets a few seconds of patience it did not have to earn. In a Short feed there is no choosing. The video is already playing, the only two options are keep watching or swipe, and the opening frame is doing the entire job the thumbnail used to do. Most Shorts that lose people early are not badly made. They open with a wind-up, a logo, a greeting, or a restatement of what the caption already said, and every one of those spends the two seconds that decide the video.',
    sections: [
      {
        h: 'The feed is not a click',
        p: [
          'On a normal YouTube video the viewer has already committed. They read a title, looked at a thumbnail, decided this was worth their time, and clicked. That decision buys the opening several seconds of goodwill.',
          'A Short arrives with none of that. It starts playing on its own, in a stack of other videos, and the viewer is holding a thumb over the screen. Nothing has been chosen. The question is not "is this worth continuing" but "is this better than whatever is one swipe away", and that question is answered before most creators have finished their first sentence.',
          'This is why advice written for long-form openings transfers badly. "Set up the premise" is good advice when someone has already decided to watch. It is a way to lose a Shorts viewer.',
        ],
      },
      {
        h: 'The four things that spend the first two seconds',
        p: [
          'A wind-up. Anything before the subject appears: a logo sting, "hey guys", a slow zoom onto an empty frame, a beat of silence while the music starts. None of it is information, and all of it costs the same two seconds as information would.',
          'A repeat. The caption or the on-screen text has already told the viewer what this is, and then the first line of narration tells them again. The viewer has now been given the same fact twice and no reason to stay for a third.',
          'A frame that looks like the last one. Shorts are watched in a run. An opening frame that is visually generic - a person centred in a plain room, a gameplay clip with no distinguishing detail - reads as the video they just swiped away from, and gets treated the same way.',
          'A delayed subject. The thing the video is actually about arrives at four seconds. Whatever is on screen before it is a trailer for the video the viewer is already leaving.',
        ],
      },
      {
        h: 'What to change in the edit',
        p: [
          'Find the most specific frame in the video and put it first. Specific means it could not be the opening of anyone else\'s Short: a strange object, a number, a face mid-reaction, the moment something breaks. The video can then explain itself backwards.',
          'Cut until the first sentence carries a fact or a question. If the first line could open any video in your niche, it is not an opening, it is a throat-clear.',
          'Say a different thing than the on-screen text says. The two should work together, not repeat: text states the situation, narration starts the argument.',
          'Check the first frame as a still. Pause the export on frame one and look at it alone. If it does not make you ask a question, the video is starting one edit too early.',
        ],
      },
      {
        h: 'How to tell whether this is actually your problem',
        p: [
          'Do not guess at it. YouTube Studio shows a Short\'s audience retention curve, and a first-seconds problem has an unmistakable shape: a near-vertical drop at the very start, before the curve settles into its normal decline.',
          'That number is not available through any public API, and no third-party tool has access to it. Anything quoting your early swipe-away rate without you connecting your own channel is estimating it from public view counts. Read it yourself in Studio, under the video, in the engagement tab.',
          'If the curve is flat at the start and drops later, the opening is fine and the problem is somewhere in the middle. Fixing the hook will not help that video.',
        ],
      },
    ],
    faq: [
      {
        q: 'How long is the hook of a YouTube Short?',
        a: 'In practice the decision is made in the first one to two seconds, which is roughly the first sentence or the first two cuts. There is no official window; it is just how long a viewer takes to decide whether to move their thumb.',
      },
      {
        q: 'Should a Short open with the conclusion?',
        a: 'Often yes. Opening on the result and explaining how you got there gives the viewer a reason to stay that a chronological opening does not. The exception is when the result only means something after a setup, in which case the setup has to be one line, not five seconds.',
      },
      {
        q: 'Does the caption or title matter for Shorts?',
        a: 'Far less than for long-form. In a feed the video is already playing before anyone reads the caption, so the opening frame and the first line do the work a title and thumbnail do elsewhere. Keyword work that pays off on long-form has very little to do with whether a Short holds people.',
      },
      {
        q: 'Where do I see how many people swiped away?',
        a: 'YouTube Studio, on the individual video, in the engagement or audience-retention view. It is not exposed by the public YouTube API, so a tool can only show it to you if you have connected your own channel to it.',
      },
    ],
  },

  {
    slug: 'reading-a-shorts-retention-curve',
    title: 'How to read a YouTube Shorts retention curve',
    h1: 'How to read a Shorts retention curve',
    description:
      'What the shapes in a Shorts audience-retention graph mean, why it can go above 100 percent, and which conclusions the curve does not support.',
    published: '2026-09-12',
    updated: '2026-09-12',
    tags: ['Retention', 'Analytics'],
    art: 'curve',
    summary:
      'A Shorts retention curve shows what share of viewers are still watching at each moment of the video. It is the only honest record of where a Short loses people, and it is read by shape rather than by any single number. A vertical drop at the start is an opening problem. A steady slope is normal. A bump upward means a moment is being rewatched, because Shorts loop and the loop counts. The most common mistake is reading the average percentage instead of the shape: two videos with the same average can have completely different problems, and only one of them is fixable in the edit.',
    sections: [
      {
        h: 'What the curve actually measures',
        p: [
          'The horizontal axis is position in the video, not clock time for any one viewer. The vertical axis is the share of views still playing at that position.',
          'It is a record of a crowd, not of a person. A dip at 0:07 does not mean one viewer left at 0:07; it means a noticeable share of everyone who started the video stopped around there. That is what makes it worth acting on: a single viewer leaving is noise, a step in the curve is a repeatable reaction to something you can go and look at.',
        ],
      },
      {
        h: 'The shapes and what each one means',
        p: [
          'A cliff in the first second or two. The opening is the problem. The video has not done anything wrong yet in the sense of craft, it has simply not given a reason to stay. This is the most common shape and the most fixable one.',
          'A steady, gentle decline. Normal, and not a defect. Every video loses people gradually. If the curve declines evenly with no steps, the video is working and the way to improve it is to make it shorter, not to patch a moment.',
          'A step partway through. Something specific happened there. Go and watch those two seconds. Usually it is a shot held too long, a second idea starting before the first has paid off, or the video visibly changing subject.',
          'A rise, or a section above the starting level. People are rewatching. Shorts loop by default, so a moment people scrub back to or watch twice shows up as retention going up. This is a good sign and worth understanding, because whatever is there is the part of the video that worked.',
          'A flat line that ends abruptly. The video held everyone and then stopped. If that ending is the payoff, the video is doing its job.',
        ],
      },
      {
        h: 'Why it can go over 100 percent',
        p: [
          'On Shorts this is normal and not a glitch. The format loops, and replays of a section count as views of that section, so a heavily rewatched moment can exceed the number of unique viewers who started the video.',
          'Treat anything above the line as a marker rather than a score. It tells you which two seconds people wanted again. That is more useful for the next video than the average percentage is.',
        ],
      },
      {
        h: 'What the curve cannot tell you',
        p: [
          'Why. The curve shows where, never the reason. The reason is in the footage at that timestamp, and reading one off the other without watching is guessing.',
          'Whether the video was good. A short video with a high average and forty views has not been tested. Retention is a measure of how a video holds the people who saw it, not of whether it reached anyone.',
          'Anything about the algorithm. Retention shape is not a shadowban signal, a penalty, or a ranking. A video with a bad curve and few views has one visible problem and one unknown, and treating the first as the cause of the second is the fastest way to fix the wrong thing.',
          'Anything at all, on a video with very few views. A curve built from a handful of views is noise with a line drawn through it.',
        ],
      },
      {
        h: 'Where to find it',
        p: [
          'YouTube Studio, open the individual Short, then the analytics for that video and its engagement or audience-retention section. The curve is per video; there is no channel-level version of it that means anything.',
          'It is not available through the public YouTube Data API. Any tool that shows you a retention curve is either reading it from your own connected account through the Analytics API, with your permission, or estimating something else and calling it retention.',
        ],
      },
    ],
    faq: [
      {
        q: 'What is a good retention percentage for a YouTube Short?',
        a: 'There is no single number worth chasing, because it depends heavily on length: a 15 second Short and a 55 second one are not comparable. The useful comparison is against your own previous videos of similar length, and the useful reading is the shape rather than the average.',
      },
      {
        q: 'Why is my Shorts retention above 100 percent?',
        a: 'Because Shorts loop, and replays of a section count toward that section. A moment people watch twice can exceed the number of people who started the video. It is a sign that part of the video worked.',
      },
      {
        q: 'Can I see the retention curve for someone else\'s Short?',
        a: 'No. Audience retention is private analytics, available only to the channel that owns the video. Any figure presented as a competitor\'s retention is an estimate built from public data, not the real curve.',
      },
      {
        q: 'Does a drop in the curve mean the algorithm stopped promoting the video?',
        a: 'No. The retention curve describes how the people who watched behaved inside the video. It says nothing about distribution, and reading it as a ranking signal leads to fixing things that were never broken.',
      },
    ],
  },

  {
    slug: 'what-makes-a-shorts-hook-work',
    title: 'What makes a YouTube Shorts hook work',
    h1: 'What makes a Shorts hook work',
    description:
      'The difference between a hook and a first sentence, the test a hook has to pass, and the openings that reliably fail.',
    published: '2026-09-12',
    updated: '2026-09-12',
    tags: ['Hooks', 'Writing'],
    art: 'grid',
    summary:
      'A hook is the opening line of a video written at an audience rather than to them, and its only job is to open a question the rest of the video closes. That is the whole test: after the first line, does the viewer want to know something they do not know yet. Most openings that fail are not badly written, they are simply statements. A statement is complete on its own, and a viewer who has already received a complete thought has no reason left to stay for the next one.',
    sections: [
      {
        h: 'A hook is not a topic sentence',
        p: [
          '"Today I am going to show you three editing tricks" is a topic sentence. It is accurate, it is clear, and it closes rather than opens: the viewer now knows what the video contains and can decide they do not need it.',
          '"The third one broke my edit for two hours" opens the same video with a question attached. It is the same information, arranged so that the interesting part is withheld.',
          'The distinction is not cleverness or energy. It is whether the sentence leaves something unresolved.',
        ],
      },
      {
        h: 'The test',
        p: [
          'Read the first line alone, with no video under it, and ask what question it makes you want answered. If there is no question, it is not a hook yet.',
          'Then ask whether the video actually answers that question, and answers it soon. A hook that opens a question the video never closes converts one problem into a worse one: people stay a little longer and leave annoyed, and annoyance is the one reaction that costs you the next video too.',
        ],
      },
      {
        h: 'Openings that reliably fail',
        p: [
          'The greeting. "Hey guys, welcome back" is addressed to people who already subscribed, in a feed full of people who have not.',
          'The credential. "As someone who has been editing for six years" asks the viewer to care who is talking before they have been given a reason to care what is said.',
          'The disclaimer. "This might not work for everyone, but" lowers the stakes of the thing you are about to say, in the two seconds where the stakes are all you have.',
          'The restatement. The on-screen text says it, then the narration says it again. Pick one to say it and give the other something else to do.',
          'The question with an obvious answer. "Do you want more views?" is a question in grammar only. Nobody wants to know the answer, because everybody already has it.',
        ],
      },
      {
        h: 'Why hook advice is mostly written for the wrong format',
        p: [
          'Most published hook advice was written for videos someone clicked on. There, the hook is confirming a decision the viewer already made, so it can afford to be a summary of what is coming.',
          'In a feed the hook is making the decision, not confirming it. That is why the templates transfer so badly, and why an opening that would be perfectly good on a ten-minute video reads as a stall on a thirty-second one.',
          'It is also why the hook cannot be written last, as a lid put on a finished video. The line that would hold a stranger usually comes from the middle of the footage, which means finding it is an editing decision rather than a writing one.',
        ],
      },
    ],
    faq: [
      {
        q: 'How many words should a Shorts hook be?',
        a: 'Short enough to finish inside the first two seconds, which is usually somewhere under ten words. The length matters less than whether the line finishes before the viewer decides.',
      },
      {
        q: 'Do hook formulas work?',
        a: 'They work as a starting point and fail as a finish. A template like "nobody talks about this" opens a question the first time a viewer sees it and reads as noise the tenth. What survives is the specific detail you put inside the template, not the template.',
      },
      {
        q: 'Should the hook be on screen as text, spoken, or both?',
        a: 'Either, but they should not say the same thing. Text and narration repeating each other spends two channels on one piece of information, in the moment when you have the least room to waste.',
      },
      {
        q: 'What is the difference between a hook and a script?',
        a: 'A hook is the opening: it sets something up and stops. A script is the whole video, including the payoff. A useful way to tell them apart is whether the text contains the thing it promises; if it delivers as well as promises, it is a script.',
      },
    ],
  },
];

export const postBySlug = (slug: string) => POSTS.find(p => p.slug === slug) ?? null;

// Newest first. Everything that lists posts - the index page, the feed, the
// sitemap, llms.txt - reads this rather than POSTS, so the order is decided
// once and the array above can stay in whatever order is convenient to edit.
// Sort is stable, so posts sharing a date keep their order here.
export const postsByDate = (): Post[] =>
  [...POSTS].sort((a, b) => (a.published < b.published ? 1 : a.published > b.published ? -1 : 0));

/**
 * Roughly how long the post takes to read, in minutes, from its own words.
 * 220 words a minute is the usual figure for reading prose on a screen. It is
 * an estimate and it is labelled as one on the page - the point is to tell
 * someone scanning the index whether this is two minutes or ten.
 */
export const readingMinutes = (post: Post): number => {
  const text = [
    post.summary,
    ...post.sections.flatMap(s => [s.h, ...s.p]),
    ...post.faq.flatMap(f => [f.q, f.a]),
  ].join(' ');
  return Math.max(1, Math.round(text.split(/\s+/).filter(Boolean).length / 220));
};

/** "12 September 2026". The one date format used on the page and in the index. */
export const formatDate = (iso: string): string =>
  new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });
