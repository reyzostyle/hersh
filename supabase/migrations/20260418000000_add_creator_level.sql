ALTER TABLE user_tokens ADD COLUMN IF NOT EXISTS creator_level text DEFAULT 'intermediate';
