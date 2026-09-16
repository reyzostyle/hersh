import { Client, Events, GatewayIntentBits, Partials } from 'discord.js';

// The Chumoku Discord bot. Only a connection: it listens, decides whether a
// message is for it, and hands the question to the discord-bot edge function,
// which holds the prompts and the model keys. See supabase/functions/discord-bot.

const {
  DISCORD_TOKEN,
  FUNCTION_URL,
  DISCORD_BOT_SECRET,
  BOT_CHANNEL_IDS = '',
  ASK_PER_DAY = '25',
  ANALYZE_PER_DAY = '2',
} = process.env;

for (const [k, v] of Object.entries({ DISCORD_TOKEN, FUNCTION_URL, DISCORD_BOT_SECRET })) {
  if (!v) { console.error(`Missing ${k}`); process.exit(1); }
}

const channels = new Set(BOT_CHANNEL_IDS.split(',').map(s => s.trim()).filter(Boolean));
const LIMITS = { ask: +ASK_PER_DAY, analyze: +ANALYZE_PER_DAY };
const CONTEXT_MESSAGES = 10;
const APP = 'https://chumoku.co';

// ─── Limits ──────────────────────────────────────────────────────────────────

// In memory, per member per UTC day. A restart forgives the day, which is
// cheaper than a table for a limit whose only job is stopping one person from
// burning the budget.
const usage = new Map();
const today = () => new Date().toISOString().slice(0, 10);

function take(userId, kind) {
  const key = `${today()}:${kind}:${userId}`;
  const n = usage.get(key) ?? 0;
  if (n >= LIMITS[kind]) return false;
  usage.set(key, n + 1);
  return true;
}
function giveBack(userId, kind) {
  const key = `${today()}:${kind}:${userId}`;
  usage.set(key, Math.max(0, (usage.get(key) ?? 1) - 1));
}
setInterval(() => {
  const d = today();
  for (const k of usage.keys()) if (!k.startsWith(d)) usage.delete(k);
}, 60 * 60 * 1000);

// One video at a time per member: a review takes a minute, and a second link
// pasted while waiting is almost always impatience, not a second request.
const reviewing = new Set();

// ─── Helpers ─────────────────────────────────────────────────────────────────

const YT_ID = /(?:youtube\.com\/(?:shorts\/|watch\?(?:.*&)?v=|live\/)|youtu\.be\/)([\w-]{11})/;

async function callFunction(payload) {
  const res = await fetch(FUNCTION_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-bot-secret': DISCORD_BOT_SECRET },
    body: JSON.stringify(payload),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.error || `HTTP ${res.status}`);
    err.code = data.error;
    throw err;
  }
  return data;
}

// Discord caps a message at 2000 characters. Split on line breaks so a list
// item is never cut in half.
function chunks(text, max = 1900) {
  const out = [];
  let cur = '';
  for (const line of text.split('\n')) {
    if ((cur + '\n' + line).length > max && cur) { out.push(cur); cur = ''; }
    cur = cur ? `${cur}\n${line}` : line;
    while (cur.length > max) { out.push(cur.slice(0, max)); cur = cur.slice(max); }
  }
  if (cur) out.push(cur);
  return out;
}

async function send(message, text, ping = false) {
  const parts = chunks(text);
  await message.reply({ content: parts[0], allowedMentions: { repliedUser: ping } });
  for (const p of parts.slice(1)) await message.channel.send({ content: p, allowedMentions: { parse: [] } });
}

// Typing lasts ten seconds; a review takes a minute.
function keepTyping(channel) {
  channel.sendTyping().catch(() => {});
  const t = setInterval(() => channel.sendTyping().catch(() => {}), 8000);
  return () => clearInterval(t);
}

const nameOf = (m) => m.member?.displayName ?? m.author.globalName ?? m.author.username;

