-- The language a creator reads Chumoku in: 'en', 'es', 'pt', 'fr', 'de',
-- 'ja' or 'ru' (supabase/functions/_shared/language.ts). Null means English. The iOS
-- app writes it from the phone's language until they choose one in Settings,
-- so it is one of the columns a client may write.
ALTER TABLE public.user_tokens ADD COLUMN IF NOT EXISTS language text;
GRANT UPDATE (language) ON public.user_tokens TO authenticated;
