-- Create the known-faces storage bucket for face photo uploads
-- Used by FaceLibrary.tsx to store person photos for AI face recognition

-- 1. Create the bucket (public so AI server can download photos via URL)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'known-faces',
  'known-faces',
  true,
  10485760,  -- 10 MB per file
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif']
)
ON CONFLICT (id) DO NOTHING;

-- 2. Allow authenticated users to upload to known-faces bucket
CREATE POLICY "Authenticated upload to known-faces"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'known-faces');

-- 3. Allow public read access so the AI server can fetch photos by URL
CREATE POLICY "Public read from known-faces"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'known-faces');

-- 4. Allow authenticated users to delete their uploaded photos
CREATE POLICY "Authenticated delete from known-faces"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (bucket_id = 'known-faces');
