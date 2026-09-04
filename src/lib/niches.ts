// The niches this product is actually used in, as a fixed list.
//
// It was Finance, Fitness, Education, Tech, Gaming, Beauty, Food, Comedy,
// Motivation, Business, Travel, Lifestyle - the categories a personal brand
// picks from. The people here run monetised Shorts channels in ranking,
// Minecraft, Roblox and commentary, and none of those had a chip, so the first
// question the product ever asks had no right answer in it.
//
// Fixed, and shared by onboarding and settings, because it is also the key a
// benchmark groups by. Someone posting one video every other day has fifteen
// data points a month and cannot tell a bad week from a bad video on their own;
// the comparison has to come from everyone else in the same niche. Free text
// cannot be grouped, so a typed niche is a user with no benchmark.
export const NICHES = [
  'Ranking', 'Minecraft', 'Roblox', 'Commentary',
  'Gaming', 'Anime', 'Reddit', 'Facts',
  'Motivation', 'Sports', 'Movies', 'Memes',
] as const;

export type Niche = typeof NICHES[number];

// Stored niches are a comma-joined string, and always have been. Reading them
// back has to survive whatever is already in there, including the old presets
// and free text somebody typed.
export const parseNiches = (raw: string | null | undefined): string[] =>
  (raw ?? '').split(',').map(s => s.trim()).filter(Boolean);

export const joinNiches = (parts: string[]): string => parts.join(', ');
