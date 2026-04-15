-- Create temporary video uploads bucket
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'video-uploads',
  'video-uploads',
  false,
  209715200,
  ARRAY['video/mp4', 'video/quicktime', 'video/webm', 'video/x-msvideo', 'video/mpeg', 'video/mov']
) ON CONFLICT (id) DO NOTHING;

-- Users can upload their own files
CREATE POLICY "Users upload own video files"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'video-uploads'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

-- Users can read their own files
CREATE POLICY "Users read own video files"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'video-uploads'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

-- Users can delete their own files
CREATE POLICY "Users delete own video files"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'video-uploads'
  AND (storage.foldername(name))[1] = auth.uid()::text
);
