// Prints a blog post's social drafts, ready to paste.
//
//   npm run social                            list the posts
//   npm run social why-shorts-get-swiped      that post's thread and Reddit drafts
//   npm run social why-shorts-get-swiped x    just the thread
//
// It also checks the lengths, because a thread that has to be edited in the
// compose box stops being a draft. X is checked at 280 with URLs counted as 23
// characters, which is what t.co wrapping makes any link cost regardless of how
// long it is. Reddit titles are checked at 300.
//
// Imports the TypeScript source directly: Node strips the types on the way in,
// so there is no build step between writing a draft and reading it back.
import { POSTS } from '../src/lib/blog.ts';
import { SOCIAL } from '../src/lib/social.ts';

const X_LIMIT = 280;
const X_URL_COST = 23;
const REDDIT_TITLE_LIMIT = 300;

const dim = s => `\x1b[2m${s}\x1b[0m`;
const bold = s => `\x1b[1m${s}\x1b[0m`;
const red = s => `\x1b[31m${s}\x1b[0m`;
const green = s => `\x1b[32m${s}\x1b[0m`;
const yellow = s => `\x1b[33m${s}\x1b[0m`;

/** X counts every link as 23 characters, however long it is. */
const xLength = text => text.replace(/https?:\/\/\S+/g, 'x'.repeat(X_URL_COST)).length;

const rule = label => dim('-'.repeat(8) + (label ? ` ${label} ` : ' ') + '-'.repeat(Math.max(0, 60 - label.length)));

const [slug, only] = process.argv.slice(2);

if (!slug) {
  console.log(`\n${bold('Posts')}\n`);
  for (const p of POSTS) {
    const drafts = SOCIAL[p.slug];
    const state = drafts
      ? green(`${drafts.x.length} posts in thread, ${drafts.reddit.length} Reddit drafts`)
      : red('no drafts written');
    console.log(`  ${bold(p.slug)}\n    ${dim(p.h1)}\n    ${state}\n`);
  }
  console.log(dim('  npm run social <slug>       everything for that post'));
  console.log(dim('  npm run social <slug> x     just the thread'));
  console.log(dim('  npm run social <slug> reddit  just the Reddit drafts\n'));
  process.exit(0);
}

const post = POSTS.find(p => p.slug === slug);
if (!post) {
  console.error(red(`\nNo post with slug "${slug}".`));
  console.error(dim(`Known slugs: ${POSTS.map(p => p.slug).join(', ')}\n`));
  process.exit(1);
}

const drafts = SOCIAL[slug];
if (!drafts) {
  console.error(red(`\n"${slug}" has no drafts in src/lib/social.ts yet.\n`));
  process.exit(1);
}

let problems = 0;

console.log(`\n${bold(post.h1)}`);
console.log(dim(`https://chumoku.co/blog/${post.slug}`));

if (only !== 'reddit') {
  console.log(`\n${rule('X thread')}\n`);
  drafts.x.forEach((text, i) => {
    const n = xLength(text);
    const over = n > X_LIMIT;
    if (over) problems++;
    const count = `${n}/${X_LIMIT}`;
    console.log(dim(`[${i + 1}/${drafts.x.length}]`) + '  ' + (over ? red(count + ' OVER') : dim(count)));
    console.log(text);
    console.log('');
  });
}

if (only !== 'x') {
  console.log(`\n${rule('Reddit')}\n`);
  drafts.reddit.forEach(r => {
    const over = r.title.length > REDDIT_TITLE_LIMIT;
    if (over) problems++;
    console.log(bold(r.subreddit) + '  ' + (over ? red(`title ${r.title.length}/${REDDIT_TITLE_LIMIT} OVER`) : dim(`title ${r.title.length}/${REDDIT_TITLE_LIMIT}`)));
    console.log(bold(r.title));
    console.log('');
    console.log(r.body);
    console.log('');
    console.log(yellow('  ! ' + r.note));
    console.log('');
  });

  console.log(dim(`  Post one of these at a time, days apart, from an account that has been`));
  console.log(dim(`  commenting in the sub already. Read the sub's rules the day you post them:`));
  console.log(dim(`  the self-promotion line moves and a removal costs more than the traffic.`));
  console.log('');
}

if (problems) {
  console.error(red(`${problems} draft${problems === 1 ? '' : 's'} over the limit - fix them in src/lib/social.ts.\n`));
  process.exit(1);
}
