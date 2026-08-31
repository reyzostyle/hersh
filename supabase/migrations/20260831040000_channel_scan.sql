-- What the creator SAYS about their channel already has four columns
-- (channel_niche, channel_description, channel_context, target_audience), all
-- typed in by hand. This adds what the channel actually IS: a periodic read of
-- their own YouTube - the channel description Google has, and the titles and
-- view counts of their last uploads.
--
-- The two disagree more often than you would think. People describe the
-- channel they mean to run, and the titles show the one they are running. An
-- angle written off the stated profile alone tends to miss the format the
-- audience actually turns up for, so the model gets both and is told which to
-- trust for what.
--
-- Cached rather than fetched per request: it is three YouTube reads, it barely
-- changes week to week, and the alternative is spending quota and a second of
-- latency on every single competitor breakdown.
ALTER TABLE user_tokens ADD COLUMN IF NOT EXISTS channel_scan jsonb;
ALTER TABLE user_tokens ADD COLUMN IF NOT EXISTS channel_scan_at timestamptz;
