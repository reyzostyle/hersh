-- Ideas for you, not other people's titles (2026-09-30).
--
-- The feed used to show a competitor's video title and nothing else, so a
-- creator could not tell whether a card was an idea for THEM until they paid a
-- credit to read it. `pitch` is one line saying what their version would be,
-- and `fit` is whether it suits their channel. Both are written by one cheap
-- batch call over the titles (pitch-ideas), before anyone pays for anything.
-- The paid read still writes concept / adapted_idea as before.
ALTER TABLE competitor_ideas ADD COLUMN IF NOT EXISTS pitch text;
ALTER TABLE competitor_ideas ADD COLUMN IF NOT EXISTS fit text
  CHECK (fit IS NULL OR fit IN ('yes', 'stretch', 'no'));
