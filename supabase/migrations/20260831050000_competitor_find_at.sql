-- Rate-limit stamp for auto-find.
--
-- A single auto-find costs 100 units of the project's daily 10,000 YouTube
-- quota, because search.list is priced a hundred times a normal read. That is
-- a hard ceiling of ~100 searches a day across ALL users, so this is not the
-- usual "stop people spamming a button" throttle - without it, a dozen users
-- clicking around in one afternoon can exhaust the day's quota for everyone,
-- including the ordinary feed refreshes that cost 3 units each.
ALTER TABLE user_tokens ADD COLUMN IF NOT EXISTS competitor_find_at timestamptz;