// What was being talked about. The recent channel, plus the message being
// replied to if it has scrolled out of that window. This is the whole
// difference between answering "how common is this?" and asking what "this" is.
async function contextFor(message, botId) {
  const lines = [];
  try {
    const recent = await message.channel.messages.fetch({ limit: CONTEXT_MESSAGES, before: message.id });
    const list = [...recent.values()].reverse();
    if (message.reference?.messageId && !recent.has(message.reference.messageId)) {
      const ref = await message.fetchReference().catch(() => null);
      if (ref) list.unshift(ref);
    }
    for (const m of list) {
      const text = m.content?.trim();
      if (!text) continue;
      lines.push({ author: nameOf(m), text: text.slice(0, 800), bot: m.author.id === botId });
    }
  } catch { /* no history permission: answer the message alone */ }
  return lines;
}

function formatReview(r) {
  const out = [];
  out.push(`**${r.score}**/100${r.title ? ` · ${r.title}` : ''}`);
  if (r.assessment) out.push('', r.assessment.trim());
  if (r.strong?.length) out.push('', '**working**', ...r.strong.map(s => `- ${s}`));
  if (r.weak?.length) out.push('', '**fix**', ...r.weak.map(s => `- ${s}`));
  if (r.answer) out.push('', r.answer);
  out.push('', `-# every fix with timestamps, plus your real retention curve: <${APP}>`);
  return out.join('\n');
}

// ─── Bot ─────────────────────────────────────────────────────────────────────

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
  partials: [Partials.Channel],
});

client.once(Events.ClientReady, (c) => {
  console.log(`Logged in as ${c.user.tag}, answering everything in ${channels.size} channel(s)`);
});

client.on(Events.MessageCreate, async (message) => {
  if (message.author.bot || !message.guild) return;

  const botId = client.user.id;
  const channelId = message.channel.isThread() ? message.channel.parentId : message.channelId;
  const mentioned = message.mentions.users.has(botId);
  const repliedToBot = message.mentions.repliedUser?.id === botId;
  if (!channels.has(channelId) && !mentioned && !repliedToBot) return;

  const text = message.content.replace(new RegExp(`<@!?${botId}>`, 'g'), '').trim();
  if (!text) return;

  const userId = message.author.id;
  const videoId = text.match(YT_ID)?.[1];

  if (videoId) {
    if (reviewing.has(userId)) {
      return send(message, "still watching your last one, give me a sec");
    }
    if (!take(userId, 'analyze')) {
      return send(message, `that's your ${LIMITS.analyze} reviews for today. resets at 00:00 utc, or run it now in <${APP}>`);
    }
    reviewing.add(userId);
    const stop = keepTyping(message.channel);
    try {
      const question = text.replace(/\S*(?:youtube\.com|youtu\.be)\S*/g, '').trim();
      const r = await callFunction({ kind: 'analyze', videoId, question, author: nameOf(message) });
      await send(message, formatReview(r), true);
    } catch (e) {
      giveBack(userId, 'analyze');
      if (e.code === 'not_short') await send(message, "that one's longer than 3 minutes. i only review shorts");
      else if (e.code === 'bad_video') await send(message, "couldn't read that link. send the youtube shorts url");
      else {
        console.error('[analyze]', e);
        await send(message, "couldn't watch that one. if it's private, age-restricted or brand new, try again in a bit");
      }
    } finally {
      stop();
      reviewing.delete(userId);
    }
    return;
  }

  if (!take(userId, 'ask')) {
    return send(message, `you've hit today's ${LIMITS.ask} questions. back at 00:00 utc`);
  }
  const stop = keepTyping(message.channel);
  try {
    const context = await contextFor(message, botId);
    const { answer } = await callFunction({ kind: 'ask', question: text, context, author: nameOf(message) });
    await send(message, answer || "blanked on that one, ask again?");
  } catch (e) {
    giveBack(userId, 'ask');
    console.error('[ask]', e);
    await send(message, 'something broke on my end, try again in a minute');
  } finally {
    stop();
  }
});

client.login(DISCORD_TOKEN);
