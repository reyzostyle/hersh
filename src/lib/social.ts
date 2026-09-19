// The distribution copy for each blog post.
//
// Kept out of lib/blog.ts on purpose: nothing in the app imports this file, so
// none of it reaches the browser. It is read by scripts/social.mjs, which
// prints a post's drafts ready to paste.
//
// Two rules decided how these are written.
//
// The thread is not the article cut into pieces. A thread that reads as an
// excerpt gets treated as an ad for a link, and the link is the part people
// skip. Each one here is complete on its own: someone who reads it and never
// clicks has still been given the whole argument. The link is the last post,
// where it costs nothing.
//
// The Reddit drafts carry no link at all. Every subreddit worth posting in
// filters domain links from low-karma accounts, and the ones that do not will
// have a moderator who does. The body is the whole thing, written as a comment
// from someone who makes videos rather than as a summary of a page elsewhere.
// If people ask, the link goes in a reply. That is slower and it is the only
// version of this that does not end in a shadowban.

export interface RedditDraft {
  /** Including the r/, as it is typed. */
  subreddit: string;
  title: string;
  body: string;
  /** What this sub will remove the post for, and anything to change before posting. */
  note: string;
}

export interface SocialDrafts {
  /** One string per post in the thread, in order. Each under 280 characters. */
  x: string[];
  reddit: RedditDraft[];
}

