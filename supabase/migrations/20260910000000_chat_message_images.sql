-- Screenshots sent into a conversation, kept.
--
-- A message could always carry up to four screenshots, and they were never
-- stored: the thread kept "[screenshot]" and the reply, so a reopened
-- conversation had the reasoning without the evidence. For this product that
-- is the half worth keeping - a Studio retention curve IS the question.
--
-- Two additive changes, both safe to run twice: a private bucket for the
-- files and a column on chat_messages holding their storage paths. The client
-- reads chat_messages with select('*') and treats a missing `images` as none,
-- so it keeps working on a database where this has not been applied yet.

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'chat-images',
  'chat-images',
  false,
  5242880,
  ARRAY['image/png', 'image/jpeg', 'image/webp']
) ON CONFLICT (id) DO NOTHING;

-- Same shape as the video-uploads policies: the first folder of the path is
-- the owner's id, so a user can only ever reach their own files.
DROP POLICY IF EXISTS "Users upload own chat images" ON storage.objects;
CREATE POLICY "Users upload own chat images"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'chat-images'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

DROP POLICY IF EXISTS "Users read own chat images" ON storage.objects;
CREATE POLICY "Users read own chat images"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'chat-images'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

DROP POLICY IF EXISTS "Users delete own chat images" ON storage.objects;
CREATE POLICY "Users delete own chat images"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'chat-images'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

-- Storage paths, not URLs. The bucket is private, so what gets rendered is a
-- signed URL made at read time; a stored URL would be a dead link an hour
-- later.
ALTER TABLE chat_messages ADD COLUMN IF NOT EXISTS images text[];
