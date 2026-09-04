// The niches this product is used in, as a fixed list.
//
// It was Finance, Fitness, Education, Tech, Gaming, Beauty, Food, Comedy,
// Motivation, Business, Travel, Lifestyle - what a personal brand picks from,
// with nothing for the ranking, Minecraft, Roblox and commentary channels that
// are the core of who is here. Replacing it with only those was the same
// mistake pointed the other way: a fitness creator then had no chip either.
// Both halves are on the list, the Shorts ones first.
//
// Fixed, and shared by onboarding and settings, because it is also the key a
// benchmark groups by. Someone posting one video every other day has fifteen
// data points a month and cannot tell a bad week from a bad video on their
// own, so the comparison has to come from everyone else in the same niche, and
// free text groups with nothing. The description field stays for the detail.
//
// 12 keeps the grid whole at 3 across on a phone and 4 on a desktop, and short
// enough to read at a glance. Coarse on purpose: it only has to be good enough
// to group a benchmark by, and the description field takes the detail.
export const NICHES = [
  'Ranking', 'Minecraft', 'Roblox', 'Commentary',
  'Gaming', 'Anime', 'Reddit', 'Facts',
  'Motivation', 'Sports', 'Fitness', 'Finance',
] as const;

export type Niche = typeof NICHES[number];

// Stored niches are a comma-joined string, and always have been. Reading them
// back has to survive whatever is already in there, including the old presets
// and free text somebody typed.
export const parseNiches = (raw: string | null | undefined): string[] =>
  (raw ?? '').split(',').map(s => s.trim()).filter(Boolean);

export const joinNiches = (parts: string[]): string => parts.join(', ');