export const SOCIAL: Record<string, SocialDrafts> = {
  'youtube-shorts-view-jail': {
    x: [
      `Every Shorts channel hits a number it cannot get past. Same ceiling, upload after upload.

Creators call it view jail. It is not a penalty, and YouTube has never named it.

But the number itself is useful: it tells you which of three unrelated problems you have.`,

      `Stuck near zero, on everything you post.

That is almost never the video. When it happens to every upload, the common factor is the account, not the edit.

Bot-shaped behaviour: several uploads a day out of nowhere, re-ups with nothing done to them, scripts copied word for word.`,

      `Ten second check before you touch anything: open the video in Studio and read impressions, not views.

A video that failed got impressions and lost people.

A video in zero-view jail got almost no impressions. Completely different problem, completely different fix.`,

      `Dies at a few thousand.

This one was shown to real people and they left, which means you have actual evidence instead of a guess.

Open the retention curve. Vertical drop at the start is the opening. A step in the middle is one specific moment you can go and watch.`,

      `Caps out while holding everyone who watches.

Hardest of the three. The video works for people already watching this kind of thing, and gives the system no reason to try it on anyone else.

What works: run your subject through a format from a completely different niche.`,

      `Three things the ceiling does not tell you:

The number. It moves with channel size and niche. Someone else's 30k is not yours.

Whether you are penalised. There is no penalty to read.

Anything at all on a channel with three uploads. That is three videos, not a pattern.`,

      `And the part worth being blunt about: pausing uploads for 72 hours to "let the system reset" is a guess about internals nobody can see.

Costs you a week and changes nothing.

Longer version:
https://chumoku.co/blog/youtube-shorts-view-jail`,
    ],
    reddit: [
      {
        subreddit: 'r/NewTubers',
        title: 'The view count your Shorts keep stopping at tells you which problem you have',
        body: `Half the threads here are some version of "my Shorts get stuck at X views", and the answers are always the same general advice regardless of what X is. That is backwards. The number is the most useful thing in the post, because three completely different problems produce three different ceilings.

Worth saying up front: view jail is not a thing YouTube does. There are no documented tiers and no penalty by that name. It is creator shorthand for a pattern people see in their own analytics. The pattern is real. The explanations attached to it mostly are not.

**Stuck near zero, on everything you post.** Almost never the video. When it happens to every upload, the common factor is the account and how it uploads, not the edit. The behaviours behind it are the ones that look automated from outside: several uploads a day appearing suddenly on a channel that posted weekly, re-uploads with nothing done to them, scripts copied word for word off something that worked, bulk voiceover on stock footage. None of that gets judged on quality, it gets matched as a pattern, and the pattern is a bot.

There is a ten second check that separates this from a video that simply failed. Open the video in Studio and read **impressions**, not views. A failed video got impressions and lost people. This gets almost no impressions. Different problem, different fix, and people rewrite hooks for weeks without ever checking which one they have.

**Dies at a few thousand.** It was shown to real people and they left. This is the only ceiling where you have direct evidence instead of an inference. Open the retention curve: near-vertical drop at the very start is the opening, a step partway through is one specific moment you can go and watch, an even decline with no steps is normal and means the video was longer than its material. Do not read a curve built on a couple hundred views, that is noise with a line through it.

**Caps out while holding everyone who watches.** Retention is fine, people finish it, it still stops. The video works for people already watching this kind of thing and gives nothing to suggest a wider audience. The move that helps is taking a format that works in a totally unrelated niche and running your subject through it, so it is recognisable to someone who has never watched your niche.

I will be honest that this third one is the weakest section. "Be more distinctive" is the goal, not an instruction, and nobody has a checklist for it.

**What the ceiling does not tell you:** the exact number (it moves with channel size and niche, someone else's 30k is not yours), whether you are penalised (there is no visible penalty, and looking for one sends you appealing instead of fixing), and anything at all on a channel with three uploads.

One last thing. Pausing uploads for 48 to 72 hours to "let the system reset" gets repeated constantly and there is no evidence for it and no mechanism it could work through. It costs a week and changes nothing. If the upload behaviour was the problem, change the upload behaviour.`,
        note: 'No links, no channel name. This one is close to sub canon in places, which helps it land but means the comments will argue about the exact thresholds - agree with them, the whole point is that the number moves per channel. Do not defend the 30k figure as if it were fixed.',
      },
      {
        subreddit: 'r/PartneredYoutube',
        title: 'Impressions vs views is the first thing to check when Shorts stall, and almost nobody checks it',
        body: `Smaller point than the usual retention threads, but it decides which problem you are actually looking at, and I see people skip it constantly.

When a Short stalls there are two completely different failures that look identical from the views column.

One: it was shown and people left. Impressions are normal, views are a fraction of them, retention drops somewhere you can point at. This is a video problem and the retention curve tells you where.

Two: it was barely shown at all. Impressions are almost nothing. Nothing about the edit caused that, because nobody was offered it. This is an account or upload-behaviour problem, and rewriting the hook does nothing.

The first number to open is impressions, not views, and it takes ten seconds. If impressions are healthy and views are not, work on the video. If impressions never happened, the video is not the thing to work on.

Things that correlate with the second case, from watching it happen to other people and once to me: upload frequency jumping suddenly, re-uploading clips with no edit, scripts lifted word for word from something that went viral, bulk-generated voiceover on stock footage. Nothing there gets judged on whether it was good. It gets matched as a shape, and the shape is automation.

The thing I would push back on is the advice that always follows, which is to pause uploads for two or three days to let something reset. There is no published mechanism for that and no way to verify it. If the behaviour caused it, change the behaviour. Waiting and then repeating it is a week spent on nothing.`,
        note: 'This sub skews to people with real analytics access and low tolerance for algorithm folklore, so the narrow verifiable point lands better than the full three-tier post. Requires monetised status to post - check you qualify. No link.',
      },
    ],
  },

  'why-shorts-get-swiped': {
    x: [
      `A Short does not get swiped because it is bad.

It gets swiped because nothing was ever chosen.

On long-form the viewer read a title, saw a thumbnail, clicked. That buys your opening a few seconds of patience. A Short starts playing on its own. There is no patience to spend.`,

      `So the question the viewer is answering is not "is this worth continuing".

It is "is this better than whatever is one swipe away".

And it gets answered before most creators have finished their first sentence.`,

      `Four things that reliably spend those two seconds:

1. A wind-up. A logo sting, "hey guys", a slow zoom onto an empty frame.

2. A repeat. The caption already said what this is, and then the narration says it again.`,

      `3. A frame that looks like the last one. Shorts are watched in a run, so a generic opening frame reads as the video they just swiped away from.

4. A delayed subject. The thing it is about arrives at 0:04. Everything before that is a trailer for a video they are already leaving.`,

      `The fix is an editing decision, not a writing one.

Find the most specific frame in the footage, something that could not open anyone else's Short, and put it first. A strange object, a number, a face mid-reaction.

Then let the video explain itself backwards.`,

      `Before you change anything, check this is even your problem.

Studio, open the Short, audience retention. An opening problem has one shape: a near-vertical drop right at the start.

Flat at the start and dropping later means the hook is fine and you would fix the wrong thing.`,

      `Wrote the longer version, including the shapes the curve makes and the three conclusions it does not support:

https://chumoku.co/blog/why-shorts-get-swiped`,
    ],
    reddit: [
      {
        subreddit: 'r/NewTubers',
        title: 'Your Short is not getting swiped because it is bad, it is getting swiped because nothing was chosen',
        body: `Something that took me way too long to work out, putting it here because I keep seeing people apply long-form opening advice to Shorts and then wonder why it does nothing.

On a normal video the viewer already committed. They read the title, looked at the thumbnail, decided it was worth their time, clicked. That decision buys your first few seconds a bit of goodwill you did not have to earn.

A Short arrives with none of that. It starts playing on its own, in a stack of other videos, with a thumb hovering over the screen. Nothing was chosen. So the question is not "is this worth continuing", it is "is this better than whatever is one swipe away", and that gets answered before most of us have finished the first sentence.

Four things I notice eating those two seconds, in my own stuff and in other people's:

**A wind-up.** Logo sting, "hey guys", a slow zoom onto an empty frame, a beat of silence while the music comes in. None of it is information and all of it costs the same two seconds that information would.

**A repeat.** The on-screen text already told them what this is, then the narration tells them again. They have now been given the same fact twice and no reason to stay for a third.

**A frame that looks like the last one.** Shorts get watched in a run. A visually generic opening frame reads as the video they just swiped, and gets treated the same way.

**A delayed subject.** The thing the video is actually about turns up at four seconds. Everything before it is a trailer for a video they are already leaving.

What actually helped: find the single most specific frame in the footage, something that could not be the opening of anyone else's video, and put it first. Then let the video explain itself backwards.

And before changing anything, check it is your problem. Studio, open the Short, audience retention. A first-seconds problem has an unmistakable shape, a near-vertical drop right at the start. If the curve is flat at the start and drops later, your opening is fine and the problem is somewhere in the middle.`,
        note: 'No links, no channel name - this sub removes both on sight outside the weekly threads, and a removed post costs you the account more than the traffic was worth. Check the current rules before posting; they change. If someone asks what you use, answer in a reply.',
      },
      {
        subreddit: 'r/VideoEditing',
        title: 'Shorts openings are an editing problem, not a scripting one',
        body: `Mostly cut long-form, started doing vertical this year, and the thing that surprised me is how much of the "hook" is decided in the timeline rather than in the script.

The reason is structural. A long-form viewer picked the video off a thumbnail and a title before it started, so the opening is confirming a decision they already made and can afford to be a summary. A Short is already playing when they see it. The opening is making the decision, not confirming it, which means anything that is not information is dead weight.

So the passes that actually changed my retention were all cuts, not rewrites:

- Delete everything before the subject appears. Logo stings, the breath before the first word, the slow zoom on an empty frame.
- Find the most specific frame anywhere in the footage and move it to frame one. Specific meaning it could not open anyone else's video. A weird object, a number, a face mid-reaction, something breaking.
- Stop the on-screen text and the narration from saying the same sentence. Two channels, one piece of information, in the two seconds where you have the least room to waste it.
- Export, pause on frame one, look at it on its own. If it does not make you ask a question, the cut starts one edit too early.

The checkable part is that this has a signature in the data. Audience retention on a Short with an opening problem drops near-vertically at the very start and then settles into a normal decline. If your curve is flat at the start and steps down in the middle, the opening is fine and recutting it is wasted work.`,
        note: 'This sub is fine with craft posts and hostile to anything that reads as promotion. Keep it first-person about your own edits. Do not name a tool anywhere in the body.',
      },
    ],
  },

  'reading-a-shorts-retention-curve': {
    x: [
      `Most people read a Shorts retention curve wrong, and it is always the same mistake.

They read the average percentage. The average is the least useful number on that screen.

The shape is the thing. Two videos with an identical average can have completely different problems.`,

      `What the curve is: the share of views still playing at each position in the video.

It is a record of a crowd, not a person. A dip at 0:07 does not mean one viewer left at 0:07, it means a noticeable share of everyone who started stopped around there.`,

      `The shapes:

A cliff in the first second or two. The opening is the problem. Most common, most fixable.

A steady gentle decline. Normal. Not a defect. Every video loses people gradually, and the fix for this one is a shorter video, not a patched moment.`,

      `A step partway through. Something specific happened there. Go watch those two seconds. Usually a shot held too long, or a second idea starting before the first paid off.

A rise. People are rewatching. Shorts loop, and the loop counts. Whatever is there is the part that worked.`,

      `Yes, it can go over 100%.

That is not a glitch. Shorts loop, replays of a section count as views of that section, so a heavily rewatched moment can beat the number of people who ever started the video.

Read anything above the line as a marker, not a score.`,

      `What it cannot tell you:

Why. It shows where. The reason is in the footage at that timestamp.

Whether the video was good. It measures how the video held the people who saw it, not whether it reached anyone.

Anything about the algorithm. A bad curve is not a shadowban signal.`,

      `And it tells you nothing at all on a video with very few views. That is noise with a line drawn through it.

Full version, including where to find the curve and why no third-party tool can show you someone else's:

https://chumoku.co/blog/reading-a-shorts-retention-curve`,
    ],
    reddit: [
      {
        subreddit: 'r/NewTubers',
        title: 'How to actually read a Shorts retention curve (the average percentage is the least useful number on that screen)',
        body: `Every thread about retention turns into people comparing average view percentage, and I think that number is close to useless on Shorts. Two videos with the same average can have completely different problems and only one of them is fixable. The shape is the thing.

**What it is.** The horizontal axis is position in the video, not clock time for any one viewer. The vertical is the share of views still playing at that position. It is a record of a crowd, not of a person, which is exactly why it is worth acting on: one viewer leaving is noise, a step in the line is a repeatable reaction to something you can go and look at.

**The shapes.**

*A cliff in the first second or two.* The opening is the problem. Most common shape, and the most fixable.

*A steady gentle decline.* Normal. Every video loses people gradually. If it declines evenly with no steps, the video is working and the improvement is a shorter video, not a patched moment.

*A step partway through.* Something specific happened there. Go and watch those two seconds. Usually a shot held too long, a second idea starting before the first paid off, or the video visibly changing subject.

*A rise, or a section above where it started.* People are rewatching. Shorts loop by default and the loop counts. This is good news and worth understanding, because whatever is there is the part that worked.

**Over 100% is normal.** Replays of a section count as views of that section, so a heavily rewatched moment can exceed the number of unique people who started the video. Treat anything above the line as a marker of which two seconds people wanted again, not as a score.

**What it will not tell you.** Why (it shows where; the reason is in the footage at that timestamp). Whether the video was good (a high average on forty views has not been tested). Anything about the algorithm (retention shape is not a ranking signal, and treating a bad curve as the cause of low views is the fastest way to fix the wrong thing). And nothing at all on a video with very few views, where the curve is noise with a line drawn through it.

It is per video, in Studio, under the individual Short in the engagement section. There is no channel-level version that means anything, and it is not in the public API, so nobody can show you a competitor's real curve.`,
        note: 'Reference-style post, which this sub tolerates better than opinion. Still no links. If it does well, the follow-up question in the comments is always "what is a good percentage" - the honest answer is that it depends on length and only your own previous videos are a fair comparison.',
      },
      {
        subreddit: 'r/youtubers',
        title: 'Reminder that no tool can show you another channel’s retention curve',
        body: `Keeps coming up and it is worth being blunt about, because people are paying for it.

Audience retention is private analytics. It is available to the channel that owns the video, through Studio, or through the YouTube Analytics API with that channel's own permission. It is not in the public Data API. There is no endpoint for it, authorised or otherwise, that returns someone else's.

So when a tool shows you a competitor's retention curve, or their swipe-away rate, or "how long people watch their Shorts", it is estimating something from public view counts and calling it retention. Sometimes that estimate is a reasonable guess. It is not the curve, and it will not tell you the one thing the real curve tells you, which is the exact second a specific video lost people.

The version that does work: connect your own channel, read your own curves, and compare your videos against each other. Your last twenty uploads are a better benchmark than anyone else's channel anyway, because length, format and audience all move the number and none of those match between channels.

If you want a competitor signal that is real, use the public numbers that actually exist: views relative to that channel's own median, upload cadence, and which formats they repeat. Those are visible and they are not made up.`,
        note: 'This one is an opinion post and will attract disagreement from people selling those tools, which is fine. Do not name a specific competitor product - that turns it into a fight and gets it removed. No link.',
      },
    ],
  },

  'what-makes-a-shorts-hook-work': {
    x: [
      `A hook is not a topic sentence, and almost every failed opening is a topic sentence.

"Today I am going to show you three editing tricks" is accurate, clear, and closes. The viewer now knows what the video contains and can decide they do not need it.`,

      `"The third one broke my edit for two hours" is the same video, same information, arranged so the interesting part is withheld.

The difference is not cleverness or energy. It is whether the sentence leaves something unresolved.`,

      `The test, and it is the whole test:

Read your first line alone, with no video under it. What question does it make you want answered?

If there is no question, it is not a hook yet. It is a statement, and a complete thought gives nobody a reason to stay for the next one.`,

      `Second half of the test, which people skip: does the video actually answer that question, and soon?

A hook that opens a question the video never closes is worse than a weak one. People stay a little longer and leave annoyed, and annoyance costs you the next video too.`,

      `Openings that reliably fail:

The greeting. "Hey guys, welcome back" is addressed to people who already subscribed, in a feed full of people who have not.

The credential. Asking them to care who is talking before they care what is said.`,

      `The disclaimer. "This might not work for everyone, but" lowers the stakes of the thing you are about to say, in the two seconds where the stakes are all you have.

The question with an obvious answer. "Do you want more views?" is a question in grammar only. Nobody wants to know.`,

      `Which is also why a hook cannot be written last, as a lid put on a finished video.

The line that would hold a stranger is usually already in the middle of your footage. Finding it is an editing decision, not a writing one.

https://chumoku.co/blog/what-makes-a-shorts-hook-work`,
    ],
    reddit: [
      {
        subreddit: 'r/NewTubers',
        title: 'The difference between a hook and a first sentence, and the one test that separates them',
        body: `Most openings I see posted here are not badly written. They are statements. A statement is complete on its own, and someone who has just received a complete thought has no reason left to stay for the next one.

Compare:

"Today I am going to show you three editing tricks."

"The third one broke my edit for two hours."

Same video, same information. The first one closes: the viewer now knows what the video contains and can decide they do not need it. The second opens a question and withholds the interesting part. The difference is not cleverness or energy or delivery, it is whether the sentence leaves something unresolved.

**The test.** Read your first line alone, with no video under it, and ask what question it makes you want answered. If there is no question, it is not a hook yet.

**The half of the test people skip.** Then ask whether the video actually answers that question, and answers it soon. A hook that opens a question the video never closes is worse than a weak hook, because people stay a little longer and leave annoyed, and annoyance is the one reaction that costs you the next video as well.

**Openings that reliably fail:**

- The greeting. "Hey guys, welcome back" is addressed to people who already subscribed, in a feed full of people who have not.
- The credential. "As someone who has been doing this for six years" asks them to care who is talking before they have a reason to care what is said.
- The disclaimer. "This might not work for everyone, but" lowers the stakes of your own point in the two seconds where the stakes are all you have.
- The restatement. The on-screen text says it, then the narration says it again. Pick one and give the other something else to do.
- The question with an obvious answer. "Do you want more views?" is a question in grammar only.

One more thing. Most published hook advice was written for videos someone clicked on, where the hook is confirming a decision the viewer already made and can afford to be a summary. In a feed the hook is making the decision. That is why the templates transfer so badly, and why a perfectly good ten-minute opening reads as a stall on a thirty-second video.

It is also why you probably cannot write the hook last. The line that would hold a stranger is usually already sitting in the middle of your footage.`,
        note: 'Strongest of the three for this sub because it is concrete and people can test it on their own script in the comments. Expect "do hook formulas work" - the answer is they work as a start and fail as a finish, what survives is the specific detail inside the template.',
      },
      {
        subreddit: 'r/ContentCreators',
        title: 'Hook advice mostly transfers badly from long-form, here is why',
        body: `Something worth naming, because a lot of the advice passed around was written for a format it no longer describes.

On long-form, the viewer picked the video. They read a title, looked at a thumbnail, decided, clicked. By the time the video starts they have already committed, so the opening is confirming a decision rather than making one. In that context "set up the premise" and "tell them what the video will cover" are genuinely good advice.

In a feed nothing was picked. The video is already playing, the only two options are keep watching or swipe, and the opening is making the decision. Every technique that assumes prior commitment now costs you the exact seconds where you have none.

Practical consequences:

- A summary opening ("in this video I'll show you...") is a closing move. It hands over the whole point and gives no reason to stay.
- Warm-up beats that read as friendly on long-form - the greeting, the credential, the disclaimer - are all addressed to people who already decided to watch.
- Titles and captions do much less work than they do on long-form, because the video is playing before anyone reads them. The opening frame and the first line are doing the job a thumbnail and a title used to do.
- The hook usually cannot be written, only found. The line that holds a stranger tends to already exist somewhere in the middle of the footage.

The test I use on a first line: read it on its own, with no video under it, and see whether it makes you want to know something. If it does not, it is a topic sentence wearing a hook's clothes.`,
        note: 'Broader sub, mixed platforms, so this version stays platform-agnostic on purpose. Lower ceiling than r/NewTubers but much lower removal risk. No link.',
      },
    ],
  },
};
