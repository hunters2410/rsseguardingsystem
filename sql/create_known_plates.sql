-- ==============================================================================
-- Table: known_plates (Visual Plate Memory & Learning Library)
-- Allows the AI engine to remember verified plates and match them by image hash
-- ==============================================================================

CREATE TABLE IF NOT EXISTS public.known_plates (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  plate_text TEXT NOT NULL UNIQUE,
  image_hash TEXT NOT NULL,
  camera_id UUID REFERENCES public.cameras(id) ON DELETE SET NULL,
  source TEXT DEFAULT 'auto', -- 'auto', 'gemini', 'easyocr', 'manual_correction'
  times_seen INT DEFAULT 1,
  last_seen TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
  created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Index for fast lookup by plate_text and last_seen
CREATE INDEX IF NOT EXISTS idx_known_plates_text ON public.known_plates(plate_text);
CREATE INDEX IF NOT EXISTS idx_known_plates_last_seen ON public.known_plates(last_seen DESC);

-- Enable RLS and permissive policy
ALTER TABLE public.known_plates ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all access to known_plates" ON public.known_plates;
CREATE POLICY "Allow all access to known_plates" ON public.known_plates FOR ALL USING (true) WITH CHECK (true);
